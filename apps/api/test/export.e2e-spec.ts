import type { INestApplication } from '@nestjs/common';
import { strFromU8, unzipSync } from 'fflate';
import request from 'supertest';
import { addDays, today } from '../src/domain/dates.js';
import type { Transaction } from '../src/domain/finance.js';
import { monthOf, monthRange, shiftMonth } from '../src/domain/months.js';
import { SECTION_IDS } from '../src/export/export.catalog.js';
import type { LoanDto } from '../src/loans/loan.dto.js';
import { LoansService } from '../src/loans/loans.service.js';
import { SyncService } from '../src/sync/sync.service.js';
import { createTestApp, resetDatabase } from './app.js';
import { FakeKeycloak } from './fake-keycloak.js';
import { InMemoryProvider } from './in-memory-provider.js';

const TODAY = today('America/Sao_Paulo');
const PREVIOUS = shiftMonth(monthOf(TODAY), -1);
const DEFAULT_FROM = monthRange(shiftMonth(monthOf(TODAY), -2)).from;
const day = (d: number) => `${PREVIOUS}-${String(d).padStart(2, '0')}`;

const tx = (
  externalId: string,
  accountExternalId: string,
  date: string,
  amount: number,
  category: string,
  extra: Partial<Transaction> = {},
): Transaction => ({
  externalId,
  accountExternalId,
  date,
  description: externalId,
  amount,
  status: 'POSTED',
  category,
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
      lastRefreshedAt: new Date(),
    },
    {
      externalId: 'item-2',
      institutionName: 'Cartão Teste',
      institutionLogoUrl: null,
      status: 'ACTION_REQUIRED',
      lastRefreshedAt: new Date(),
    },
  ];
  provider.accounts = [
    {
      externalId: 'checking',
      connectionExternalId: 'item-1',
      type: 'CHECKING',
      name: 'Conta Corrente',
      number: '123',
      currency: 'BRL',
      balance: 5_432_10,
      creditLimit: null,
      availableCredit: null,
    },
    {
      externalId: 'card',
      connectionExternalId: 'item-2',
      type: 'CREDIT_CARD',
      name: 'Cartão Ouro',
      number: '9999',
      currency: 'BRL',
      balance: 1_200_00,
      creditLimit: 10_000_00,
      availableCredit: 8_800_00,
    },
  ];
  provider.transactions = [
    tx('Salário', 'checking', day(5), 8_000_00, 'Salary'),
    tx('Mercado São Jorge', 'checking', day(12), -432_10, 'Groceries', { paymentMethod: 'PIX' }),
    tx('Pagamento fatura', 'checking', day(15), -900_00, 'Credit card payment'),
    tx('Geladeira Nova', 'card', day(20), -300_00, 'Shopping', {
      installment: { number: 1, total: 10 },
      paymentMethod: 'CARD',
    }),
    tx('Compra de hoje', 'card', TODAY, -12_34, 'Restaurants'),
    tx('Compra antiga', 'checking', addDays(DEFAULT_FROM, -1), -99_99, 'Shopping'),
  ];
  provider.invoices = [
    {
      externalId: 'inv-1',
      accountExternalId: 'card',
      dueDate: addDays(TODAY, 10),
      closingDate: addDays(TODAY, 3),
      total: 1_200_00,
      minimumPayment: 180_00,
      currency: 'BRL',
    },
  ];
}

const LOAN: LoanDto = {
  id: 'loan-1',
  connectionId: 'conn-1',
  institutionName: 'Banco Teste',
  productName: 'Crédito pessoal',
  type: 'PERSONAL_LOAN',
  contractNumber: '42',
  contractedAmount: 10_000_00,
  outstandingBalance: 7_654_32,
  currency: 'BRL',
  contractDate: '2025-01-10',
  finalDueDate: '2028-01-10',
  installments: { total: 36, paid: 20, remaining: 16, overdue: 1 },
  nextInstallment: { dueDate: addDays(TODAY, 5), amount: 410_00 },
  installmentAmount: 410_00,
  interestRateAnnual: 21.4,
  cetAnnual: 24.9,
  periodicity: 'Mensal',
  updatedAt: new Date().toISOString(),
};

/** Supertest: corpo binário como Buffer. */
const binary = (res: request.Response, done: (error: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks)));
};

