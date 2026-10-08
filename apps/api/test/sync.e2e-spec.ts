import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { addDays, today } from '../src/domain/dates.js';
import type { Transaction } from '../src/domain/finance.js';
import { SyncService } from '../src/sync/sync.service.js';
import { createTestApp, resetDatabase } from './app.js';
import { InMemoryProvider } from './in-memory-provider.js';

const day = (offset: number) => addDays(today('America/Sao_Paulo'), offset);

const tx = (
  externalId: string,
  accountExternalId: string,
  date: string,
  amount: number,
  extra: Partial<Transaction> = {},
): Transaction => ({
  externalId,
  accountExternalId,
  date,
  description: externalId,
  amount,
  status: 'POSTED',
  category: null,
  paymentMethod: null,
  counterpartyName: null,
  installment: null,
  invoiceExternalId: null,
  ...extra,
});

function seed(provider: InMemoryProvider) {
  provider.connections = [
    {
      externalId: 'item-1',
      institutionName: 'Banco Teste',
      institutionLogoUrl: null,
      status: 'ACTIVE',
      lastRefreshedAt: new Date('2026-10-07T10:00:00Z'),
    },
  ];
  provider.accounts = [
    {
      externalId: 'checking',
      connectionExternalId: 'item-1',
      type: 'CHECKING',
      name: 'Conta',
      number: '1',
      currency: 'BRL',
      balance: 100_00,
      creditLimit: null,
      availableCredit: null,
    },
    {
      externalId: 'card',
      connectionExternalId: 'item-1',
      type: 'CREDIT_CARD',
      name: 'Cartão',
      number: '2',
      currency: 'BRL',
      balance: 500_00,
      creditLimit: 5_000_00,
      availableCredit: 4_500_00,
    },
  ];
  provider.transactions = [
    tx('salario', 'checking', day(-20), 9_000_00, { description: 'Salário' }),
    tx('terreno', 'checking', day(-10), -2_300_00, { description: 'Parcela terreno' }),
    tx('pendente', 'card', day(-1), -45_90, { status: 'PENDING' }),
    tx('parcelado', 'card', day(-5), -450_00, {
      installment: { number: 3, total: 10 },
      invoiceExternalId: 'bill-1',
    }),
  ];
  provider.invoices = [
    {
      externalId: 'bill-1',
      accountExternalId: 'card',
      dueDate: day(10),
      closingDate: day(3),
      total: 500_00,
      minimumPayment: 75_00,
      currency: 'BRL',
    },
  ];
}

