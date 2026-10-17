import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import request from 'supertest';
import { today } from '../src/domain/dates.js';
import type { Transaction } from '../src/domain/finance.js';
import { monthOf, monthRange, shiftMonth } from '../src/domain/months.js';
import { SyncService } from '../src/sync/sync.service.js';
import { createTestApp, resetDatabase } from './app.js';
import { FakeKeycloak } from './fake-keycloak.js';
import { InMemoryProvider } from './in-memory-provider.js';

const TODAY = today('America/Sao_Paulo');
const CURRENT_MONTH = monthOf(TODAY);
const CLOSED = [-3, -2, -1].map((offset) => shiftMonth(CURRENT_MONTH, offset));
const LAST_CLOSED = CLOSED[2]!;

const RESOURCE = 'http://api.test/mcp';
const METADATA_URL = 'http://api.test/.well-known/oauth-protected-resource/mcp';
const ACCESS_TOKEN = 'segredo-de-acesso-ao-mcp-dos-testes-0123456789';

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

/** Por mês fechado: R$ 9.000 de salário e R$ 644,90 de gasto (mercado, streaming, 3 deliveries). */
const DELIVERY_PER_MONTH = 3 * 50_00 + (3 + 13 + 23) * 100;
const SPENDING_PER_MONTH = 400_00 + 55_90 + DELIVERY_PER_MONTH;

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
    {
      externalId: 'card',
      connectionExternalId: 'item-1',
      type: 'CREDIT_CARD',
      name: 'Cartão',
      number: '9',
      currency: 'BRL',
      balance: 1_200_00,
      creditLimit: 10_000_00,
      availableCredit: 8_800_00,
    },
  ];
  provider.transactions = [
    ...CLOSED.flatMap((month) => {
      const day = (d: number) => `${month}-${String(d).padStart(2, '0')}`;
      return [
        tx(`salario-${month}`, 'checking', day(5), 9_000_00, 'Salary'),
        tx(`mercado-${month}`, 'checking', day(12), -400_00, 'Groceries', {
          counterpartyName: 'Mercado Bom',
        }),
        tx(`fatura-${month}`, 'checking', day(15), -800_00, 'Credit card payment'),
        tx(`aporte-${month}`, 'checking', day(6), -1_500_00, 'Transfer - Savings'),
        tx(`streaming-${month}`, 'card', day(1), -55_90, 'Video streaming', {
          description: `STREAMING PLUS ${month}`,
        }),
        ...[3, 13, 23].map((d) =>
          tx(`delivery-${month}-${d}`, 'card', day(d), -(50_00 + d * 100), 'Food delivery', {
            description: 'Pedido delivery',
            counterpartyName: 'Delivery Exemplo',
          }),
        ),
      ];
    }),
    tx(`streaming-${CURRENT_MONTH}`, 'card', `${CURRENT_MONTH}-01`, -55_90, 'Video streaming', {
      description: `STREAMING PLUS ${CURRENT_MONTH}`,
    }),
  ];
  provider.invoices = [];
}

const validReport = {
  period: { from: monthRange(CLOSED[0]!).from, to: monthRange(LAST_CLOSED).to },
  headline: 'Delivery é o maior gasto supérfluo',
  summary: 'Sobra dinheiro todo mês, mas o delivery cresce.',
  monthlyFixed: 455_90,
  monthlyDiscretionary: DELIVERY_PER_MONTH,
  potentialMonthlySavings: 100_00,
  insights: [
    {
      kind: 'SIN',
      title: 'Delivery três vezes por mês',
      explanation: 'Trocar um pedido por comida feita em casa economiza cerca de R$ 60.',
      monthlySavings: 60_00,
      evidence: {
        label: 'Delivery',
        occurrences: 9,
        total: 3 * DELIVERY_PER_MONTH,
        period: { from: monthRange(CLOSED[0]!).from, to: monthRange(LAST_CLOSED).to },
      },
      confidence: 'HIGH',
    },
    {
      kind: 'SUGGESTION',
      title: 'Reserva de emergência',
      explanation: 'Direcione parte da sobra para a reserva.',
      monthlySavings: null,
      evidence: null,
      confidence: 'MEDIUM',
    },
  ],
  model: 'claude-teste',
};

