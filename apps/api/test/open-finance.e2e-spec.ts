import type { INestApplication } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { DATABASE, type Database } from '../src/database/database.module.js';
import {
  accounts,
  appSettings,
  commitments,
  connections,
  goals,
  syncRuns,
  transactions,
} from '../src/database/schema.js';
import { OPEN_FINANCE_NOT_CONFIGURED } from '../src/integrations/open-finance/unconfigured-finance-provider.js';
import { MESSAGES } from '../src/settings/open-finance.service.js';
import { SyncService } from '../src/sync/sync.service.js';
import { createTestApp, FRONTEND_URL, resetDatabase } from './app.js';
import { FakePluggy } from './fake-pluggy.js';

const BASE = '/api/settings/open-finance';
const VALID = { clientId: 'cid-valido', clientSecret: 'segredo-valido' };

describe('Configurações → Open Finance (e2e)', () => {
  let pluggy: FakePluggy;
  let app: INestApplication;
  let db: Database;
  let sync: SyncService;

  beforeAll(async () => {
    pluggy = new FakePluggy();
    await pluggy.start();
    app = await createTestApp(null, {
      env: {
        PLUGGY_BASE_URL: pluggy.baseUrl,
        PLUGGY_MAX_RETRIES: '0',
        PROVIDER_CACHE_TTL_SECONDS: '0',
        SETTINGS_ENCRYPTION_KEY: 'chave-de-cifra-dos-testes-e2e-com-mais-de-32-caracteres',
      },
    });
    db = app.get<Database>(DATABASE);
    sync = app.get(SyncService);
  });

  beforeEach(async () => {
    await sync.waitForIdle();
    await resetDatabase(app);
    pluggy.reset();
  });

  afterAll(async () => {
    await sync.waitForIdle();
    await app.close();
    await pluggy.stop();
  });

  const http = () => request(app.getHttpServer());
  const put = (path: string, body: object) =>
    http().put(`${BASE}${path}`).set('Origin', FRONTEND_URL).send(body);
  const post = (path: string, body: object) =>
    http().post(`${BASE}${path}`).set('Origin', FRONTEND_URL).send(body);
  const del = (path: string) => http().delete(`${BASE}${path}`).set('Origin', FRONTEND_URL);

  async function configurePluggy(...itemIds: string[]) {
    await put('/credentials', VALID).expect(200);
    for (const itemId of itemIds) {
      await post('/items', { itemId }).expect(200);
      await sync.waitForIdle();
    }
  }

  const connectionIds = async () =>
    (await db.select().from(connections).orderBy(connections.externalId)).map(
      (row) => `${row.provider}:${row.externalId}`,
    );

  it('sem nada configurado: modo none, sem credenciais nem bancos', async () => {
    const { body } = await http().get(BASE).expect(200);
    expect(body).toEqual({
      mode: { value: 'none', source: 'default' },
      credentials: { configured: false, source: null, clientIdHint: null, updatedAt: null },
      items: { source: 'app', list: [] },
      connectUrl: 'https://meu.pluggy.ai',
    });

    // Sincronizar sem configuração não é erro: só não há o que buscar.
    const run = await sync.run('MANUAL');
    expect(run).toMatchObject({ status: 'SUCCEEDED', provider: 'none', errors: [] });
    expect(run.stats).toMatchObject({ connections: 0, accounts: 0, transactions: 0 });
  });

  it('confere as credenciais na Pluggy e guarda o segredo cifrado', async () => {
    const { body, text } = await put('/credentials', {
      clientId: '  cid-valido ',
      clientSecret: 'segredo-valido\n',
    }).expect(200);

    expect(body.credentials).toEqual({
      configured: true,
      source: 'app',
      clientIdHint: 'cid-vali…',
      updatedAt: expect.any(String),
    });
    expect(body.mode).toEqual({ value: 'pluggy', source: 'default' });
    expect(text).not.toContain('segredo-valido');
    expect(pluggy.authCalls).toEqual([VALID]);

    const [row] = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, 'open_finance.credentials'));
    const stored = row!.value as { clientId: string; clientSecret: string };
    expect(stored.clientId).toBe('cid-valido');
    expect(stored.clientSecret).toMatch(/^v1\.[0-9a-f]{8}\./);
    expect(JSON.stringify(row!.value)).not.toContain('segredo-valido');
    const { rows } = await db.execute(sql`select value::text as raw from app_settings`);
    for (const { raw } of rows as { raw: string }[]) expect(raw).not.toContain('segredo-valido');

    const settings = await http().get(BASE).expect(200);
    expect(settings.text).not.toContain('segredo-valido');
    expect(settings.body.credentials.configured).toBe(true);
  });

  it('recusa credenciais inválidas sem gravar nada', async () => {
    const { body } = await put('/credentials', { ...VALID, clientSecret: 'errado' }).expect(400);
    expect(body.message).toBe(MESSAGES.invalidCredentials);
    expect(await db.select().from(appSettings)).toEqual([]);

    const format = await put('/credentials', { clientId: 'com espaço', clientSecret: 'x' }).expect(
      400,
    );
    expect(format.body.message).toMatch(/formato inválido/);
    await put('/credentials', { clientId: 'cid-valido' }).expect(400);
    await put('/credentials', { ...VALID, clientSecret: 'x'.repeat(501) }).expect(400);
  });

  it('Pluggy fora do ar ou inalcançável: 502', async () => {
    pluggy.failure = 'down';
    const down = await put('/credentials', VALID).expect(502);
    expect(down.body.message).toBe(MESSAGES.pluggyUnreachable);

    pluggy.failure = 'drop';
    await put('/credentials', VALID).expect(502);
    expect(await db.select().from(appSettings)).toEqual([]);
  });

  it('apaga as credenciais do app', async () => {
    await put('/credentials', VALID).expect(200);
    const { body } = await del('/credentials').expect(200);
    expect(body.credentials).toEqual({
      configured: false,
      source: null,
      clientIdHint: null,
      updatedAt: null,
    });
    expect(body.mode.value).toBe('none');
  });

  it('adiciona um banco conferindo na Pluggy e sincroniza com as credenciais guardadas', async () => {
    await put('/credentials', VALID).expect(200);
    pluggy.authCalls.length = 0;

    const { body } = await post('/items', { itemId: 'item-banco-1' }).expect(200);
    expect(body.items).toEqual({
      source: 'app',
      list: [
        {
          id: 'item-banco-1',
          institutionName: 'Nubank',
          status: 'UPDATED',
          lastUpdatedAt: expect.any(String),
          error: null,
        },
      ],
    });

    await sync.waitForIdle();
    const [run] = await sync.listRuns(1);
    expect(run).toMatchObject({
      status: 'SUCCEEDED',
      provider: 'pluggy',
      trigger: 'MANUAL',
      stats: { connections: 1, accounts: 2, transactions: 3, invoices: 1 },
    });
    // A sincronização autenticou na Pluggy com as credenciais gravadas no app.
    expect(pluggy.authCalls.length).toBeGreaterThanOrEqual(2);
    for (const call of pluggy.authCalls) expect(call).toEqual(VALID);
    expect(pluggy.requests).toContain('GET /accounts');
    expect(pluggy.requests).toContain('GET /v2/transactions');

    const listed = await http().get('/api/accounts').expect(200);
    expect(listed.body.map((account: { name: string }) => account.name).sort()).toEqual([
      'Conta corrente',
      'Nubank Ultravioleta',
    ]);
  });

  it('mostra o status e o erro de cada banco depois da sincronização', async () => {
    await configurePluggy('item-banco-1', 'item-banco-2');
    const { body } = await http().get(BASE).expect(200);
    expect(body.items.list).toEqual([
      expect.objectContaining({ id: 'item-banco-1', status: 'UPDATED', error: null }),
      {
        id: 'item-banco-2',
        institutionName: 'Itaú',
        status: 'LOGIN_ERROR',
        lastUpdatedAt: expect.any(String),
        error: 'A senha do banco mudou',
      },
    ]);
  });

  it('recusa banco sem credenciais, inexistente, repetido ou com id inválido', async () => {
    const noCredentials = await post('/items', { itemId: 'item-banco-1' }).expect(409);
    expect(noCredentials.body.message).toBe(MESSAGES.noCredentials);

    await put('/credentials', VALID).expect(200);
    const notFound = await post('/items', { itemId: 'item-que-nao-existe' }).expect(400);
    expect(notFound.body.message).toBe(MESSAGES.itemNotFound);

    const invalid = await post('/items', { itemId: '../items' }).expect(400);
    expect(invalid.body.message).toMatch(/Id do item inválido/);
    await post('/items', {}).expect(400);

    await post('/items', { itemId: 'item-banco-1' }).expect(200);
    const duplicate = await post('/items', { itemId: 'item-banco-1' }).expect(409);
    expect(duplicate.body.message).toBe(MESSAGES.duplicateItem);

    pluggy.failure = 'down';
    await post('/items', { itemId: 'item-banco-2' }).expect(502);

    const { body } = await http().get(BASE).expect(200);
    expect(body.items.list.map((item: { id: string }) => item.id)).toEqual(['item-banco-1']);
  });

  it('remover um banco apaga o que foi sincronizado dele', async () => {
    await configurePluggy('item-banco-1', 'item-banco-2');
    expect(await connectionIds()).toEqual(['pluggy:item-banco-1', 'pluggy:item-banco-2']);

    const { body } = await del('/items/item-banco-1').expect(200);
    expect(body.items.list.map((item: { id: string }) => item.id)).toEqual(['item-banco-2']);
    await sync.waitForIdle();

    expect(await connectionIds()).toEqual(['pluggy:item-banco-2']);
    const remainingAccounts = await db.select().from(accounts);
    expect(remainingAccounts.map((account) => account.externalId)).toEqual(['b2-conta']);
    const remainingTransactions = await db.select().from(transactions);
    expect(remainingTransactions.map((transaction) => transaction.externalId)).toEqual(['b2-t1']);

    const missing = await del('/items/item-banco-1').expect(404);
    expect(missing.body.message).toBe(MESSAGES.itemNotInList);
    await del('/items/id%20inv%C3%A1lido').expect(400);
  });

  it('trocar de fictício para Pluggy apaga os dados fictícios e mantém o planejamento', async () => {
    const fake = await put('/mode', { mode: 'fake' }).expect(200);
    expect(fake.body.mode).toEqual({ value: 'fake', source: 'app' });
    await sync.waitForIdle();
    const fakeConnections = await connectionIds();
    expect(fakeConnections.length).toBeGreaterThan(0);
    expect(fakeConnections.every((id) => id.startsWith('fake:'))).toBe(true);

    // Recategorização e planejamento ligados aos dados fictícios.
    const [fakeTransaction] = await db.select().from(transactions).limit(1);
    await http()
      .patch(`/api/transactions/${fakeTransaction!.id}`)
      .set('Origin', FRONTEND_URL)
      .send({ category: 'Lazer' })
      .expect(200);
    const [fakeAccount] = await db.select().from(accounts).limit(1);
    await http()
      .post('/api/planning/goals')
      .set('Origin', FRONTEND_URL)
      .send({
        name: 'Entrada do carro',
        target: 30_000_00,
        targetDate: '2027-12-01',
        monthlyContribution: 1_000_00,
        accountId: fakeAccount!.id,
      })
      .expect(201);
    await http()
      .post('/api/planning/commitments')
      .set('Origin', FRONTEND_URL)
      .send({
        name: 'Parcela do terreno',
        amount: 2_300_00,
        dayOfMonth: 10,
        paymentMethod: 'BOLETO',
        startsOn: '2023-09-10',
      })
      .expect(201);

    // Credenciais e banco cadastrados com o modo ainda fictício: nada muda.
    await configurePluggy('item-banco-1');
    expect((await connectionIds()).every((id) => id.startsWith('fake:'))).toBe(true);

    const pluggyMode = await put('/mode', { mode: 'pluggy' }).expect(200);
    expect(pluggyMode.body.mode).toEqual({ value: 'pluggy', source: 'app' });
    await sync.waitForIdle();

    expect(await connectionIds()).toEqual(['pluggy:item-banco-1']);
    const providers = await db
      .selectDistinct({ provider: transactions.provider })
      .from(transactions);
    expect(providers).toEqual([{ provider: 'pluggy' }]);
    const [goal] = await db.select().from(goals);
    expect(goal).toMatchObject({ name: 'Entrada do carro', accountId: null });
    expect(await db.select().from(commitments)).toHaveLength(1);

    const [lastRun] = await sync.listRuns(1);
    expect(lastRun).toMatchObject({ provider: 'pluggy', status: 'SUCCEEDED' });
  });

  it('dados fictícios de antes (sem troca explícita) somem quando os bancos reais chegam', async () => {
    // Ex.: a API rodava com FINANCE_PROVIDER=fake e a variável foi tirada.
    await put('/mode', { mode: 'fake' }).expect(200);
    await sync.waitForIdle();
    await db.delete(appSettings).where(eq(appSettings.key, 'open_finance.mode'));
    expect((await connectionIds()).every((id) => id.startsWith('fake:'))).toBe(true);

    await configurePluggy('item-banco-1');
    expect(await connectionIds()).toEqual(['pluggy:item-banco-1']);
  });

  it('modo pluggy escolhido sem credenciais: não sincroniza à toa e, se pedirem, falha dizendo o que fazer', async () => {
    await put('/mode', { mode: 'pluggy' }).expect(200);
    await sync.waitForIdle();
    // Sem credenciais nem bancos não há o que buscar: a troca de modo não dispara sync.
    expect(await sync.listRuns(1)).toEqual([]);

    await sync.run('MANUAL');
    const [run] = await sync.listRuns(1);
    expect(run).toMatchObject({ status: 'FAILED', errors: [OPEN_FINANCE_NOT_CONFIGURED] });

    const invalid = await put('/mode', { mode: 'outro' }).expect(400);
    expect(invalid.body.message).toBe('O modo deve ser "pluggy" ou "fake"');
  });

  it('segredo ilegível (chave trocada ou valor corrompido) conta como não configurado', async () => {
    await put('/credentials', VALID).expect(200);
    await db
      .update(appSettings)
      .set({ value: { clientId: 'cid-valido', clientSecret: 'v1.00000000.aaaa.bbbb.cccc' } })
      .where(eq(appSettings.key, 'open_finance.credentials'));

    const { body } = await http().get(BASE).expect(200);
    expect(body.credentials.configured).toBe(false);
    expect(body.mode.value).toBe('none');
    await post('/items', { itemId: 'item-banco-1' }).expect(409);
  });

  it('mutações de outra origem levam 403 (CSRF)', async () => {
    await http()
      .put(`${BASE}/credentials`)
      .set('Origin', 'https://outro-site.example')
      .send(VALID)
      .expect(403);
    expect(pluggy.authCalls).toEqual([]);
  });

  it('uma troca de modo espera a sincronização em andamento terminar', async () => {
    await put('/mode', { mode: 'fake' }).expect(200);
    await sync.waitForIdle();
    const started = await sync.start('MANUAL');
    const switched = await put('/mode', { mode: 'pluggy' }).expect(200);
    expect(switched.body.mode.value).toBe('pluggy');
    expect((await started.completion).status).toBe('SUCCEEDED');
    await sync.waitForIdle();
    expect((await connectionIds()).some((id) => id.startsWith('fake:'))).toBe(false);
    const runs = await db.select().from(syncRuns);
    expect(runs.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Configurações → Open Finance definidas no ambiente (e2e)', () => {
  let pluggy: FakePluggy;
  let app: INestApplication;
  let sync: SyncService;

  beforeAll(async () => {
    pluggy = new FakePluggy();
    await pluggy.start();
    app = await createTestApp(null, {
      env: {
        FINANCE_PROVIDER: 'pluggy',
        PLUGGY_BASE_URL: pluggy.baseUrl,
        PLUGGY_CLIENT_ID: 'cid-valido',
        PLUGGY_CLIENT_SECRET: 'segredo-valido',
        PLUGGY_ITEM_IDS: 'item-banco-1, item-banco-2',
        PLUGGY_MAX_RETRIES: '0',
      },
    });
    sync = app.get(SyncService);
    await resetDatabase(app);
  });

  afterAll(async () => {
    await sync.waitForIdle();
    await app.close();
    await pluggy.stop();
  });

  const http = () => request(app.getHttpServer());
  const withOrigin = (test: request.Test) => test.set('Origin', FRONTEND_URL);

  it('mostra tudo como vindo do ambiente, sem o segredo', async () => {
    const { body, text } = await http().get(BASE).expect(200);
    expect(body.mode).toEqual({ value: 'pluggy', source: 'env' });
    expect(body.credentials).toEqual({
      configured: true,
      source: 'env',
      clientIdHint: 'cid-vali…',
      updatedAt: null,
    });
    expect(body.items.source).toBe('env');
    expect(body.items.list.map((item: { id: string }) => item.id)).toEqual([
      'item-banco-1',
      'item-banco-2',
    ]);
    expect(text).not.toContain('segredo-valido');
  });

  it('recusa alterar pelo app o que o ambiente define (409)', async () => {
    const mode = await withOrigin(http().put(`${BASE}/mode`))
      .send({ mode: 'fake' })
      .expect(409);
    expect(mode.body.message).toBe(MESSAGES.modeFromEnv);
    const credentials = await withOrigin(http().put(`${BASE}/credentials`))
      .send(VALID)
      .expect(409);
    expect(credentials.body.message).toBe(MESSAGES.credentialsFromEnv);
    await withOrigin(http().delete(`${BASE}/credentials`)).expect(409);
    const item = await withOrigin(http().post(`${BASE}/items`))
      .send({ itemId: 'item-novo' })
      .expect(409);
    expect(item.body.message).toBe(MESSAGES.itemsFromEnv);
    await withOrigin(http().delete(`${BASE}/items/item-banco-1`)).expect(409);
    expect(pluggy.authCalls).toEqual([]);
  });

  it('sincroniza com as credenciais e os bancos do ambiente', async () => {
    const run = await sync.run('MANUAL');
    expect(run).toMatchObject({
      status: 'SUCCEEDED',
      provider: 'pluggy',
      stats: { connections: 2, accounts: 3, transactions: 4, invoices: 1 },
    });
    expect(pluggy.authCalls[0]).toEqual(VALID);

    const { body } = await http().get(BASE).expect(200);
    expect(body.items.list[1]).toMatchObject({ institutionName: 'Itaú', status: 'LOGIN_ERROR' });
  });
});
