import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { KeycloakUser } from '../src/auth/auth.types.js';
import { addDays, today } from '../src/domain/dates.js';
import type { Transaction } from '../src/domain/finance.js';
import { AnalysisService } from '../src/insights/analysis.service.js';
import { SyncInProgressError, SyncService } from '../src/sync/sync.service.js';
import {
  createTestApp,
  OTHER_USER,
  resetDatabase,
  TEST_USER,
  TEST_USER_HEADER,
  userIdOf,
} from './app.js';
import { InMemoryProvider } from './in-memory-provider.js';

const day = (offset: number) => addDays(today('America/Sao_Paulo'), offset);

const tx = (externalId: string, accountExternalId: string, amount: number): Transaction => ({
  externalId,
  accountExternalId,
  date: day(-3),
  description: externalId,
  amount,
  status: 'POSTED',
  category: null,
  paymentMethod: null,
  counterpartyName: null,
  installment: null,
  invoiceExternalId: null,
});

/** Mesmos ids externos para os dois usuários; só os nomes mudam. */
function seed(provider: InMemoryProvider, owner: string) {
  provider.connections = [
    {
      externalId: 'item-1',
      institutionName: `Banco de ${owner}`,
      institutionLogoUrl: null,
      status: 'ACTIVE',
      lastRefreshedAt: null,
    },
  ];
  provider.accounts = [
    {
      externalId: 'checking',
      connectionExternalId: 'item-1',
      type: 'CHECKING',
      name: `Conta de ${owner}`,
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
      name: `Cartão de ${owner}`,
      number: '2',
      currency: 'BRL',
      balance: 500_00,
      creditLimit: 5_000_00,
      availableCredit: 4_500_00,
    },
  ];
  provider.transactions = [
    tx(`compra-${owner}`, 'checking', -10_00),
    tx('compra-comum', 'card', -20_00),
  ];
  provider.invoices = [
    {
      externalId: 'bill-1',
      accountExternalId: 'card',
      dueDate: day(10),
      closingDate: day(3),
      total: 500_00,
      minimumPayment: null,
      currency: 'BRL',
    },
  ];
}

const report = {
  period: { from: day(-30), to: day(0) },
  headline: 'Resumo',
  summary: 'Tudo certo.',
  monthlyFixed: 0,
  monthlyDiscretionary: 0,
  potentialMonthlySavings: 0,
  insights: [
    {
      kind: 'SUGGESTION',
      title: 'Reserva',
      explanation: 'Guarde parte da sobra.',
      monthlySavings: null,
      evidence: null,
      confidence: 'LOW',
    },
  ],
};