describe('Sincronização (e2e)', () => {
  let app: INestApplication;
  let provider: InMemoryProvider;
  let sync: SyncService;

  beforeAll(async () => {
    provider = new InMemoryProvider();
    app = await createTestApp(provider);
    sync = app.get(SyncService);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    provider.transactionCalls.length = 0;
    provider.failingAccounts.clear();
    provider.pause = undefined;
    seed(provider);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('grava os dados do provedor e expõe pela API', async () => {
    const run = await sync.run('MANUAL');

    expect(run).toMatchObject({
      status: 'SUCCEEDED',
      provider: 'test',
      stats: {
        connections: 1,
        accounts: 2,
        transactions: 4,
        removedPendingTransactions: 0,
        invoices: 1,
      },
    });

    const connections = await http().get('/connections').expect(200);
    expect(connections.body).toEqual([
      expect.objectContaining({ institutionName: 'Banco Teste', status: 'ACTIVE' }),
    ]);

    const accounts = await http().get('/accounts').expect(200);
    expect(
      accounts.body.map((a: { name: string; balance: number }) => [a.name, a.balance]),
    ).toEqual([
      ['Conta', 100_00],
      ['Cartão', 500_00],
    ]);

    const transactions = await http().get('/transactions').expect(200);
    expect(transactions.body.total).toBe(4);
    expect(transactions.body.items.map((t: { description: string }) => t.description)).toEqual([
      'pendente',
      'parcelado',
      'Parcela terreno',
      'Salário',
    ]);
    expect(transactions.body.items[1]).toMatchObject({
      amount: -450_00,
      installment: { number: 3, total: 10 },
      invoiceExternalId: 'bill-1',
    });

    const checking = accounts.body.find((a: { type: string }) => a.type === 'CHECKING');
    const filtered = await http()
      .get('/transactions')
      .query({ accountId: checking.id, from: day(-15) })
      .expect(200);
    expect(filtered.body.items.map((t: { description: string }) => t.description)).toEqual([
      'Parcela terreno',
    ]);

    const invoices = await http().get('/invoices').expect(200);
    expect(invoices.body).toEqual([
      expect.objectContaining({ dueDate: day(10), total: 500_00, minimumPayment: 75_00 }),
    ]);
  });

  it('é idempotente e reflete mudanças, removendo pendentes que sumiram', async () => {
    await sync.run('MANUAL');

    provider.accounts[0]!.balance = 250_00;
    // A compra pendente foi efetivada com outro id.
    provider.transactions = provider.transactions
      .filter((t) => t.externalId !== 'pendente')
      .concat(tx('efetivada', 'card', day(-1), -45_90));

    const second = await sync.run('MANUAL');

    expect(second.stats).toMatchObject({ removedPendingTransactions: 1 });
    const accounts = await http().get('/accounts').expect(200);
    expect(accounts.body[0].balance).toBe(250_00);
    const transactions = await http().get('/transactions').expect(200);
    expect(transactions.body.total).toBe(4);
    expect(transactions.body.items.map((t: { description: string }) => t.description)).toContain(
      'efetivada',
    );
    expect(
      transactions.body.items.map((t: { description: string }) => t.description),
    ).not.toContain('pendente');
  });

  it('busca o histórico na primeira vez e depois só a janela incremental', async () => {
    await sync.run('MANUAL');
    await sync.run('MANUAL');

    const checkingCalls = provider.transactionCalls.filter((c) => c.accountId === 'checking');
    expect(checkingCalls.map((c) => c.range)).toEqual([
      { from: day(-365), to: day(0) },
      { from: day(-7), to: day(0) },
    ]);
  });

  it('mantém transações efetivadas que saíram da janela consultada', async () => {
    await sync.run('MANUAL');
    provider.transactions = provider.transactions.filter((t) => t.externalId !== 'salario');

    await sync.run('MANUAL');

    const transactions = await http().get('/transactions').query({ search: 'salário' }).expect(200);
    expect(transactions.body.total).toBe(1);
  });

  it('isola a falha de uma conta e marca a execução como parcial', async () => {
    provider.failingAccounts.add('card');

    const run = await sync.run('MANUAL');

    expect(run.status).toBe('PARTIAL');
    expect(run.errors).toEqual(['Transações de "Cartão": banco fora do ar']);
    expect(run.stats).toMatchObject({ transactions: 2, invoices: 1 });
    const accounts = await http().get('/accounts').expect(200);
    const card = accounts.body.find((a: { type: string }) => a.type === 'CREDIT_CARD');
    expect(card.transactionsSyncedThrough).toBeNull();
  });

  it('marca a execução como falha quando o provedor está fora', async () => {
    vi.spyOn(provider, 'getConnections').mockRejectedValueOnce(new Error('Pluggy fora do ar'));

    const run = await sync.run('MANUAL');

    expect(run).toMatchObject({ status: 'FAILED', errors: ['Pluggy fora do ar'] });
    const runs = await http().get('/sync/runs').expect(200);
    expect(runs.body).toEqual([expect.objectContaining({ id: run.id, status: 'FAILED' })]);
  });

  it('dispara sob demanda e recusa uma segunda sincronização simultânea', async () => {
    let resume!: () => void;
    provider.pause = new Promise((resolve) => (resume = resolve));

    const started = await http().post('/sync').expect(202);
    expect(started.body).toMatchObject({ status: 'RUNNING', trigger: 'MANUAL' });
    await http().post('/sync').expect(409);

    resume();
    await sync.waitForIdle();
    const runs = await http().get('/sync/runs').expect(200);
    expect(runs.body).toEqual([
      expect.objectContaining({ id: started.body.id, status: 'SUCCEEDED' }),
    ]);
  });

  it('escapa curingas na busca', async () => {
    provider.transactions.push(
      tx('desconto', 'checking', day(-2), -10_00, { description: '50% off' }),
    );
    provider.transactions.push(
      tx('outro', 'checking', day(-3), -10_00, { description: '500 reais' }),
    );
    await sync.run('MANUAL');

    const result = await http().get('/transactions').query({ search: '50%' }).expect(200);
    expect(result.body.items.map((t: { description: string }) => t.description)).toEqual([
      '50% off',
    ]);
  });
});
