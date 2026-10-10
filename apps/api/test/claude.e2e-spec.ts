import type { INestApplication } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { AnalysisRunsService } from '../src/claude/analysis-runs.service.js';
import { FAILURE_MESSAGES } from '../src/claude/claude-errors.js';
import { SAVE_REMINDER, SERVER_SIDE_FALLBACK_BETA } from '../src/claude/prompts.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { analysisRuns } from '../src/database/schema.js';
import { SyncService } from '../src/sync/sync.service.js';
import { createTestApp, resetDatabase } from './app.js';
import {
  apiError,
  endTurn,
  FakeClaude,
  gate,
  refusal,
  type RecordedRequest,
  toolUse,
} from './fake-claude.js';
import { InMemoryProvider } from './in-memory-provider.js';

const READ_TOOLS = [
  'resumo_financeiro',
  'listar_contas',
  'buscar_transacoes',
  'gastos_por_categoria',
  'fluxo_de_caixa',
  'recorrencias',
  'planejamento',
  'ultima_analise',
];

const validReport = {
  period: { from: '2026-07-01', to: '2026-09-30' },
  headline: 'Delivery é o maior gasto supérfluo',
  summary: 'Sobra dinheiro todo mês, mas o delivery cresce.',
  monthlyFixed: 455_90,
  monthlyDiscretionary: 189_00,
  potentialMonthlySavings: 60_00,
  insights: [
    {
      kind: 'SIN',
      title: 'Delivery três vezes por mês',
      explanation: 'Trocar um pedido por comida feita em casa economiza cerca de R$ 60.',
      monthlySavings: 60_00,
      evidence: {
        label: 'Delivery',
        occurrences: 9,
        total: 567_00,
        period: { from: '2026-07-01', to: '2026-09-30' },
      },
      confidence: 'HIGH',
    },
  ],
};

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
      name: 'Conta corrente',
      number: '1',
      currency: 'BRL',
      balance: 5_000_00,
      creditLimit: null,
      availableCredit: null,
    },
  ];
  provider.transactions = [];
  provider.invoices = [];
}

/** Bloco `tool_result` da última mensagem do usuário num pedido gravado. */
function lastToolResult(request: RecordedRequest) {
  const last = request.body.messages.at(-1);
  return last.content.find((block: { type: string }) => block.type === 'tool_result');
}

describe('Análise pela interface — desligada sem ANTHROPIC_API_KEY (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp(new InMemoryProvider());
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('status diz que está desligada e as ações respondem 503 em português', async () => {
    const http = request(app.getHttpServer());
    await http
      .get('/api/analysis/status')
      .expect(200, { app: { enabled: false, model: null }, latestRun: null });

    const run = await request(app.getHttpServer()).post('/api/analysis/runs').expect(503);
    expect(run.body.message).toContain('ANTHROPIC_API_KEY');
    const ask = await request(app.getHttpServer())
      .post('/api/analysis/ask')
      .send({ question: 'Quanto gastei?' })
      .expect(503);
    expect(ask.body.message).toContain('ANTHROPIC_API_KEY');
  });
});

