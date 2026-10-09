import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { addDays, today } from '../src/domain/dates.js';
import type { Transaction } from '../src/domain/finance.js';
import { dueDate, monthOf, monthRange, shiftMonth } from '../src/domain/months.js';
import { SyncService } from '../src/sync/sync.service.js';
import { createTestApp, resetDatabase } from './app.js';
import { InMemoryProvider } from './in-memory-provider.js';

const TODAY = today('America/Sao_Paulo');
const CURRENT_MONTH = monthOf(TODAY);
const TODAY_DAY = Number(TODAY.slice(8, 10));
/** Os 3 meses fechados que a projeção usa como base. */
const CLOSED = [-3, -2, -1].map((offset) => shiftMonth(CURRENT_MONTH, offset));

const tx = (externalId: string, date: string, amount: number, category: string): Transaction => ({
  externalId,
  accountExternalId: 'checking',
  date,
  description: externalId,
  amount,
  status: 'POSTED',
  category,
  paymentMethod: null,
  counterpartyName: null,
  installment: null,
  invoiceExternalId: null,
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
      balance: 0,
      creditLimit: null,
      availableCredit: null,
    },
  ];
  // Por mês fechado: salário, mercado, terreno (compromisso), fatura e aporte
  // (os dois últimos não são gasto).
  provider.transactions = CLOSED.flatMap((month) => {
    const day = (d: number) => `${month}-${String(d).padStart(2, '0')}`;
    return [
      tx(`salario-${month}`, day(5), 9_000_00, 'Salary'),
      tx(`mercado-${month}`, day(12), -1_000_00, 'Groceries'),
      tx(`terreno-${month}`, day(10), -2_300_00, 'Housing'),
      tx(`fatura-${month}`, day(15), -500_00, 'Credit card payment'),
      tx(`aporte-${month}`, day(6), -1_500_00, 'Transfer - Savings'),
    ];
  });
  provider.invoices = [];
}

