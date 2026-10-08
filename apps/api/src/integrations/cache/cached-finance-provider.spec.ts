import type { FinanceProvider } from '../finance-provider.js';
import { CachedFinanceProvider } from './cached-finance-provider.js';

function innerProvider() {
  return {
    name: 'inner',
    getProfile: vi.fn(),
    getConnections: vi.fn(),
    getAccounts: vi.fn(async () => []),
    getTransactions: vi.fn(async () => []),
    getInvoices: vi.fn(async () => []),
  } satisfies FinanceProvider;
}

describe('CachedFinanceProvider', () => {
  it('reaproveita a resposta dentro do TTL e busca de novo depois', async () => {
    let now = 0;
    const inner = innerProvider();
    const cached = new CachedFinanceProvider(inner, 1_000, () => now);

    await cached.getAccounts();
    await cached.getAccounts();
    expect(inner.getAccounts).toHaveBeenCalledTimes(1);

    now = 1_000;
    await cached.getAccounts();
    expect(inner.getAccounts).toHaveBeenCalledTimes(2);
  });

  it('compartilha a chamada em voo', async () => {
    const inner = innerProvider();
    const cached = new CachedFinanceProvider(inner, 1_000);

    await Promise.all([cached.getAccounts(), cached.getAccounts()]);

    expect(inner.getAccounts).toHaveBeenCalledTimes(1);
  });

  it('separa o cache pelos argumentos', async () => {
    const inner = innerProvider();
    const cached = new CachedFinanceProvider(inner, 1_000);
    const range = { from: '2026-01-01', to: '2026-01-31' };

    await cached.getTransactions('a', range);
    await cached.getTransactions('b', range);
    await cached.getTransactions('a', { ...range, to: '2026-02-28' });

    expect(inner.getTransactions).toHaveBeenCalledTimes(3);
  });

  it('não guarda falhas', async () => {
    const inner = innerProvider();
    inner.getAccounts.mockRejectedValueOnce(new Error('fora do ar'));
    const cached = new CachedFinanceProvider(inner, 1_000);

    await expect(cached.getAccounts()).rejects.toThrow('fora do ar');
    await expect(cached.getAccounts()).resolves.toEqual([]);
    expect(inner.getAccounts).toHaveBeenCalledTimes(2);
  });

  it('expõe o nome do provedor original', () => {
    expect(new CachedFinanceProvider(innerProvider(), 1).name).toBe('inner');
  });
});