describe('Servidor MCP (e2e)', () => {
  let app: INestApplication;
  let keycloak: FakeKeycloak;
  let provider: InMemoryProvider;
  let baseUrl: string;
  const clients: Client[] = [];

  beforeAll(async () => {
    keycloak = new FakeKeycloak();
    await keycloak.start();
    provider = new InMemoryProvider();
    app = await createTestApp(provider, {
      env: {
        KEYCLOAK_URL: keycloak.url,
        KEYCLOAK_REALM: keycloak.realm,
        KEYCLOAK_CLIENT_ID: keycloak.clientId,
        KEYCLOAK_CLIENT_SECRET: keycloak.clientSecret,
        MCP_ACCESS_TOKEN: ACCESS_TOKEN,
      },
    });
    const server = app.getHttpServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    await resetDatabase(app);
    seed(provider);
    expect(await app.get(SyncService).run('MANUAL')).toMatchObject({ status: 'SUCCEEDED' });

    const category = await http()
      .post('/api/planning/categories')
      .send({
        name: 'Delivery',
        kind: 'DISCRETIONARY',
        sourceCategories: ['Food delivery'],
        monthlyBudget: 150_00,
      })
      .expect(201);
    await http()
      .post('/api/planning/commitments')
      .send({
        name: 'Parcela do terreno',
        amount: 2_300_00,
        dayOfMonth: 10,
        paymentMethod: 'BOLETO',
        startsOn: `${CLOSED[0]}-01`,
        installmentsTotal: 120,
        categoryId: null,
      })
      .expect(201);
    await http()
      .post('/api/planning/goals')
      .send({
        name: 'Entrada do carro',
        target: 30_000_00,
        saved: 6_000_00,
        targetDate: `${monthRange(shiftMonth(CURRENT_MONTH, 12)).to}`,
        monthlyContribution: 1_500_00,
      })
      .expect(201);
    expect(category.body.id).toEqual(expect.any(String));
  });

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.close()));
  });

  afterAll(async () => {
    await app.close();
    await keycloak.stop();
  });

  const http = () => request(app.getHttpServer());

  async function connect(token: string): Promise<Client> {
    const client = new Client({ name: 'teste-e2e', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    });
    await client.connect(transport);
    clients.push(client);
    return client;
  }

  const claudeToken = () => keycloak.mintAccessToken({ audience: [RESOURCE, 'web'] });

  async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
    const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
    expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
    expect(JSON.parse(textOf(result))).toEqual(result.structuredContent);
    return result.structuredContent as Record<string, any>;
  }

  const textOf = (result: CallToolResult) => (result.content[0] as { text: string }).text;

  const initialize = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'curl', version: '1' },
    },
  };

  describe('autorização', () => {
    it('sem token: 401 apontando para os metadados do recurso protegido', async () => {
      const response = await http()
        .post('/mcp')
        // O cookie de sessão nunca vale no /mcp.
        .set('Cookie', 'meu_caixa_sid=s%3Aqualquer.coisa')
        .set('Accept', 'application/json, text/event-stream')
        .send(initialize)
        .expect(401);
      expect(response.headers['www-authenticate']).toMatch(/^Bearer /);
      expect(response.headers['www-authenticate']).toContain(`resource_metadata="${METADATA_URL}"`);
      expect(response.headers['set-cookie']).toBeUndefined();

      for (const path of [
        '/.well-known/oauth-protected-resource/mcp',
        '/.well-known/oauth-protected-resource',
      ]) {
        const metadata = await http().get(path).expect(200);
        expect(metadata.body).toMatchObject({
          resource: RESOURCE,
          authorization_servers: [keycloak.issuer],
          bearer_methods_supported: ['header'],
        });
      }
    });

    it('o cliente do SDK sem token não conecta', async () => {
      const client = new Client({ name: 'sem-token', version: '1.0.0' });
      const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
      await expect(client.connect(transport)).rejects.toMatchObject({ code: 401 });
    });

    it('recusa token inválido ou expirado', async () => {
      const response = await http()
        .post('/mcp')
        .set('Authorization', 'Bearer inventado')
        .send(initialize);
      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toContain('error="invalid_token"');
    });

    it('recusa token do realm emitido para outra aplicação (audiência errada)', async () => {
      for (const token of [
        // Token da sessão da interface (client "web").
        keycloak.mintAccessToken({ clientId: 'web', audience: ['web', 'account'] }),
        // Client "claude" sem o mapper de audiência.
        keycloak.mintAccessToken({ audience: [] }),
        keycloak.mintAccessToken({ audience: ['http://outro-app.test/mcp'] }),
      ]) {
        const response = await http()
          .post('/mcp')
          .set('Authorization', `Bearer ${token}`)
          .send(initialize);
        expect(response.status).toBe(401);
        expect(response.body.error_description).toBe(
          'Token não foi emitido para este servidor MCP',
        );
      }
    });

    it('403 sem a role exigida', async () => {
      const token = keycloak.mintAccessToken({
        audience: [RESOURCE],
        user: { clientRoles: [], realmRoles: ['default-roles-meu-caixa'] },
      });
      const response = await http()
        .post('/mcp')
        .set('Authorization', `Bearer ${token}`)
        .send(initialize);
      expect(response.status).toBe(403);
      expect(response.headers['www-authenticate']).toContain('error="insufficient_scope"');
      await expect(connect(token)).rejects.toMatchObject({ code: 403 });
    });

    it('aceita o MCP_ACCESS_TOKEN e recusa um parecido', async () => {
      const client = await connect(ACCESS_TOKEN);
      expect((await client.listTools()).tools.length).toBeGreaterThan(0);
      await expect(connect(`${ACCESS_TOKEN}x`)).rejects.toMatchObject({ code: 401 });
    });

    it('GET e DELETE não existem no modo sem estado; /api/mcp também não', async () => {
      await http().get('/mcp').set('Authorization', `Bearer ${ACCESS_TOKEN}`).expect(405);
      await http().delete('/mcp').set('Authorization', `Bearer ${ACCESS_TOKEN}`).expect(405);
      await http().post('/api/mcp').set('Authorization', `Bearer ${ACCESS_TOKEN}`).expect(404);
    });
  });

  describe('ferramentas', () => {
    it('lista as ferramentas com descrições e as instruções do servidor', async () => {
      const client = await connect(claudeToken());
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name)).toEqual([
        'resumo_financeiro',
        'listar_contas',
        'buscar_transacoes',
        'gastos_por_categoria',
        'fluxo_de_caixa',
        'recorrencias',
        'planejamento',
        'salvar_analise',
        'ultima_analise',
      ]);
      for (const tool of tools) {
        expect(tool.description!.length).toBeGreaterThan(80);
        expect(tool.inputSchema.type).toBe('object');
      }
      const search = tools.find((tool) => tool.name === 'buscar_transacoes')!;
      expect(Object.keys(search.inputSchema.properties ?? {})).toEqual([
        'de',
        'ate',
        'conta_id',
        'categoria',
        'texto',
        'tipo',
        'ordenar',
        'limite',
      ]);
      expect(tools.find((tool) => tool.name === 'salvar_analise')!.annotations).toMatchObject({
        readOnlyHint: false,
      });
      expect(client.getInstructions()).toContain('salvar_analise');
    });

    it('resumo_financeiro', async () => {
      const result = await call(await connect(claudeToken()), 'resumo_financeiro');
      expect(result).toMatchObject({
        hoje: TODAY,
        saldo_em_contas: { centavos: 5_000_00, brl: 'R$ 5.000,00' },
        divida_cartoes: { centavos: 1_200_00 },
        saldo_menos_divida_cartoes: { centavos: 3_800_00 },
        limite_total_cartoes: { centavos: 10_000_00 },
        limite_disponivel_cartoes: { centavos: 8_800_00 },
        quantidade_de_contas: { contas: 1, cartoes: 1 },
        mes_anterior: {
          mes: LAST_CLOSED,
          periodo: monthRange(LAST_CLOSED),
          receitas: { centavos: 9_000_00 },
          gastos: { centavos: SPENDING_PER_MONTH },
          resultado: { centavos: 9_000_00 - SPENDING_PER_MONTH },
        },
        mes_atual: { mes: CURRENT_MONTH, parcial: true, gastos: { centavos: 55_90 } },
        conexoes: [{ banco: 'Banco Teste', status: 'ACTIVE' }],
        ultima_sincronizacao: { status: 'SUCCEEDED', origem: 'MANUAL' },
      });
    });

    it('listar_contas', async () => {
      const result = await call(await connect(claudeToken()), 'listar_contas');
      expect(result.contas).toHaveLength(2);
      expect(result.contas).toContainEqual(
        expect.objectContaining({
          tipo: 'CREDIT_CARD',
          nome: 'Cartão',
          saldo: { centavos: 1_200_00, brl: 'R$ 1.200,00' },
          limite_disponivel: { centavos: 8_800_00, brl: 'R$ 8.800,00' },
        }),
      );
    });

    it('buscar_transacoes filtra, soma tudo e limita o que devolve', async () => {
      const client = await connect(claudeToken());
      const from = monthRange(CLOSED[0]!).from;
      const result = await call(client, 'buscar_transacoes', {
        de: from,
        texto: 'delivery',
        tipo: 'gastos',
        ordenar: 'maior_valor',
        limite: 2,
      });
      expect(result).toMatchObject({
        periodo: { de: from, ate: TODAY },
        encontradas: 9,
        retornadas: 2,
        truncado: true,
        soma_gastos: { centavos: 3 * DELIVERY_PER_MONTH },
        soma_receitas: { centavos: 0 },
      });
      expect(result.transacoes[0]).toMatchObject({
        valor: { centavos: -(50_00 + 23 * 100) },
        tipo: 'GASTO',
        categoria: 'Food delivery',
        categoria_nome: 'Delivery',
        conta: 'Cartão',
        contraparte: 'Delivery Exemplo',
      });

      const byCategory = await call(client, 'buscar_transacoes', {
        de: from,
        categoria: 'food delivery',
      });
      expect(byCategory.encontradas).toBe(9);

      const cardPayments = await call(client, 'buscar_transacoes', {
        de: from,
        tipo: 'pagamentos_fatura',
      });
      expect(cardPayments).toMatchObject({ encontradas: 3, soma_gastos: { centavos: 0 } });
    });

    it('buscar_transacoes recusa período invertido e argumentos inválidos', async () => {
      const client = await connect(claudeToken());
      const inverted = (await client.callTool({
        name: 'buscar_transacoes',
        arguments: { de: '2026-10-07', ate: '2026-10-01' },
      })) as CallToolResult;
      expect(inverted.isError).toBe(true);
      expect(textOf(inverted)).toBe('"de" deve ser anterior ou igual a "ate"');

      const invalid = (await client.callTool({
        name: 'buscar_transacoes',
        arguments: { de: '2026-02-30', limite: 1000 },
      })) as CallToolResult;
      expect(invalid.isError).toBe(true);
      expect(textOf(invalid)).toMatch(/Input validation error/);
    });

    it('gastos_por_categoria usa os 3 meses fechados e ignora fatura e transferência', async () => {
      const result = await call(await connect(claudeToken()), 'gastos_por_categoria');
      expect(result).toMatchObject({
        periodo: { de: monthRange(CLOSED[0]!).from, ate: monthRange(LAST_CLOSED).to },
        meses: CLOSED,
        periodo_inclui_mes_incompleto: false,
        total_gastos: { centavos: 3 * SPENDING_PER_MONTH },
        media_mensal_gastos: { centavos: SPENDING_PER_MONTH },
      });
      expect(result.categorias.map((c: { categoria: string }) => c.categoria)).toEqual([
        'Groceries',
        'Food delivery',
        'Video streaming',
      ]);
      expect(result.categorias[1]).toMatchObject({
        categoria_nome: 'Delivery',
        total: { centavos: 3 * DELIVERY_PER_MONTH },
        transacoes: 9,
        media_mensal: { centavos: DELIVERY_PER_MONTH },
        por_mes: CLOSED.map((mes) => ({ mes, total: { centavos: DELIVERY_PER_MONTH } })),
        variacao_ultimo_mes: { mes: LAST_CLOSED, diferenca: { centavos: 0 }, variacao_pct: 0 },
      });
    });

    it('fluxo_de_caixa mês a mês, com o mês atual parcial', async () => {
      const result = await call(await connect(claudeToken()), 'fluxo_de_caixa', { meses: 4 });
      expect(result.meses.map((m: { mes: string }) => m.mes)).toEqual([...CLOSED, CURRENT_MONTH]);
      expect(result.meses[0]).toMatchObject({
        parcial: false,
        receitas: { centavos: 9_000_00 },
        gastos: { centavos: SPENDING_PER_MONTH },
        resultado: { centavos: 9_000_00 - SPENDING_PER_MONTH },
        fora_da_conta: {
          pagamentos_de_fatura: { centavos: 800_00 },
          transferencias_para_contas_proprias: { centavos: 1_500_00 },
        },
      });
      expect(result.meses[3]).toMatchObject({ parcial: true, gastos: { centavos: 55_90 } });
      expect(result.media_meses_fechados).toMatchObject({
        meses: 3,
        receitas: { centavos: 9_000_00 },
        gastos: { centavos: SPENDING_PER_MONTH },
      });
    });

    it('recorrencias acha a assinatura e o hábito', async () => {
      const result = await call(await connect(claudeToken()), 'recorrencias');
      const byLabel = Object.fromEntries(
        result.recorrencias.map((r: { descricao: string }) => [r.descricao, r]),
      );
      expect(byLabel[`STREAMING PLUS ${CURRENT_MONTH}`]).toMatchObject({
        padrao: 'ASSINATURA_OU_CONTA_FIXA',
        ativa: true,
        ocorrencias: 4,
        meses_com_cobranca: [...CLOSED, CURRENT_MONTH],
        valor_tipico: { centavos: 55_90 },
        custo_mensal_estimado: { centavos: 55_90 },
        custo_anual_estimado: { centavos: 12 * 55_90 },
      });
      expect(byLabel['Pedido delivery']).toMatchObject({
        padrao: 'HABITO_FREQUENTE',
        contraparte: 'Delivery Exemplo',
        ocorrencias: 9,
        custo_mensal_estimado: { centavos: DELIVERY_PER_MONTH },
      });
      // Renda, fatura e transferência não são gasto recorrente.
      expect(Object.keys(byLabel)).not.toContain(`salario-${LAST_CLOSED}`);
      expect(Object.keys(byLabel)).not.toContain(`fatura-${LAST_CLOSED}`);
    });

    it('planejamento compara o teto com o gasto real', async () => {
      const result = await call(await connect(claudeToken()), 'planejamento');
      expect(result.meses_base_das_medias).toEqual(CLOSED);
      expect(result.compromissos_fixos).toHaveLength(1);
      expect(result.compromissos_fixos[0]).toMatchObject({
        nome: 'Parcela do terreno',
        valor: { centavos: 2_300_00, brl: 'R$ 2.300,00' },
        // Vence dia 10 desde 3 meses atrás; a de hoje ainda não conta como paga.
        parcelas: { pagas: Number(TODAY.slice(8)) > 10 ? 4 : 3, total: 120 },
        ativo_no_mes_atual: true,
      });
      expect(result.total_compromissos_mes_atual).toEqual({
        centavos: 2_300_00,
        brl: 'R$ 2.300,00',
      });
      expect(result.metas[0]).toMatchObject({
        nome: 'Entrada do carro',
        falta: { centavos: 24_000_00 },
        progresso_pct: 20,
        meses_ate_a_data_alvo: 12,
        aporte_mensal_necessario: { centavos: 2_000_00 },
        no_ritmo: false,
      });
      expect(result.categorias_de_orcamento).toHaveLength(1);
      expect(result.categorias_de_orcamento[0]).toMatchObject({
        nome: 'Delivery',
        tipo: 'DISCRICIONARIO',
        teto_mensal: { centavos: 150_00, brl: 'R$ 150,00' },
        gasto_mes_atual: { centavos: 0 },
        media_mensal_meses_base: { centavos: DELIVERY_PER_MONTH },
        media_acima_do_teto: true,
      });
      expect(result.gasto_medio_por_tipo).toMatchObject({
        discricionario: { centavos: DELIVERY_PER_MONTH },
        sem_categoria_de_orcamento: { centavos: 400_00 + 55_90 },
      });
      expect(result.projecao_proximos_meses).toHaveLength(6);
    });

    it('salvar_analise guarda o relatório e a API devolve', async () => {
      await resetAnalyses();
      await http().get('/api/analysis/latest').expect(404);
      const client = await connect(claudeToken());
      expect(await call(client, 'ultima_analise')).toEqual({ analise: null });

      const saved = await call(client, 'salvar_analise', validReport);
      expect(saved).toMatchObject({ salvo: true, id: expect.any(String), insights: 2 });

      const latest = await http().get('/api/analysis/latest').expect(200);
      const { model: _model, ...reportFields } = validReport;
      expect(latest.body).toMatchObject({
        ...reportFields,
        id: saved.id,
        source: 'MCP',
        model: 'claude-teste',
        generatedAt: saved.gerado_em,
      });
      expect(latest.body.insights[0].id).toEqual(expect.any(String));
      expect(latest.body.insights[0].id).not.toBe(latest.body.insights[1].id);

      const list = await http().get('/api/analysis').query({ limit: 5 }).expect(200);
      expect(list.body).toHaveLength(1);
      await http().get('/api/analysis').query({ limit: 500 }).expect(400);

      const again = await call(client, 'ultima_analise');
      expect(again.analise).toMatchObject({ id: saved.id, headline: validReport.headline });
    });

    it('salvar_analise recusa relatório inválido sem gravar nada', async () => {
      await resetAnalyses();
      const client = await connect(claudeToken());
      for (const report of [
        { ...validReport, insights: [] },
        { ...validReport, monthlyFixed: -10 },
        { ...validReport, period: { from: '2026-09-30', to: '2026-09-01' } },
        { ...validReport, insights: [{ ...validReport.insights[0], kind: 'OUTRO' }] },
        { headline: 'só isso' },
      ]) {
        const result = (await client.callTool({
          name: 'salvar_analise',
          arguments: report,
        })) as CallToolResult;
        expect(result.isError).toBe(true);
      }
      await http().get('/api/analysis/latest').expect(404);
    });
  });

  async function resetAnalyses() {
    const { DATABASE } = await import('../src/database/database.module.js');
    const { analysisReports } = await import('../src/database/schema.js');
    await app.get(DATABASE).delete(analysisReports);
  }
});