describe('Planejamento (e2e)', () => {
  let app: INestApplication;
  let provider: InMemoryProvider;

  beforeAll(async () => {
    provider = new InMemoryProvider();
    app = await createTestApp(provider);
  });

  beforeEach(async () => {
    await resetDatabase(app);
    seed(provider);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  const terreno = {
    name: 'Parcela do terreno',
    amount: 2_300_00,
    dayOfMonth: 10,
    paymentMethod: 'BOLETO',
    startsOn: '2023-09-10',
    installmentsTotal: 120,
    notes: 'Loteadora',
  };

  it('cria, lista, edita e apaga compromissos', async () => {
    const created = await http().post('/api/planning/commitments').send(terreno).expect(201);
    expect(created.body).toMatchObject({
      name: 'Parcela do terreno',
      amount: 2_300_00,
      categoryId: null,
      // Sem endsOn, o fim sai do total de parcelas.
      endsOn: '2033-08-10',
      installments: { total: 120, paid: expect.any(Number) },
    });

    const overview = await http().get('/api/planning').expect(200);
    expect(overview.body.commitments).toHaveLength(1);

    const updated = await http()
      .patch(`/api/planning/commitments/${created.body.id}`)
      .send({ amount: 2_400_00, notes: null })
      .expect(200);
    expect(updated.body).toMatchObject({ amount: 2_400_00, notes: null, dayOfMonth: 10 });

    await http().delete(`/api/planning/commitments/${created.body.id}`).expect(204);
    await http()
      .patch(`/api/planning/commitments/${created.body.id}`)
      .send({ amount: 1 })
      .expect(404);
    const after = await http().get('/api/planning').expect(200);
    expect(after.body.commitments).toEqual([]);
  });

  it('conta as parcelas vencidas antes de hoje; a que vence hoje é a próxima', async () => {
    // Vence todo dia de hoje desde dois meses atrás: pagas as de -2 e -1; a de
    // hoje é a 3ª e última, então o fim derivado é hoje.
    const created = await http()
      .post('/api/planning/commitments')
      .send({
        ...terreno,
        dayOfMonth: TODAY_DAY,
        startsOn: `${shiftMonth(CURRENT_MONTH, -2)}-01`,
        installmentsTotal: 3,
      })
      .expect(201);
    expect(created.body).toMatchObject({ endsOn: TODAY, installments: { paid: 2, total: 3 } });

    // Começa hoje e vence hoje: nenhuma paga ainda.
    const startsToday = await http()
      .post('/api/planning/commitments')
      .send({ ...terreno, dayOfMonth: TODAY_DAY, startsOn: TODAY, installmentsTotal: 2 })
      .expect(201);
    expect(startsToday.body).toMatchObject({
      endsOn: dueDate(shiftMonth(CURRENT_MONTH, 1), TODAY_DAY),
      installments: { paid: 0, total: 2 },
    });

    // Começa amanhã: o 1º vencimento (dia de hoje) só no mês que vem.
    const startsTomorrow = await http()
      .post('/api/planning/commitments')
      .send({
        ...terreno,
        dayOfMonth: TODAY_DAY,
        startsOn: addDays(TODAY, 1),
        installmentsTotal: 1,
      })
      .expect(201);
    expect(startsTomorrow.body).toMatchObject({
      endsOn: dueDate(shiftMonth(CURRENT_MONTH, 1), TODAY_DAY),
      installments: { paid: 0, total: 1 },
    });

    // Dia 31 vence no último dia dos meses curtos. As de quatro meses atrás até
    // o mês passado venceram; a deste mês vence no último dia (mesmo se for
    // hoje, ainda não paga) e é a 5ª, então o fim é o último dia deste mês.
    const dia31 = await http()
      .post('/api/planning/commitments')
      .send({
        ...terreno,
        dayOfMonth: 31,
        startsOn: `${shiftMonth(CURRENT_MONTH, -4)}-01`,
        installmentsTotal: 5,
      })
      .expect(201);
    expect(dia31.body).toMatchObject({
      endsOn: monthRange(CURRENT_MONTH).to,
      installments: { paid: 4, total: 5 },
    });
  });

  it.each([
    ['dia do mês inválido', { dayOfMonth: 32 }],
    ['valor zero', { amount: 0 }],
    ['fim antes do início', { endsOn: '2020-01-01' }],
    ['meio de pagamento desconhecido', { paymentMethod: 'CHEQUE' }],
    ['campo desconhecido', { foo: 'bar' }],
  ])('rejeita compromisso inválido: %s', async (_case, patch) => {
    await http()
      .post('/api/planning/commitments')
      .send({ ...terreno, ...patch })
      .expect(400);
  });

  it('rejeita null em campos obrigatórios ao editar (400, não 500)', async () => {
    const commitment = await http().post('/api/planning/commitments').send(terreno).expect(201);
    for (const field of ['name', 'amount', 'dayOfMonth', 'paymentMethod', 'startsOn']) {
      await http()
        .patch(`/api/planning/commitments/${commitment.body.id}`)
        .send({ [field]: null })
        .expect(400);
    }
    // Os opcionais continuam aceitando null para limpar.
    await http()
      .patch(`/api/planning/commitments/${commitment.body.id}`)
      .send({ categoryId: null, endsOn: null, installmentsTotal: null, notes: null })
      .expect(200);

    const goal = await http()
      .post('/api/planning/goals')
      .send({ name: 'Carro', target: 100_00, targetDate: '2027-12-01', monthlyContribution: 10_00 })
      .expect(201);
    for (const field of ['name', 'target', 'saved', 'targetDate', 'monthlyContribution']) {
      await http()
        .patch(`/api/planning/goals/${goal.body.id}`)
        .send({ [field]: null })
        .expect(400);
    }
    await http().patch(`/api/planning/goals/${goal.body.id}`).send({ accountId: null }).expect(200);

    const category = await http()
      .post('/api/planning/categories')
      .send({ name: 'Mercado', kind: 'ESSENTIAL' })
      .expect(201);
    for (const field of ['name', 'kind', 'sourceCategories', 'position']) {
      await http()
        .patch(`/api/planning/categories/${category.body.id}`)
        .send({ [field]: null })
        .expect(400);
    }
  });

  it('orçamento da categoria: zero é inválido, null é sem teto', async () => {
    await http()
      .post('/api/planning/categories')
      .send({ name: 'Lazer', kind: 'DISCRETIONARY', monthlyBudget: 0 })
      .expect(400);
    const category = await http()
      .post('/api/planning/categories')
      .send({ name: 'Lazer', kind: 'DISCRETIONARY', monthlyBudget: 500_00 })
      .expect(201);
    await http()
      .patch(`/api/planning/categories/${category.body.id}`)
      .send({ monthlyBudget: 0 })
      .expect(400);
    const cleared = await http()
      .patch(`/api/planning/categories/${category.body.id}`)
      .send({ monthlyBudget: null })
      .expect(200);
    expect(cleared.body.monthlyBudget).toBeNull();
  });

  it('valida categoria e conta inexistentes e solta o vínculo ao apagar a categoria', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';
    await http()
      .post('/api/planning/commitments')
      .send({ ...terreno, categoryId: missing })
      .expect(400);
    await http()
      .post('/api/planning/goals')
      .send({
        name: 'Carro',
        target: 40_000_00,
        targetDate: '2027-12-01',
        monthlyContribution: 1_500_00,
        accountId: missing,
      })
      .expect(400);

    const category = await http()
      .post('/api/planning/categories')
      .send({
        name: 'Moradia',
        kind: 'ESSENTIAL',
        sourceCategories: ['Housing', ' Housing ', 'Electricity'],
        monthlyBudget: 2_700_00,
      })
      .expect(201);
    expect(category.body.sourceCategories).toEqual(['Housing', 'Electricity']);

    const commitment = await http()
      .post('/api/planning/commitments')
      .send({ ...terreno, categoryId: category.body.id })
      .expect(201);
    await http().delete(`/api/planning/categories/${category.body.id}`).expect(204);

    const overview = await http().get('/api/planning').expect(200);
    expect(overview.body.categories).toEqual([]);
    expect(overview.body.commitments).toEqual([
      expect.objectContaining({ id: commitment.body.id, categoryId: null }),
    ]);
  });

  it('cria e edita metas', async () => {
    const goal = await http()
      .post('/api/planning/goals')
      .send({
        name: 'Entrada do carro',
        target: 40_000_00,
        targetDate: '2027-12-01',
        monthlyContribution: 1_500_00,
      })
      .expect(201);
    expect(goal.body).toMatchObject({ saved: 0, accountId: null });

    const updated = await http()
      .patch(`/api/planning/goals/${goal.body.id}`)
      .send({ saved: 12_500_00 })
      .expect(200);
    expect(updated.body).toMatchObject({ saved: 12_500_00, target: 40_000_00 });
  });

  it('projeta os próximos meses a partir dos meses fechados', async () => {
    await app.get(SyncService).run('MANUAL');
    await http().post('/api/planning/commitments').send(terreno).expect(201);
    // Financiamento que acaba no 2º mês da projeção.
    await http()
      .post('/api/planning/commitments')
      .send({
        name: 'Celular parcelado',
        amount: 300_00,
        dayOfMonth: 5,
        paymentMethod: 'CARD',
        startsOn: `${shiftMonth(CURRENT_MONTH, -7)}-05`,
        installmentsTotal: 10,
      })
      .expect(201);
    await http()
      .post('/api/planning/goals')
      .send({
        name: 'Carro',
        target: 10_000_00,
        targetDate: '2028-01-01',
        monthlyContribution: 1_500_00,
      })
      .expect(201);
    // Faltam 8.000 a 1.500/mês: cinco aportes cheios e um último de 500.
    await http()
      .post('/api/planning/goals')
      .send({
        name: 'Viagem',
        target: 10_000_00,
        saved: 2_000_00,
        targetDate: '2028-01-01',
        monthlyContribution: 1_500_00,
      })
      .expect(201);

    const { body } = await http().get('/api/planning').expect(200);

    expect(body.projections.map((p: { month: string }) => p.month)).toEqual(
      [1, 2, 3, 4, 5, 6].map((offset) => shiftMonth(CURRENT_MONTH, offset)),
    );
    // Renda: só o salário (fatura e aporte não contam).
    expect(body.projections[0].expectedIncome).toBe(9_000_00);
    // Gasto médio 3.300 (mercado + terreno); nos meses fechados os compromissos
    // ativos somavam 2.300 + 300 = 2.600 → variável 700.
    expect(body.projections[0].expectedVariableSpending).toBe(700_00);
    // O parcelado começou há 7 meses com 10 parcelas: ativo nos meses +1 e +2.
    expect(body.projections.map((p: { commitments: number }) => p.commitments)).toEqual([
      2_600_00, 2_600_00, 2_300_00, 2_300_00, 2_300_00, 2_300_00,
    ]);
    // Carro (10.000 a 1.500/mês) aporta 1.500 nos 6 meses (o 7º seria 1.000);
    // a viagem, 1.500 até o 5º mês e só os 500 que faltam no 6º.
    expect(body.projections.map((p: { goalContributions: number }) => p.goalContributions)).toEqual(
      [3_000_00, 3_000_00, 3_000_00, 3_000_00, 3_000_00, 2_000_00],
    );
    expect(body.projections[2].projectedBalance).toBe(9_000_00 - 2_300_00 - 3_000_00 - 700_00);
    expect(body.projections[5].projectedBalance).toBe(9_000_00 - 2_300_00 - 2_000_00 - 700_00);
  });

  it('recategorização sobrevive à sincronização e pode ser desfeita', async () => {
    const sync = app.get(SyncService);
    await sync.run('MANUAL');
    const month = CLOSED[2]!;
    const list = await http()
      .get('/api/transactions')
      .query({ search: `mercado-${month}` })
      .expect(200);
    const item = list.body.items[0];
    expect(item).toMatchObject({ category: 'Groceries', originalCategory: 'Groceries' });

    const edited = await http()
      .patch(`/api/transactions/${item.id}`)
      .send({ category: 'Restaurants' })
      .expect(200);
    expect(edited.body).toMatchObject({ category: 'Restaurants', originalCategory: 'Groceries' });

    await sync.run('MANUAL');
    const afterSync = await http()
      .get('/api/transactions')
      .query({ search: `mercado-${month}` })
      .expect(200);
    expect(afterSync.body.items[0]).toMatchObject({
      category: 'Restaurants',
      originalCategory: 'Groceries',
    });

    const reset = await http()
      .patch(`/api/transactions/${item.id}`)
      .send({ category: null })
      .expect(200);
    expect(reset.body.category).toBe('Groceries');

    await http()
      .patch('/api/transactions/00000000-0000-4000-8000-000000000000')
      .send({ category: 'Groceries' })
      .expect(404);
    await http().patch(`/api/transactions/${item.id}`).send({ category: 42 }).expect(400);
  });

  it('usa a data de hoje do fuso configurado', () => {
    // Sanidade do próprio teste: os meses fechados terminam antes de hoje.
    expect(monthRange(CLOSED[2]!).to < TODAY).toBe(true);
    expect(addDays(monthRange(CLOSED[2]!).to, 1)).toBe(`${CURRENT_MONTH}-01`);
  });
});