describe('Multiusuário (e2e)', () => {
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
    provider.pause = undefined;
  });

  afterAll(async () => {
    await app.close();
  });

  /** Requisições como `user` (padrão: o usuário de teste). */
  const as = (user: KeycloakUser = TEST_USER) => {
    const http = request(app.getHttpServer());
    return {
      get: (url: string) => http.get(url).set(TEST_USER_HEADER, user.sub),
      post: (url: string) => http.post(url).set(TEST_USER_HEADER, user.sub),
      patch: (url: string) => http.patch(url).set(TEST_USER_HEADER, user.sub),
      delete: (url: string) => http.delete(url).set(TEST_USER_HEADER, user.sub),
    };
  };

  async function syncBoth() {
    seed(provider, 'Ana');
    expect(await sync.run(await userIdOf(app, TEST_USER), 'MANUAL')).toMatchObject({
      status: 'SUCCEEDED',
    });
    seed(provider, 'Bia');
    expect(await sync.run(await userIdOf(app, OTHER_USER), 'MANUAL')).toMatchObject({
      status: 'SUCCEEDED',
    });
  }

  it('cada usuário sincroniza e vê só os próprios dados, mesmo com os mesmos ids do banco', async () => {
    await syncBoth();

    for (const [user, owner] of [
      [TEST_USER, 'Ana'],
      [OTHER_USER, 'Bia'],
    ] as const) {
      const connections = await as(user).get('/api/connections').expect(200);
      expect(connections.body.map((c: { institutionName: string }) => c.institutionName)).toEqual([
        `Banco de ${owner}`,
      ]);
      const accounts = await as(user).get('/api/accounts').expect(200);
      expect(accounts.body.map((a: { name: string }) => a.name).sort()).toEqual([
        `Cartão de ${owner}`,
        `Conta de ${owner}`,
      ]);
      const transactions = await as(user).get('/api/transactions').expect(200);
      expect(transactions.body.total).toBe(2);
      expect(transactions.body.items.map((t: { description: string }) => t.description)).toContain(
        `compra-${owner}`,
      );
      const invoices = await as(user).get('/api/invoices').expect(200);
      expect(invoices.body).toHaveLength(1);
      const runs = await as(user).get('/api/sync/runs').expect(200);
      expect(runs.body).toHaveLength(1);
    }

    // Filtrar pela conta do outro não vaza nada.
    const bia = await as(OTHER_USER).get('/api/accounts').expect(200);
    const biaChecking = bia.body.find((a: { type: string }) => a.type === 'CHECKING').id;
    const leak = await as().get(`/api/transactions?accountId=${biaChecking}`).expect(200);
    expect(leak.body).toMatchObject({ items: [], total: 0 });
    await as().get(`/api/invoices?accountId=${biaChecking}`).expect(200, []);
  });

  it('não lê, altera nem referencia o que é do outro', async () => {
    await syncBoth();
    const anaAccounts = await as().get('/api/accounts').expect(200);
    const anaChecking = anaAccounts.body.find((a: { type: string }) => a.type === 'CHECKING').id;
    const category = await as()
      .post('/api/planning/categories')
      .send({ name: 'Mercado', kind: 'ESSENTIAL' })
      .expect(201);
    const commitment = await as()
      .post('/api/planning/commitments')
      .send({
        name: 'Terreno',
        amount: 2_300_00,
        dayOfMonth: 10,
        paymentMethod: 'BOLETO',
        startsOn: '2023-09-10',
        categoryId: category.body.id,
      })
      .expect(201);
    const goal = await as()
      .post('/api/planning/goals')
      .send({
        name: 'Carro',
        target: 100_00,
        targetDate: '2027-12-01',
        monthlyContribution: 10_00,
        accountId: anaChecking,
      })
      .expect(201);
    const anaTx = (await as().get('/api/transactions').expect(200)).body.items[0].id;

    const bia = as(OTHER_USER);
    await bia
      .patch(`/api/planning/commitments/${commitment.body.id}`)
      .send({ amount: 1 })
      .expect(404);
    await bia.delete(`/api/planning/commitments/${commitment.body.id}`).expect(404);
    await bia.patch(`/api/planning/goals/${goal.body.id}`).send({ saved: 1 }).expect(404);
    await bia.delete(`/api/planning/goals/${goal.body.id}`).expect(404);
    await bia.patch(`/api/planning/categories/${category.body.id}`).send({ name: 'x' }).expect(404);
    await bia.delete(`/api/planning/categories/${category.body.id}`).expect(404);
    await bia.patch(`/api/transactions/${anaTx}`).send({ category: 'Restaurants' }).expect(404);

    // Referenciar a categoria ou a conta de outro usuário: como se não existissem.
    const refused = await bia
      .post('/api/planning/goals')
      .send({
        name: 'Moto',
        target: 100_00,
        targetDate: '2027-12-01',
        monthlyContribution: 10_00,
        accountId: anaChecking,
      })
      .expect(400);
    expect(refused.body.message).toBe('Categoria ou conta informada não existe');
    await bia
      .post('/api/planning/commitments')
      .send({
        name: 'Aluguel',
        amount: 1_000_00,
        dayOfMonth: 5,
        paymentMethod: 'PIX',
        startsOn: '2024-01-05',
        categoryId: category.body.id,
      })
      .expect(400);
    const own = await bia
      .post('/api/planning/goals')
      .send({ name: 'Moto', target: 100_00, targetDate: '2027-12-01', monthlyContribution: 10_00 })
      .expect(201);
    await bia
      .patch(`/api/planning/goals/${own.body.id}`)
      .send({ accountId: anaChecking })
      .expect(400);

    const biaPlanning = await bia.get('/api/planning').expect(200);
    expect(biaPlanning.body.categories).toEqual([]);
    expect(biaPlanning.body.commitments).toEqual([]);
    expect(biaPlanning.body.goals.map((g: { name: string }) => g.name)).toEqual(['Moto']);

    // Nada do que a Bia tentou mudou os dados da Ana.
    const anaPlanning = await as().get('/api/planning').expect(200);
    expect(anaPlanning.body.commitments).toMatchObject([{ amount: 2_300_00 }]);
    expect(anaPlanning.body.goals).toMatchObject([{ name: 'Carro', saved: 0 }]);
    expect(anaPlanning.body.categories).toMatchObject([{ name: 'Mercado' }]);
  });

  it('análises salvas são de quem as gerou', async () => {
    const ana = await userIdOf(app, TEST_USER);
    const saved = await app.get(AnalysisService).save(ana, report, 'MCP');
    await as().get('/api/analysis/latest').expect(200);
    await as(OTHER_USER).get('/api/analysis/latest').expect(404);
    await as(OTHER_USER).get('/api/analysis').expect(200, []);
    expect((await as().get('/api/analysis').expect(200)).body[0].id).toBe(saved.id);
  });

  it('usuários diferentes sincronizam ao mesmo tempo; o mesmo usuário, uma de cada vez', async () => {
    seed(provider, 'Ana');
    let release!: () => void;
    provider.pause = new Promise<void>((resolve) => (release = resolve));
    const ana = await userIdOf(app, TEST_USER);
    const bia = await userIdOf(app, OTHER_USER);

    const first = await sync.start(ana, 'MANUAL');
    const second = await sync.start(bia, 'MANUAL');
    await expect(sync.start(ana, 'MANUAL')).rejects.toBeInstanceOf(SyncInProgressError);
    await as().post('/api/sync').expect(409);

    release();
    expect(await first.completion).toMatchObject({ status: 'SUCCEEDED', userId: ana });
    expect(await second.completion).toMatchObject({ status: 'SUCCEEDED', userId: bia });
    expect(await sync.scheduledUserIds()).toEqual(expect.arrayContaining([ana, bia]));
  });
});
