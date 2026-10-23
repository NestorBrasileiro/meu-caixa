import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { syncRuns } from '../src/database/schema.js';
import { addDays, today } from '../src/domain/dates.js';
import type { Loan } from '../src/domain/finance.js';
import type { LoanDto } from '../src/loans/loan.dto.js';
import { SyncService } from '../src/sync/sync.service.js';
import { createTestApp, resetDatabase } from './app.js';
import { InMemoryProvider } from './in-memory-provider.js';

const day = (offset: number) => addDays(today('America/Sao_Paulo'), offset);

const loan = (externalId: string, extra: Partial<Loan> = {}): Loan => ({
  externalId,
  connectionExternalId: 'item-1',
  productName: externalId,
  type: null,
  contractNumber: null,
  contractedAmount: null,
  outstandingBalance: null,
  currency: 'BRL',
  contractDate: null,
  finalDueDate: null,
  firstInstallmentDueDate: null,
  periodicity: null,
  periodicityLabel: null,
  installments: { total: null, paid: null, remaining: null, overdue: null },
  installmentAmount: null,
  scheduledInstallments: [],
  interestRateAnnual: null,
  cetAnnual: null,
  ...extra,
});

function seed(provider: InMemoryProvider) {
  provider.connections = [
    {
      externalId: 'item-1',
      institutionName: 'Banco Teste',
      institutionLogoUrl: null,
      status: 'ACTIVE',
      lastRefreshedAt: null,
    },
    {
      externalId: 'item-2',
      institutionName: 'Outro Banco',
      institutionLogoUrl: null,
      status: 'ACTIVE',
      lastRefreshedAt: null,
    },
  ];
  provider.accounts = [];
  provider.loans = [
    loan('pessoal', {
      productName: 'Crédito pessoal',
      type: 'CREDITO_PESSOAL_SEM_CONSIGNACAO',
      contractNumber: '123',
      contractedAmount: 15_000_00,
      outstandingBalance: 8_598_76,
      contractDate: day(-380),
      finalDueDate: day(330),
      // Mensal com vencimento daqui a 5 dias: a próxima parcela sai do calendário.
      firstInstallmentDueDate: day(5),
      periodicity: 'MONTHLY',
      periodicityLabel: 'Mensal',
      installments: { total: 24, paid: 12, remaining: 12, overdue: 0 },
      installmentAmount: 837_77,
      interestRateAnnual: 34.33,
      cetAnnual: 36.87,
      raw: { id: 'pessoal', qualquer: 'coisa' },
    }),
    loan('veiculo', {
      productName: 'Financiamento de veículo',
      contractedAmount: 62_000_00,
      outstandingBalance: 60_153_33,
    }),
    loan('sem-saldo', { productName: 'Cheque especial' }),
    loan('outro', {
      connectionExternalId: 'item-2',
      productName: 'Crédito consignado',
      outstandingBalance: 1_000_00,
    }),
  ];
}