describe('Exportação (e2e)', () => {
  let app: INestApplication;
  let provider: InMemoryProvider;

  beforeAll(async () => {
    provider = new InMemoryProvider();
    app = await createTestApp(provider);
    await resetDatabase(app);
    seed(provider);
    await app.get(SyncService).run('MANUAL');
    await request(app.getHttpServer())
      .post('/api/planning/commitments')
      .send({
        name: 'Parcela do terreno',
        amount: 2_300_00,
        dayOfMonth: 10,
        paymentMethod: 'BOLETO',
        startsOn: '2023-09-10',
        installmentsTotal: 120,
      })
      .expect(201);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const download = (query: Record<string, string>) =>
    http().get('/api/export').query(query).buffer(true).parse(binary);

  it('options: formatos, seções na ordem, período padrão e limite', async () => {
    const res = await http().get('/api/export/options').expect(200);
    expect(res.body.formats.map((f: { id: string }) => f.id)).toEqual(['xlsx', 'pdf', 'csv', 'md']);
    expect(res.body.formats[2]).toMatchObject({ id: 'csv', extension: 'zip' });
    expect(res.body.formats[0]).toEqual({
      id: 'xlsx',
      label: expect.any(String),
      extension: 'xlsx',
      description: expect.any(String),
    });
    expect(res.body.sections.map((s: { id: string }) => s.id)).toEqual([...SECTION_IDS]);
    expect(res.body.sections[0]).toEqual({
      id: 'resumo',
      label: 'Resumo',
      description: expect.any(String),
    });
    expect(res.body.defaultPeriod).toEqual({ from: DEFAULT_FROM, to: TODAY });
    expect(res.body.maxMonths).toBe(24);
  });

  it.each([
    ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx', 'PK'],
    ['pdf', 'application/pdf', 'pdf', '%PDF'],
    ['csv', 'application/zip', 'zip', 'PK'],
    ['md', 'text/markdown; charset=utf-8', 'md', '# Meu Caixa'],
  ])(
    '%s: 200 com tipo, nome do arquivo e conteúdo',
    async (format, type, extension, magic) => {
      const res = await download({ format }).expect(200);
      expect(res.headers['content-type']).toBe(type);
      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="meu-caixa_${DEFAULT_FROM}_a_${TODAY}.${extension}"`,
      );
      const body = res.body as Buffer;
      expect(body.length).toBeGreaterThan(500);
      expect(body.subarray(0, magic.length).toString('utf8')).toBe(magic);
    },
    30_000,
  );

  it('markdown traz os dados sincronizados, o planejamento e os empréstimos', async () => {
    vi.spyOn(app.get(LoansService), 'list').mockResolvedValue([LOAN]);
    const md = ((await download({ format: 'md' }).expect(200)).body as Buffer).toString('utf8');
    expect(md).toContain('| Saldo em contas | R$ 5.432,10 |');
    expect(md).toContain('| Dívida dos cartões (em aberto) | R$ 1.200,00 |');
    expect(md).toContain('Cartão Teste: a conexão precisa de ação');
    expect(md).toContain('| Mercado São Jorge |');
    expect(md).toContain('-R$ 432,10');
    expect(md).toContain('Geladeira Nova');
    expect(md).toContain('Parcela do terreno');
    expect(md).toContain('| Banco Teste | Crédito pessoal | 42 | R$ 10.000,00 | R$ 7.654,32 |');
    expect(md).toContain('Nenhuma análise do Claude salva ainda');
    // Fora do período.
    expect(md).not.toContain('Compra antiga');
  });

  it('sem empréstimos, explica que o banco pode não compartilhar', async () => {
    const md = (
      (await download({ format: 'md', sections: 'emprestimos' }).expect(200)).body as Buffer
    ).toString('utf8');
    expect(md).toMatch(/Nem todo banco compartilha empréstimos pelo Open Finance/);
  });

  it('filtra seções e período', async () => {
    const from = monthRange(PREVIOUS).from;
    const to = monthRange(PREVIOUS).to;
    const res = await download({ format: 'md', sections: 'transacoes,contas', from, to }).expect(
      200,
    );
    expect(res.headers['content-disposition']).toContain(`meu-caixa_${from}_a_${to}.md`);
    const md = (res.body as Buffer).toString('utf8');
    expect(md.match(/^## \d+\. .+$/gm)).toEqual(['## 1. Contas', '## 2. Transações']);
    expect(md).toContain('Mercado São Jorge');
    expect(md).not.toContain('Compra de hoje');

    const zip = unzipSync(
      new Uint8Array((await download({ format: 'csv', sections: 'fluxo' }).expect(200)).body),
    );
    expect(Object.keys(zip)).toEqual(['11-fluxo.csv', 'LEIA-ME.txt']);
    expect(strFromU8(zip['11-fluxo.csv']!)).toContain('8000,00');
  });

  it('data futura vira hoje', async () => {
    const res = await download({ format: 'md', to: addDays(TODAY, 40) }).expect(200);
    expect(res.headers['content-disposition']).toContain(`_a_${TODAY}.md`);
    expect((res.body as Buffer).toString('utf8')).toContain(
      'está no futuro e foi trocada por hoje',
    );
  });

  it.each([
    [{}, /Informe o formato/],
    [{ format: 'docx' }, /Formato "docx" inválido/],
    [{ format: 'pdf', from: '2026-13-01' }, /Data inicial inválida/],
    [{ format: 'pdf', from: '2026-05-10', to: '2026-05-01' }, /data final deve ser/],
    [{ format: 'pdf', from: '2020-01-01', to: '2023-01-01' }, /no máximo 24 meses/],
    [{ format: 'pdf', sections: 'resumo,foo' }, /Seção desconhecida: foo/],
  ])('400 para %o', async (query, message) => {
    const res = await http().get('/api/export').query(query).expect(400);
    expect(res.body.message).toMatch(message);
  });
});

describe('Exportação sem login (e2e)', () => {
  let app: INestApplication;
  let keycloak: FakeKeycloak;

  beforeAll(async () => {
    keycloak = new FakeKeycloak();
    await keycloak.start();
    app = await createTestApp(new InMemoryProvider(), {
      realAuth: true,
      env: {
        KEYCLOAK_URL: keycloak.url,
        KEYCLOAK_REALM: keycloak.realm,
        KEYCLOAK_CLIENT_ID: keycloak.clientId,
        KEYCLOAK_CLIENT_SECRET: keycloak.clientSecret,
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await keycloak.stop();
  });

  it('401 sem sessão', async () => {
    await request(app.getHttpServer()).get('/api/export/options').expect(401);
    await request(app.getHttpServer()).get('/api/export').query({ format: 'md' }).expect(401);
  });
});
