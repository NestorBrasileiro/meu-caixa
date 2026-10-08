import type { PluggyClient } from './pluggy.client.js';
import { PluggyProvider } from './pluggy.provider.js';
import type { PluggyTransaction } from './pluggy.schemas.js';

const tx = (id: string, date: string): PluggyTransaction => ({
  id,
  accountId: 'acc-1',
  date,
  description: id,
  type: 'DEBIT',
  amount: -1,
});

describe('PluggyProvider', () => {
  it('amplia a janela consultada e recorta pelo dia local', async () => {
    const listTransactions = vi.fn(async () => [
      tx('antes', '2026-09-01T02:59:00.000Z'), // 31/08 em São Paulo
      tx('inicio', '2026-09-01T03:00:00.000Z'),
      tx('fim', '2026-09-30T23:00:00.000Z'),
      tx('depois', '2026-10-01T03:00:00.000Z'),
    ]);
    const client = { listTransactions } as unknown as PluggyClient;
    const provider = new PluggyProvider(client, {
      itemIds: ['item-1'],
      timeZone: 'America/Sao_Paulo',
    });

    const result = await provider.getTransactions('acc-1', {
      from: '2026-09-01',
      to: '2026-09-30',
    });

    expect(listTransactions).toHaveBeenCalledWith('acc-1', {
      dateFrom: '2026-08-31',
      dateTo: '2026-10-01',
    });
    expect(result.map((t) => t.externalId)).toEqual(['inicio', 'fim']);
  });

  it('busca contas de todos os items configurados', async () => {
    const listAccounts = vi.fn(async (itemId: string) => [
      {
        id: `${itemId}-acc`,
        itemId,
        type: 'BANK',
        subtype: 'CHECKING_ACCOUNT',
        name: 'Conta',
        balance: 1,
      },
    ]);
    const client = { listAccounts } as unknown as PluggyClient;
    const provider = new PluggyProvider(client, { itemIds: ['a', 'b'], timeZone: 'UTC' });

    const accounts = await provider.getAccounts();

    expect(accounts.map((a) => [a.externalId, a.connectionExternalId])).toEqual([
      ['a-acc', 'a'],
      ['b-acc', 'b'],
    ]);
  });

  it('usa o primeiro item que tiver dados cadastrais', async () => {
    const getIdentity = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ fullName: 'Pessoa', document: '1' });
    const provider = new PluggyProvider({ getIdentity } as unknown as PluggyClient, {
      itemIds: ['a', 'b'],
      timeZone: 'UTC',
    });

    await expect(provider.getProfile()).resolves.toEqual({
      fullName: 'Pessoa',
      document: '1',
      email: null,
    });
  });
});
