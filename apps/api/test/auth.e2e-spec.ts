import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { KeycloakClient } from '../src/auth/keycloak.client.js';
import { SESSION_COOKIE } from '../src/auth/session.constants.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { sessions } from '../src/database/schema.js';
import { SyncService } from '../src/sync/sync.service.js';
import { createTestApp, FRONTEND_URL, resetDatabase } from './app.js';
import { FakeKeycloak } from './fake-keycloak.js';
import { InMemoryProvider } from './in-memory-provider.js';

type Agent = ReturnType<typeof request.agent>;

function sessionCookie(response: request.Response): string | undefined {
  const cookies = ([] as string[]).concat(response.headers['set-cookie'] ?? []);
  return cookies.find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));
}

describe('Autenticação com Keycloak (e2e)', () => {
  let app: INestApplication;
  let keycloak: FakeKeycloak;
  const defaultUser = () => ({ ...new FakeKeycloak().user });

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

  beforeEach(async () => {
    await resetDatabase(app);
    keycloak.user = defaultUser();
    keycloak.accessTokenTtl = 300;
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
    await keycloak.stop();
  });

  const agent = () => request.agent(app.getHttpServer());

  /** Percorre login → Keycloak → callback, como o browser faria. */
  async function login(client: Agent) {
    const start = await client.get('/auth/login').expect(302);
    const { code, state } = keycloak.authorize(start.headers.location!);
    const callback = await client
      .get('/auth/callback')
      .query({ code, state, session_state: 'kc-session', iss: keycloak.issuer })
      .expect(302);
    return { start, callback };
  }

  it('bloqueia as rotas sem sessão, exceto as públicas', async () => {
    await agent().get('/accounts').expect(401);
    await agent().get('/auth/me').expect(401);
    await agent().get('/health').expect(200);
  });

  it('faz login com PKCE e guarda os tokens só no servidor', async () => {
    const client = agent();
    const { start, callback } = await login(client);

    const authorization = new URL(start.headers.location!);
    expect(authorization.searchParams.get('redirect_uri')).toBe('http://api.test/auth/callback');
    expect(authorization.searchParams.get('scope')).toBe('openid profile email roles');
    expect(callback.headers.location).toBe(FRONTEND_URL);

    const cookie = sessionCookie(callback);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).not.toContain('access_token');

    const me = await client.get('/auth/me').expect(200);
    expect(me.body).toEqual({
      id: 'user-1',
      username: 'nestor',
      name: 'Nestor',
      email: 'nestor@example.com',
      roles: ['default-roles-meu-caixa', 'owner'],
    });
    await client.get('/accounts').expect(200);

    const db = app.get<Database>(DATABASE);
    const sid = decodeURIComponent(cookie!.split(';')[0]!.split('=')[1]!).slice(2).split('.')[0]!;
    const [row] = await db.select().from(sessions).where(eq(sessions.sid, sid));
    expect(row?.data).toMatchObject({ tokens: { accessToken: expect.any(String) } });
  });

  it('troca o id da sessão depois do login', async () => {
    const { start, callback } = await login(agent());

    expect(sessionCookie(start)).toBeDefined();
    expect(sessionCookie(callback)).toBeDefined();
    expect(sessionCookie(callback)!.split(';')[0]).not.toBe(sessionCookie(start)!.split(';')[0]);
  });

  it('recusa um callback com state diferente', async () => {
    const client = agent();
    const start = await client.get('/auth/login').expect(302);
    const { code } = keycloak.authorize(start.headers.location!);
    const tokenCalls = keycloak.calls.token;

    const callback = await client
      .get('/auth/callback')
      .query({ code, state: 'forjado', iss: keycloak.issuer })
      .expect(302);

    expect(callback.headers.location).toBe(`${FRONTEND_URL}/?authError=login_failed`);
    await client.get('/auth/me').expect(401);
    expect(keycloak.calls.token).toBe(tokenCalls);
  });

  it('manda de volta para o login quando não há login em andamento', async () => {
    const callback = await agent()
      .get('/auth/callback')
      .query({ code: 'x', state: 'y' })
      .expect(302);
    expect(callback.headers.location).toBe('/auth/login');
  });

  it('renova o access token expirado com o refresh token', async () => {
    keycloak.accessTokenTtl = 0;
    const client = agent();
    await login(client);
    const refreshesBefore = keycloak.calls.refresh;

    await client.get('/auth/me').expect(200);
    await client.get('/accounts').expect(200);

    expect(keycloak.calls.refresh - refreshesBefore).toBe(2);
  });

  it('encerra a sessão quando o Keycloak revoga os tokens', async () => {
    const client = agent();
    await login(client);
    keycloak.revokeAll();

    await client.get('/auth/me').expect(401);
    const introspections = keycloak.calls.introspect;
    // Os tokens saíram da sessão: nem chega a consultar o Keycloak de novo.
    await client.get('/auth/me').expect(401);
    expect(keycloak.calls.introspect).toBe(introspections);
  });

  it('exige a role configurada para acessar os dados', async () => {
    keycloak.user = { ...defaultUser(), clientRoles: [] };
    const client = agent();
    await login(client);

    await client.get('/accounts').expect(403);
  });

  it('aceita a role vinda do realm', async () => {
    keycloak.user = { ...defaultUser(), realmRoles: ['owner'], clientRoles: [] };
    const client = agent();
    await login(client);

    await client.get('/accounts').expect(200);
  });

  it('faz logout local e no Keycloak', async () => {
    const client = agent();
    await login(client);

    const logout = await client.get('/auth/logout').expect(302);

    const target = new URL(logout.headers.location!);
    expect(`${target.origin}${target.pathname}`).toBe(
      `${keycloak.issuer}/protocol/openid-connect/logout`,
    );
    expect(target.searchParams.get('post_logout_redirect_uri')).toBe(FRONTEND_URL);
    expect(target.searchParams.get('id_token_hint')).toEqual(expect.any(String));
    await client.get('/auth/me').expect(401);
  });

  it('recusa requisições mutantes vindas de outra origem (CSRF)', async () => {
    const client = agent();
    await login(client);

    await client.post('/sync').set('Origin', 'http://malicioso.test').expect(403);
    await client.post('/sync').set('Origin', FRONTEND_URL).expect(202);
    await app.get(SyncService).waitForIdle();
  });

  it('responde 503 quando o Keycloak está fora do ar', async () => {
    const client = agent();
    await login(client);
    vi.spyOn(app.get(KeycloakClient), 'introspect').mockRejectedValue(
      new TypeError('fetch failed'),
    );

    await client.get('/accounts').expect(503);
  });
});
