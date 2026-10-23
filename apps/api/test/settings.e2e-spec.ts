import type { INestApplication } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { DATABASE, type Database } from '../src/database/database.module.js';
import {
  FINANCE_PROVIDER_SOURCE,
  ProviderNotConfiguredError,
  type FinanceProviderSource,
} from '../src/integrations/finance-provider.js';
import { createTestApp, resetDatabase, TEST_USER } from './app.js';
import { InMemoryProvider } from './in-memory-provider.js';

const PLUGGY_URL = 'http://pluggy.test';
const CLIENT_ID = 'client-id-teste';
const SECRET = 'segredo-certo';
const ITEM = '236ebd9f-db05-4098-b7ed-f49eba8ab770';
const OTHER_ITEM = 'e39bdff2-2e31-4590-938c-aa91ccf096f0';
const UNKNOWN_ITEM = '00000000-0000-4000-8000-000000000000';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const ANTHROPIC_URL = 'http://anthropic.test';
const API_KEY = 'sk-ant-chave-certa';
const UNAVAILABLE_MODEL = 'claude-opus-5';

/**
 * Pluggy e Anthropic de mentira, só no que a validação usa: /auth e
 * /items/:id da Pluggy, /v1/models/:id da Anthropic.
 */
const realFetch = globalThis.fetch;
async function fakeApis(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input instanceof Request ? input.url : input));
  if (url.origin === ANTHROPIC_URL) return fakeAnthropic(url, init);
  if (url.origin !== PLUGGY_URL) return realFetch(input, init);
  if (url.pathname === '/auth') {
    const body = JSON.parse(String(init?.body)) as { clientId: string; clientSecret: string };
    return body.clientId === CLIENT_ID && body.clientSecret === SECRET
      ? json(200, { apiKey: 'api-key-de-teste' })
      : json(401, { message: 'invalid credentials' });
  }
  const item = url.pathname.match(/^\/items\/(.+)$/)?.[1];
  if (item === ITEM || item === OTHER_ITEM) {
    return json(200, { id: item, status: 'UPDATED', connector: { name: 'Banco Teste' } });
  }
  return json(404, { message: 'item not found' });
}

function fakeAnthropic(url: URL, init?: RequestInit): Response {
  const apiKey = new Headers(init?.headers).get('x-api-key');
  if (apiKey !== API_KEY) {
    return json(401, {
      type: 'error',
      error: { type: 'authentication_error', message: 'invalid x-api-key' },
    });
  }
  const model = url.pathname.match(/^\/v1\/models\/(.+)$/)?.[1];
  if (!model || model === UNAVAILABLE_MODEL) {
    return json(404, { type: 'error', error: { type: 'not_found_error', message: 'model' } });
  }
  return json(200, {
    type: 'model',
    id: model,
    display_name: model,
    created_at: '2026-01-01T00:00:00Z',
  });
}

describe('Configurações da Pluggy (e2e)', () => {
  let app: INestApplication;
  let db: Database;

  beforeAll(async () => {
    vi.stubGlobal('fetch', fakeApis);
    app = await createTestApp(null, {
      env: {
        FINANCE_PROVIDER: 'pluggy',
        SETTINGS_ENCRYPTION_KEY: 'ab'.repeat(32),
        PLUGGY_BASE_URL: PLUGGY_URL,
      },
    });
    db = app.get<Database>(DATABASE);
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllGlobals();
  });

  beforeEach(() => resetDatabase(app));

  const save = (body: object) =>
    request(app.getHttpServer()).put('/api/settings/pluggy').send(body);

  it('começa sem configuração e a sincronização pede para configurar', async () => {
    const res = await request(app.getHttpServer()).get('/api/settings/pluggy').expect(200);
    expect(res.body).toEqual({
      provider: 'pluggy',
      configured: false,
      clientId: null,
      itemIds: [],
      updatedAt: null,
    });

    const sync = await request(app.getHttpServer()).post('/api/sync').expect(412);
    expect(sync.body.message).toContain('Configurações');
    await expect(app.get<FinanceProviderSource>(FINANCE_PROVIDER_SOURCE).get()).rejects.toThrow(
      ProviderNotConfiguredError,
    );
  });

  it('salva cifrado, sem devolver o segredo, e o provedor passa a usar', async () => {
    const res = await save({
      clientId: CLIENT_ID,
      clientSecret: SECRET,
      itemIds: [ITEM, ITEM],
    }).expect(200);
    expect(res.body).toMatchObject({
      provider: 'pluggy',
      configured: true,
      clientId: CLIENT_ID,
      itemIds: [ITEM],
    });
    expect(JSON.stringify(res.body)).not.toContain(SECRET);

    const { rows } = await db.execute<{ user_id: string; client_secret: string }>(
      sql`select user_id, client_secret from pluggy_settings`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.user_id).toBe(TEST_USER.id);
    expect(rows[0]!.client_secret).toMatch(/^v1:/);
    expect(rows[0]!.client_secret).not.toContain(SECRET);

    const provider = await app.get<FinanceProviderSource>(FINANCE_PROVIDER_SOURCE).get();
    expect(provider.name).toBe('pluggy');
  });

  it('sem clientSecret mantém o salvo', async () => {
    await save({ clientId: CLIENT_ID, clientSecret: SECRET, itemIds: [ITEM] }).expect(200);
    const res = await save({ clientId: CLIENT_ID, itemIds: [ITEM, OTHER_ITEM] }).expect(200);
    expect(res.body.itemIds).toEqual([ITEM, OTHER_ITEM]);
  });

  it('recusa sem clientSecret quando ainda não há nada salvo', async () => {
    const res = await save({ clientId: CLIENT_ID, itemIds: [ITEM] }).expect(400);
    expect(res.body.message).toBe('Informe o Client Secret');
  });

  it('recusa credencial errada e item desconhecido sem gravar', async () => {
    const wrong = await save({
      clientId: CLIENT_ID,
      clientSecret: 'errado',
      itemIds: [ITEM],
    }).expect(400);
    expect(wrong.body.message).toBe('Client ID ou Client Secret inválidos');

    const unknown = await save({
      clientId: CLIENT_ID,
      clientSecret: SECRET,
      itemIds: [UNKNOWN_ITEM],
    }).expect(400);
    expect(unknown.body.message).toContain(UNKNOWN_ITEM);

    const res = await request(app.getHttpServer()).get('/api/settings/pluggy').expect(200);
    expect(res.body.configured).toBe(false);
  });

  it('valida o formato do corpo', async () => {
    await save({ clientId: CLIENT_ID, clientSecret: SECRET, itemIds: [] }).expect(400);
    await save({ clientId: CLIENT_ID, clientSecret: SECRET, itemIds: ['nao-e-uuid'] }).expect(400);
  });
});

