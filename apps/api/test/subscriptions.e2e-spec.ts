import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { addDays, today } from '../src/domain/dates.js';
import type { Transaction } from '../src/domain/finance.js';
import { dueDate, monthOf, shiftMonth } from '../src/domain/months.js';
import { SyncService } from '../src/sync/sync.service.js';
import { createTestApp, OTHER_USER, resetDatabase, TEST_USER_HEADER, userIdOf } from './app.js';
import { InMemoryProvider } from './in-memory-provider.js';

/** Última cobrança há 10 dias; as anteriores, no mesmo dia dos meses anteriores. */
const REFERENCE = addDays(today('America/Sao_Paulo'), -10);
const monthsAgo = (months: number, day = Number(REFERENCE.slice(8, 10))) =>
  dueDate(shiftMonth(monthOf(REFERENCE), -months), day);

let sequence = 0;
const charge = (
  accountExternalId: string,
  date: string,
  amount: number,
  extra: Partial<Transaction> = {},
): Transaction => ({
  externalId: `tx-${++sequence}`,
  accountExternalId,
  date,
  description: 'Cobrança',
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
      lastRefreshedAt: null,
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
      balance: 1_000_00,
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
  const streaming = [3, 2, 1, 0].map((m) =>
    charge('card', monthsAgo(m), -55_90, {
      description: `STREAMING EXEMPLO ${m}`,
      counterpartyName: 'Streaming Exemplo',
      category: 'Video streaming',
      paymentMethod: 'CARD',
    }),
  );
  const plus = [3, 2, 1, 0].map((m) =>
    charge('card', monthsAgo(m), m === 0 ? -44_90 : -39_90, {
      description: 'Streaming Plus',
      counterpartyName: 'Streaming Plus',
    }),
  );
  const light = [3, 2, 1, 0].map((m, i) =>
    charge('checking', monthsAgo(m), -[150_00, 210_00, 180_00, 260_00][i]!, {
      description: 'Conta de luz',
      paymentMethod: 'BOLETO',
      category: 'Electricity',
    }),
  );
  const delivery = [3, 2, 1].flatMap((m) =>
    [2, 9, 16, 23].map((day) =>
      charge('card', monthsAgo(m, day), -45_00, {
        description: 'Pedido',
        counterpartyName: 'Delivery Exemplo',
        category: 'Food delivery',
      }),
    ),
  );
  const installments = [3, 2, 1, 0].map((m, i) =>
    charge('card', monthsAgo(m), -300_00, {
      description: 'Notebook',
      installment: { number: i + 1, total: 10 },
    }),
  );
  const gym = [5, 4, 3].map((m) =>
    charge('card', monthsAgo(m), -129_90, { description: 'Academia', paymentMethod: 'CARD' }),
  );
  provider.transactions = [...streaming, ...plus, ...light, ...delivery, ...installments, ...gym];
  provider.invoices = [];
}

describe('Assinaturas (e2e)', () => {
  let app: INestApplication;
  let provider: InMemoryProvider;

  beforeAll(async () => {
    provider = new InMemoryProvider();
    app = await createTestApp(provider);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    seed(provider);
    await app.get(SyncService).run(await userIdOf(app), 'MANUAL');
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const overview = async () => (await http().get('/api/subscriptions').expect(200)).body;
  const keys = (items: { key: string }[]) => items.map((item) => item.key);
  const prefer = (body: object) => http().put('/api/subscriptions/preferences').send(body);
  /** Grava o ajuste (204) e devolve a visão atualizada. */
  const preferThen = async (body: object) => {
    await prefer(body).expect(204);
    return overview();
  };

  it('separa assinaturas, outras cobranças e as que pararam; hábitos e parcelas ficam de fora', async () => {
    const body = await overview();
    expect(keys(body.subscriptions)).toEqual(['streaming exemplo', 'streaming plus']);
    expect(keys(body.others)).toEqual(['conta de luz']);
    expect(keys(body.stopped)).toEqual(['academia']);
    expect(body.hidden).toEqual([]);

    const [streaming, plus] = body.subscriptions;
    expect(streaming).toMatchObject({
      name: 'STREAMING EXEMPLO 0',
      chargeAmount: 55_90,
      intervalMonths: 1,
      monthlyCost: 55_90,
      yearlyCost: 55_90 * 12,
      lastDate: REFERENCE,
      nextDate: monthsAgo(-1),
      months: 4,
      paymentMethod: 'CARD',
      onCreditCard: true,
      accounts: ['Cartão'],
      account: 'Cartão',
      priceIncrease: null,
      plannedCommitmentId: null,
      source: 'DETECTED',
    });
    expect(plus).toMatchObject({
      monthlyCost: 44_90,
      priceIncrease: { from: 39_90, to: 44_90, on: REFERENCE },
    });
    expect(body.others[0]).toMatchObject({ variable: true, onCreditCard: false });
    expect(body.totals).toEqual({
      monthly: 55_90 + 44_90,
      yearly: (55_90 + 44_90) * 12,
      active: 2,
    });
  });

  it('"não é assinatura" oculta e "restaurar" volta', async () => {
    let body = await preferThen({ key: 'streaming plus', kind: 'IGNORED' });
    expect(keys(body.subscriptions)).toEqual(['streaming exemplo']);
    expect(keys(body.hidden)).toEqual(['streaming plus']);
    expect(body.totals.monthly).toBe(55_90);

    body = await preferThen({ key: 'streaming plus', kind: null });
    expect(keys(body.subscriptions)).toEqual(['streaming exemplo', 'streaming plus']);
    expect(body.hidden).toEqual([]);
  });

  it('promove uma cobrança variável, renomeia e limpar o nome volta ao do extrato', async () => {
    let body = await preferThen({ key: 'conta de luz', kind: 'SUBSCRIPTION', name: '  Luz  ' });
    const light = body.subscriptions.find((s: { key: string }) => s.key === 'conta de luz');
    expect(light).toMatchObject({ name: 'Luz', customName: 'Luz', source: 'PROMOTED' });
    expect(body.others).toEqual([]);

    body = await preferThen({ key: 'conta de luz', name: '' });
    expect(body.subscriptions.find((s: { key: string }) => s.key === 'conta de luz')).toMatchObject(
      { name: 'Conta de luz', customName: null, source: 'PROMOTED' },
    );
  });

  it('ajustes de campos diferentes não se apagam (cada PUT muda só o que mandou)', async () => {
    await prefer({ key: 'conta de luz', name: 'Luz' }).expect(204);
    const body = await preferThen({ key: 'conta de luz', kind: 'SUBSCRIPTION' });
    expect(body.subscriptions.find((s: { key: string }) => s.key === 'conta de luz')).toMatchObject(
      { name: 'Luz', source: 'PROMOTED' },
    );
  });

  it('criado a partir da assinatura, continua ligado mesmo com outro nome; encerrado não conta', async () => {
    const linked = await http()
      .post('/api/planning/commitments')
      .send({
        name: 'Plano de vídeo',
        amount: 44_90,
        dayOfMonth: 5,
        paymentMethod: 'CARD',
        startsOn: '2026-01-05',
        subscriptionKey: 'streaming plus',
      })
      .expect(201);
    await http()
      .post('/api/planning/commitments')
      .send({
        name: 'Streaming Exemplo',
        amount: 55_90,
        dayOfMonth: 5,
        paymentMethod: 'CARD',
        startsOn: '2025-01-05',
        endsOn: '2025-06-05',
      })
      .expect(201);
    const body = await overview();
    const byKey = Object.fromEntries(
      body.subscriptions.map((s: { key: string; plannedCommitmentId: string | null }) => [
        s.key,
        s.plannedCommitmentId,
      ]),
    );
    expect(byKey['streaming plus']).toBe(linked.body.id);
    expect(byKey['streaming exemplo']).toBeNull();
  });

  it('marca a que já está no planejamento (mesmo nome)', async () => {
    const commitment = await http()
      .post('/api/planning/commitments')
      .send({
        name: 'Streaming Exemplo',
        amount: 55_90,
        dayOfMonth: 5,
        paymentMethod: 'CARD',
        startsOn: '2026-01-05',
      })
      .expect(201);
    const body = await overview();
    expect(body.subscriptions[0]).toMatchObject({
      key: 'streaming exemplo',
      plannedCommitmentId: commitment.body.id,
    });
  });

  it('valida o corpo', async () => {
    await prefer({ key: 'x', kind: 'IGNORED' }).expect(400);
    await prefer({ key: 'streaming plus', kind: 'OUTRO' }).expect(400);
    await prefer({ key: 'streaming plus', name: 'n'.repeat(81) }).expect(400);
    await prefer({ key: 'streaming plus', extra: true }).expect(400);
  });

  it('cada usuário vê as próprias e os ajustes de um não valem para o outro', async () => {
    const other = (path: string) => http().get(path).set(TEST_USER_HEADER, OTHER_USER.sub);
    const empty = (await other('/api/subscriptions').expect(200)).body;
    expect(empty).toMatchObject({
      subscriptions: [],
      others: [],
      stopped: [],
      hidden: [],
      totals: { monthly: 0, yearly: 0, active: 0 },
    });

    await http()
      .put('/api/subscriptions/preferences')
      .set(TEST_USER_HEADER, OTHER_USER.sub)
      .send({ key: 'streaming exemplo', kind: 'IGNORED' })
      .expect(204);
    const mine = await overview();
    expect(keys(mine.subscriptions)).toContain('streaming exemplo');
    expect(mine.hidden).toEqual([]);
  });
});