describe('Análise pela interface — API da Anthropic (e2e)', () => {
  let app: INestApplication;
  let fake: FakeClaude;
  let runs: AnalysisRunsService;
  let db: Database;

  beforeAll(async () => {
    fake = new FakeClaude();
    const provider = new InMemoryProvider();
    seed(provider);
    app = await createTestApp(provider, {
      env: { ANTHROPIC_API_KEY: fake.apiKey },
      anthropic: fake.client,
    });
    await resetDatabase(app);
    await app.get(SyncService).run('MANUAL');
    runs = app.get(AnalysisRunsService);
    db = app.get<Database>(DATABASE);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table analysis_runs, analysis_reports cascade`);
  });

  const http = () => request(app.getHttpServer());

  async function startAndFinish() {
    const started = await http().post('/api/analysis/runs').expect(202);
    expect(started.body).toMatchObject({
      status: 'RUNNING',
      finishedAt: null,
      error: null,
      reportId: null,
      model: 'claude-opus-5-5',
    });
    await runs.waitForIdle();
    const { body } = await http().get(`/api/analysis/runs/${started.body.id}`).expect(200);
    return body;
  }

  it('status: ligada, com o modelo configurado e sem execuções', async () => {
    await http()
      .get('/api/analysis/status')
      .expect(200, { app: { enabled: true, model: 'claude-opus-5-5' }, latestRun: null });
  });

  it('gera a análise: resumo_financeiro → salvar_analise → SUCCEEDED e aparece em /latest', async () => {
    fake.script(
      toolUse('resumo_financeiro'),
      toolUse('salvar_analise', validReport),
      endTurn('Análise salva.'),
    );

    const run = await startAndFinish();
    expect(run).toMatchObject({ status: 'SUCCEEDED', error: null, model: 'claude-opus-5-5' });
    expect(run.reportId).toEqual(expect.any(String));
    expect(Date.parse(run.finishedAt)).toBeGreaterThanOrEqual(Date.parse(run.startedAt));

    const latest = await http().get('/api/analysis/latest').expect(200);
    expect(latest.body).toMatchObject({
      id: run.reportId,
      source: 'APP',
      model: 'claude-opus-5-5',
      headline: validReport.headline,
    });

    const status = await http().get('/api/analysis/status').expect(200);
    expect(status.body.latestRun).toEqual(run);

    // Uso somado das 3 chamadas fica gravado na execução.
    const [row] = await db.select().from(analysisRuns);
    expect(row!.usage).toEqual({
      requests: 3,
      inputTokens: 300,
      outputTokens: 60,
      cacheCreationInputTokens: 90,
      cacheReadInputTokens: 150,
    });

    // Formato do pedido: fallback do servidor, effort, cache, streaming, sem thinking/tool_choice.
    expect(fake.requests).toHaveLength(3);
    const [first, second] = fake.requests;
    expect(first!.url).toBe('http://anthropic.test/v1/messages?beta=true');
    expect(first!.headers['anthropic-beta']).toContain(SERVER_SIDE_FALLBACK_BETA);
    expect(first!.headers['x-api-key']).toBe(fake.apiKey);
    expect(first!.body).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 64_000,
      stream: true,
      fallbacks: 'default',
      output_config: { effort: 'high' },
      cache_control: { type: 'ephemeral' },
    });
    expect(first!.body).not.toHaveProperty('thinking');
    expect(first!.body).not.toHaveProperty('tool_choice');
    expect(first!.body).not.toHaveProperty('max_iterations');
    expect(first!.body.system.at(-1).cache_control).toEqual({ type: 'ephemeral' });
    expect(first!.body.system[0].text).toContain('Meu Caixa');
    expect(first!.body.tools.map((tool: { name: string }) => tool.name)).toEqual([
      ...READ_TOOLS.slice(0, 7),
      'salvar_analise',
      'ultima_analise',
    ]);
    // O modelo é gravado pelo servidor: não aparece no schema de salvar_analise.
    const save = first!.body.tools.find((tool: { name: string }) => tool.name === 'salvar_analise');
    expect(save.input_schema.properties).not.toHaveProperty('model');
    // Campos com default não são obrigatórios para o Claude.
    const search = first!.body.tools.find((t: { name: string }) => t.name === 'buscar_transacoes');
    expect(search.input_schema.required ?? []).not.toContain('limite');
    expect(JSON.stringify(first!.body.tools)).not.toContain('$ref');

    const result = lastToolResult(second!);
    expect(result.is_error).toBeFalsy();
    expect(JSON.parse(result.content)).toHaveProperty('hoje');
  });

  it('salvar_analise inválido volta como erro para o Claude corrigir', async () => {
    fake.script(
      toolUse('salvar_analise', { ...validReport, insights: [] }),
      toolUse('salvar_analise', validReport),
      endTurn('Salvo.'),
    );

    const run = await startAndFinish();
    expect(run.status).toBe('SUCCEEDED');
    const result = lastToolResult(fake.requests[1]!);
    expect(result.is_error).toBe(true);
    expect(result.content).toContain('Entrada inválida');
  });

  it('erro da API depois de salvar não derruba a execução (o relatório já está salvo)', async () => {
    fake.script(toolUse('salvar_analise', validReport), apiError(529, 'overloaded_error'));
    const run = await startAndFinish();
    expect(run).toMatchObject({ status: 'SUCCEEDED', error: null });
    expect(run.reportId).toEqual(expect.any(String));
  });

  it('termina sem salvar: lembra uma vez e então FAILED com mensagem clara', async () => {
    fake.script(endTurn('Aqui está a análise em texto.'), endTurn('Pronto.'));

    const run = await startAndFinish();
    expect(run).toMatchObject({
      status: 'FAILED',
      reportId: null,
      error: FAILURE_MESSAGES.NOT_SAVED,
    });
    expect(fake.requests).toHaveLength(2);
    const reminder = fake.requests[1]!.body.messages.at(-1);
    expect(reminder).toEqual({ role: 'user', content: SAVE_REMINDER });
    await http().get('/api/analysis/latest').expect(404);
  });

  it('recusa e chave inválida viram FAILED com mensagem em português, sem vazar a chave', async () => {
    fake.script(refusal());
    expect(await startAndFinish()).toMatchObject({
      status: 'FAILED',
      error: FAILURE_MESSAGES.REFUSAL,
    });

    fake.script(apiError(401, 'authentication_error', `invalid x-api-key ${fake.apiKey}`));
    const run = await startAndFinish();
    expect(run).toMatchObject({ status: 'FAILED', error: FAILURE_MESSAGES.AUTH });
    expect(run.error).not.toContain(fake.apiKey);
  });

  it('limite de 25 voltas no loop de ferramentas: FAILED sem chamar a API de novo', async () => {
    fake.script(...Array.from({ length: 25 }, () => toolUse('listar_contas')));
    const run = await startAndFinish();
    expect(run).toMatchObject({ status: 'FAILED', error: FAILURE_MESSAGES.ITERATION_LIMIT });
    expect(fake.requests).toHaveLength(25);
    expect(fake.pending).toBe(0);
  });

  it('uma execução por vez (409) e execução travada há mais de 30 min vira FAILED', async () => {
    const [running] = await db
      .insert(analysisRuns)
      .values({ status: 'RUNNING', model: 'claude-opus-5-5' })
      .returning();
    const conflict = await http().post('/api/analysis/runs').expect(409);
    expect(conflict.body.message).toContain('Já existe uma análise');

    await db
      .update(analysisRuns)
      .set({ startedAt: new Date(Date.now() - 31 * 60_000) })
      .where(sql`${analysisRuns.id} = ${running!.id}`);
    fake.script(toolUse('salvar_analise', validReport), endTurn('Salvo.'));
    expect((await startAndFinish()).status).toBe('SUCCEEDED');

    const stale = await http().get(`/api/analysis/runs/${running!.id}`).expect(200);
    expect(stale.body).toMatchObject({
      status: 'FAILED',
      error: expect.stringContaining('Interrompida'),
    });
  });

  it('409 também enquanto uma execução real está em andamento', async () => {
    const hold = gate();
    fake.script(async () => {
      await hold.promise;
      return toolUse('salvar_analise', validReport);
    }, endTurn('Salvo.'));

    const started = await http().post('/api/analysis/runs').expect(202);
    await http().post('/api/analysis/runs').expect(409);
    hold.release();
    await runs.waitForIdle();
    await http()
      .get(`/api/analysis/runs/${started.body.id}`)
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('SUCCEEDED'));
  });

  it('GET /runs/:id: 404 para id desconhecido ou inválido', async () => {
    await http().get('/api/analysis/runs/00000000-0000-4000-8000-000000000000').expect(404);
    await http().get('/api/analysis/runs/nao-e-uuid').expect(404);
  });

  it('pergunta: só ferramentas de leitura, histórico como turnos anteriores, effort medium', async () => {
    fake.script(
      toolUse('buscar_transacoes', { tipo: 'gastos' }),
      endTurn('Você gastou **R$ 0,00** no período.'),
    );
    const history = [
      { role: 'user', content: 'Oi' },
      { role: 'assistant', content: 'Olá! Como posso ajudar?' },
    ];

    const { body } = await http()
      .post('/api/analysis/ask')
      .send({ question: '  Quanto gastei com delivery?  ', history })
      .expect(200);
    expect(body).toEqual({
      answer: 'Você gastou **R$ 0,00** no período.',
      model: 'claude-opus-5-5',
    });

    const [first, second] = fake.requests;
    expect(first!.body).toMatchObject({
      max_tokens: 16_000,
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      cache_control: { type: 'ephemeral' },
    });
    expect(first!.headers['anthropic-beta']).toContain(SERVER_SIDE_FALLBACK_BETA);
    expect(first!.body.tools.map((tool: { name: string }) => tool.name)).toEqual(READ_TOOLS);
    expect(first!.body.messages.slice(0, 2)).toEqual(history);
    const question = first!.body.messages[2];
    expect(question.role).toBe('user');
    expect(question.content.at(-1)).toEqual({ type: 'text', text: 'Quanto gastei com delivery?' });
    expect(JSON.parse(lastToolResult(second!).content)).toHaveProperty('encontradas', 0);
  });

  it('pergunta: uma por vez (429)', async () => {
    const hold = gate();
    fake.script(async () => {
      await hold.promise;
      return endTurn('Primeira resposta.');
    });

    const first = http()
      .post('/api/analysis/ask')
      .send({ question: 'Primeira?' })
      .then((r) => r);
    // Espera a primeira chegar ao Claude antes de mandar a segunda.
    await vi.waitFor(() => expect(fake.requests).toHaveLength(1));
    const second = await http()
      .post('/api/analysis/ask')
      .send({ question: 'Segunda?' })
      .expect(429);
    expect(second.body.message).toContain('pergunta anterior');
    hold.release();
    expect((await first).body.answer).toBe('Primeira resposta.');
  });

  it('pergunta: erro da Anthropic vira 502 com mensagem em português', async () => {
    fake.script(apiError(529, 'overloaded_error', 'Overloaded'));
    const { body } = await http().post('/api/analysis/ask').send({ question: 'Oi?' }).expect(502);
    expect(body.message).toBe(FAILURE_MESSAGES.OVERLOADED);
  });

  it.each([
    ['sem pergunta', {}],
    ['pergunta vazia', { question: '   ' }],
    ['pergunta longa demais', { question: 'a'.repeat(1001) }],
    [
      'histórico com mais de 10 itens',
      { question: 'Oi', history: Array(11).fill({ role: 'user', content: 'x' }) },
    ],
    [
      'papel inválido no histórico',
      { question: 'Oi', history: [{ role: 'system', content: 'x' }] },
    ],
    [
      'conteúdo longo demais',
      { question: 'Oi', history: [{ role: 'user', content: 'a'.repeat(8001) }] },
    ],
    ['campo desconhecido', { question: 'Oi', model: 'outro' }],
  ])('pergunta inválida (400): %s', async (_case, body) => {
    fake.script();
    await http().post('/api/analysis/ask').send(body).expect(400);
    expect(fake.requests).toHaveLength(0);
  });
});