describe('Configurações da Anthropic (e2e)', () => {
  let app: INestApplication;
  let db: Database;

  beforeAll(async () => {
    vi.stubGlobal('fetch', fakeApis);
    app = await createTestApp(new InMemoryProvider(), {
      env: { SETTINGS_ENCRYPTION_KEY: 'cd'.repeat(32), ANTHROPIC_BASE_URL: ANTHROPIC_URL },
    });
    db = app.get<Database>(DATABASE);
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllGlobals();
  });

  beforeEach(() => resetDatabase(app));

  const http = () => request(app.getHttpServer());
  const save = (body: object) => http().put('/api/settings/anthropic').send(body);
  const status = async () => (await http().get('/api/analysis/status').expect(200)).body.app;

  it('começa desligada, com o modelo padrão e a lista de modelos', async () => {
    const res = await http().get('/api/settings/anthropic').expect(200);
    expect(res.body).toMatchObject({
      configured: false,
      model: 'claude-opus-5-5',
      updatedAt: null,
    });
    expect(res.body.models.map((model: { id: string }) => model.id)).toContain('claude-sonnet-5-5');
    expect(await status()).toEqual({ enabled: false, model: null });
  });

  it('salva cifrada, sem devolver a chave, e liga a análise com o modelo escolhido', async () => {
    const res = await save({ apiKey: API_KEY, model: 'claude-sonnet-5-5' }).expect(200);
    expect(res.body).toMatchObject({ configured: true, model: 'claude-sonnet-5-5' });
    expect(JSON.stringify(res.body)).not.toContain(API_KEY);

    const { rows } = await db.execute<{ user_id: string; api_key: string }>(
      sql`select user_id, api_key from anthropic_settings`,
    );
    expect(rows[0]!.user_id).toBe(TEST_USER.id);
    expect(rows[0]!.api_key).toMatch(/^v1:/);
    expect(rows[0]!.api_key).not.toContain(API_KEY);

    expect(await status()).toEqual({ enabled: true, model: 'claude-sonnet-5-5' });
  });

  it('sem apiKey mantém a salva e só troca o modelo', async () => {
    await save({ apiKey: API_KEY, model: 'claude-opus-5-5' }).expect(200);
    await save({ model: 'claude-fable-5-1' }).expect(200);
    expect(await status()).toEqual({ enabled: true, model: 'claude-fable-5-1' });
  });

  it('recusa chave errada, modelo indisponível e modelo fora da lista sem gravar', async () => {
    const wrong = await save({ apiKey: 'sk-ant-errada', model: 'claude-opus-5-5' }).expect(400);
    expect(wrong.body.message).toBe('Chave da Anthropic inválida ou revogada');

    const unavailable = await save({ apiKey: API_KEY, model: UNAVAILABLE_MODEL }).expect(400);
    expect(unavailable.body.message).toContain(UNAVAILABLE_MODEL);

    await save({ apiKey: API_KEY, model: 'claude-haiku-5-5' }).expect(400);
    await save({ model: 'claude-opus-5-5' }).expect(400);

    expect(await status()).toEqual({ enabled: false, model: null });
  });

  it('remover desliga a análise pelo app', async () => {
    await save({ apiKey: API_KEY, model: 'claude-opus-5-5' }).expect(200);
    await http().delete('/api/settings/anthropic').expect(204);
    expect(await status()).toEqual({ enabled: false, model: null });
    await http().post('/api/analysis/runs').expect(503);
  });
});