describe('Empréstimos (e2e)', () => {
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
    provider.loansUnavailable.clear();
    seed(provider);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const listLoans = async (): Promise<LoanDto[]> =>
    (await http().get('/api/loans').expect(200)).body;

  it('sincroniza e expõe do maior saldo devedor para o menor', async () => {
    const run = await sync.run('MANUAL');

    expect(run).toMatchObject({ status: 'SUCCEEDED', stats: { connections: 2, loans: 4 } });
    const loans = await listLoans();
    expect(loans.map((l) => [l.productName, l.institutionName, l.outstandingBalance])).toEqual([
      ['Financiamento de veículo', 'Banco Teste', 60_153_33],
      ['Crédito pessoal', 'Banco Teste', 8_598_76],
      ['Crédito consignado', 'Outro Banco', 1_000_00],
      ['Cheque especial', 'Banco Teste', null],
    ]);
    expect(loans[1]).toEqual({
      id: expect.any(String),
      connectionId: expect.any(String),
      institutionName: 'Banco Teste',
      productName: 'Crédito pessoal',
      type: 'CREDITO_PESSOAL_SEM_CONSIGNACAO',
      contractNumber: '123',
      contractedAmount: 15_000_00,
      outstandingBalance: 8_598_76,
      currency: 'BRL',
      contractDate: day(-380),
      finalDueDate: day(330),
      installments: { total: 24, paid: 12, remaining: 12, overdue: 0 },
      nextInstallment: { dueDate: day(5), amount: 837_77 },
      installmentAmount: 837_77,
      interestRateAnnual: 34.33,
      cetAnnual: 36.87,
      periodicity: 'Mensal',
      updatedAt: expect.any(String),
    });
    // O payload bruto fica só no banco.
    expect(loans[1]).not.toHaveProperty('raw');
    expect(loans[0]).toMatchObject({
      nextInstallment: null,
      installments: { total: null, paid: null, remaining: null, overdue: null },
    });

    const connections = await http().get('/api/connections').expect(200);
    const bank = connections.body.find(
      (c: { institutionName: string }) => c.institutionName === 'Banco Teste',
    );
    expect(loans[1]!.connectionId).toBe(bank.id);
  });

  it('é idempotente e reflete mudanças', async () => {
    await sync.run('MANUAL');
    const before = await listLoans();

    provider.loans[0]!.outstandingBalance = 7_800_00;
    provider.loans[0]!.installments = { total: 24, paid: 13, remaining: 11, overdue: 0 };
    const second = await sync.run('MANUAL');

    expect(second.stats).toMatchObject({ loans: 4 });
    const after = await listLoans();
    expect(after).toHaveLength(4);
    expect(after.map((l) => l.id).sort()).toEqual(before.map((l) => l.id).sort());
    expect(after.find((l) => l.productName === 'Crédito pessoal')).toMatchObject({
      outstandingBalance: 7_800_00,
      installments: { paid: 13, remaining: 11 },
    });
  });

  it('apaga os empréstimos que sumiram da conexão sincronizada', async () => {
    await sync.run('MANUAL');

    // Quitado: some do banco. Na outra conexão não sobra nenhum.
    provider.loans = provider.loans.filter((l) => l.externalId !== 'veiculo');
    provider.loans = provider.loans.filter((l) => l.connectionExternalId !== 'item-2');
    const run = await sync.run('MANUAL');

    expect(run).toMatchObject({ status: 'SUCCEEDED', stats: { loans: 2 } });
    expect((await listLoans()).map((l) => l.productName)).toEqual([
      'Crédito pessoal',
      'Cheque especial',
    ]);
  });

  it('não falha nem apaga nada quando o banco não compartilha empréstimos', async () => {
    await sync.run('MANUAL');
    provider.loansUnavailable.add('item-1');
    provider.loans = provider.loans.filter((l) => l.connectionExternalId !== 'item-1');

    const run = await sync.run('MANUAL');

    expect(run).toMatchObject({ status: 'SUCCEEDED', errors: [], stats: { loans: 1 } });
    expect(await listLoans()).toHaveLength(4);
  });

  it('sincroniza sem empréstimos quando nenhum banco compartilha', async () => {
    provider.loansUnavailable.add('item-1');
    provider.loansUnavailable.add('item-2');

    const run = await sync.run('MANUAL');

    expect(run).toMatchObject({ status: 'SUCCEEDED', stats: { connections: 2, loans: 0 } });
    expect(await listLoans()).toEqual([]);
  });

  it('isola a falha dos empréstimos e marca a execução como parcial', async () => {
    const original = provider.getLoans.bind(provider);
    const spy = vi.spyOn(provider, 'getLoans').mockImplementation(async (connectionId) => {
      if (connectionId === 'item-2') throw new Error('Pluggy respondeu 500 em GET /loans');
      return original(connectionId);
    });

    try {
      const run = await sync.run('MANUAL');

      expect(run).toMatchObject({
        status: 'PARTIAL',
        errors: ['Empréstimos de "Outro Banco": Pluggy respondeu 500 em GET /loans'],
        stats: { connections: 2, loans: 3 },
      });
      expect(await listLoans()).toHaveLength(3);
    } finally {
      spy.mockRestore();
    }
  });

  it('lê execuções antigas, gravadas sem a contagem de empréstimos', async () => {
    const legacyStats = {
      connections: 1,
      accounts: 2,
      transactions: 3,
      removedPendingTransactions: 0,
      invoices: 1,
    };
    await app.get<Database>(DATABASE).insert(syncRuns).values({
      provider: 'test',
      trigger: 'SCHEDULED',
      status: 'SUCCEEDED',
      finishedAt: new Date(),
      stats: legacyStats,
    });

    const runs = await http().get('/api/sync/runs').expect(200);
    expect(runs.body).toEqual([expect.objectContaining({ stats: legacyStats })]);
  });
});
