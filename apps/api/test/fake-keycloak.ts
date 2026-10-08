import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FakeUser {
  sub: string;
  username: string;
  name: string;
  email: string;
  realmRoles: string[];
  clientRoles: string[];
}

interface Grant {
  user: FakeUser;
  clientId: string;
}

/**
 * Servidor OIDC mínimo que imita o Keycloak (discovery, JWKS, token com PKCE,
 * refresh e introspecção) para testar o fluxo de login de ponta a ponta com o
 * `openid-client` de verdade.
 */
export class FakeKeycloak {
  readonly realm = 'meu-caixa';
  readonly clientId = 'web';
  readonly clientSecret = 'segredo-de-teste';
  user: FakeUser = {
    sub: 'user-1',
    username: 'nestor',
    name: 'Nestor',
    email: 'nestor@example.com',
    realmRoles: ['default-roles-meu-caixa'],
    clientRoles: ['owner'],
  };
  /** Validade dos access tokens emitidos, em segundos. */
  accessTokenTtl = 300;
  readonly calls = { token: 0, refresh: 0, introspect: 0 };

  private readonly server: Server;
  private readonly keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  private readonly codes = new Map<string, Grant & { challenge: string; redirectUri: string }>();
  private readonly accessTokens = new Map<string, Grant>();
  private readonly refreshTokens = new Map<string, Grant>();
  private baseUrl = '';

  constructor() {
    this.server = createServer((req, res) => {
      this.handle(req, res).catch((error: unknown) => {
        res.writeHead(500).end(String(error));
      });
    });
  }

  get url(): string {
    return this.baseUrl;
  }

  get issuer(): string {
    return `${this.baseUrl}/realms/${this.realm}`;
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    const { port } = this.server.address() as AddressInfo;
    this.baseUrl = `http://127.0.0.1:${port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  /**
   * Faz o papel do usuário na tela de login: valida o pedido de autorização e
   * devolve o `code` e o `state` que o Keycloak mandaria para o callback.
   */
  authorize(authorizationUrl: string): { code: string; state: string } {
    const url = new URL(authorizationUrl);
    const params = url.searchParams;
    if (`${url.origin}${url.pathname}` !== `${this.issuer}/protocol/openid-connect/auth`) {
      throw new Error(`Endpoint de autorização inesperado: ${url.href}`);
    }
    if (params.get('client_id') !== this.clientId) throw new Error('client_id inválido');
    if (params.get('response_type') !== 'code') throw new Error('response_type inválido');
    if (params.get('code_challenge_method') !== 'S256') throw new Error('PKCE S256 ausente');
    if (!params.get('scope')?.split(' ').includes('openid')) throw new Error('scope sem openid');

    const code = randomUUID();
    this.codes.set(code, {
      user: this.user,
      clientId: this.clientId,
      challenge: params.get('code_challenge')!,
      redirectUri: params.get('redirect_uri')!,
    });
    return { code, state: params.get('state')! };
  }

  /** Simula logout/revogação no Keycloak: todos os tokens deixam de valer. */
  revokeAll(): void {
    this.accessTokens.clear();
    this.refreshTokens.clear();
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = new URL(req.url!, this.baseUrl).pathname;
    const oidcBase = `/realms/${this.realm}/protocol/openid-connect`;

    if (req.method === 'GET' && path === `/realms/${this.realm}/.well-known/openid-configuration`) {
      return json(res, 200, this.metadata());
    }
    if (req.method === 'GET' && path === `${oidcBase}/certs`) {
      const jwk = this.keys.publicKey.export({ format: 'jwk' });
      return json(res, 200, { keys: [{ ...jwk, kid: 'test', alg: 'RS256', use: 'sig' }] });
    }
    if (req.method === 'POST' && path === `${oidcBase}/token`) {
      return this.token(await readForm(req), req, res);
    }
    if (req.method === 'POST' && path === `${oidcBase}/token/introspect`) {
      return this.introspect(await readForm(req), req, res);
    }
    json(res, 404, { error: 'not_found' });
  }

  private metadata() {
    const oidc = `${this.issuer}/protocol/openid-connect`;
    return {
      issuer: this.issuer,
      authorization_endpoint: `${oidc}/auth`,
      token_endpoint: `${oidc}/token`,
      introspection_endpoint: `${oidc}/token/introspect`,
      end_session_endpoint: `${oidc}/logout`,
      jwks_uri: `${oidc}/certs`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      code_challenge_methods_supported: ['S256'],
      authorization_response_iss_parameter_supported: true,
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    };
  }

  private token(form: URLSearchParams, req: IncomingMessage, res: ServerResponse) {
    if (!this.authenticateClient(form, req)) return json(res, 401, { error: 'invalid_client' });
    this.calls.token++;

    if (form.get('grant_type') === 'authorization_code') {
      const grant = this.codes.get(form.get('code') ?? '');
      this.codes.delete(form.get('code') ?? '');
      const verifier = form.get('code_verifier') ?? '';
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      if (
        !grant ||
        grant.challenge !== challenge ||
        grant.redirectUri !== form.get('redirect_uri')
      ) {
        return json(res, 400, { error: 'invalid_grant' });
      }
      return json(res, 200, this.issueTokens(grant));
    }

    if (form.get('grant_type') === 'refresh_token') {
      this.calls.refresh++;
      const grant = this.refreshTokens.get(form.get('refresh_token') ?? '');
      if (!grant)
        return json(res, 400, { error: 'invalid_grant', error_description: 'Token is not active' });
      return json(res, 200, this.issueTokens(grant));
    }

    json(res, 400, { error: 'unsupported_grant_type' });
  }

  private introspect(form: URLSearchParams, req: IncomingMessage, res: ServerResponse) {
    if (!this.authenticateClient(form, req)) return json(res, 401, { error: 'invalid_client' });
    this.calls.introspect++;
    const grant = this.accessTokens.get(form.get('token') ?? '');
    if (!grant) return json(res, 200, { active: false });
    const { user } = grant;
    json(res, 200, {
      active: true,
      sub: user.sub,
      preferred_username: user.username,
      name: user.name,
      email: user.email,
      client_id: grant.clientId,
      realm_access: { roles: user.realmRoles },
      resource_access: { [this.clientId]: { roles: user.clientRoles } },
    });
  }

  private issueTokens(grant: Grant) {
    const accessToken = randomUUID();
    const refreshToken = randomUUID();
    this.accessTokens.set(accessToken, grant);
    this.refreshTokens.set(refreshToken, grant);
    const now = Math.floor(Date.now() / 1000);
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: this.accessTokenTtl,
      id_token: this.signJwt({
        iss: this.issuer,
        aud: grant.clientId,
        azp: grant.clientId,
        sub: grant.user.sub,
        iat: now,
        exp: now + 300,
      }),
    };
  }

  private signJwt(payload: Record<string, unknown>): string {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const data = `${encode({ alg: 'RS256', typ: 'JWT', kid: 'test' })}.${encode(payload)}`;
    return `${data}.${sign('sha256', Buffer.from(data), this.keys.privateKey).toString('base64url')}`;
  }

  /** Aceita client_secret_basic e client_secret_post. */
  private authenticateClient(form: URLSearchParams, req: IncomingMessage): boolean {
    const header = req.headers.authorization;
    if (header?.startsWith('Basic ')) {
      const [id, secret] = Buffer.from(header.slice(6), 'base64')
        .toString()
        .split(':')
        .map(decodeURIComponent);
      return id === this.clientId && secret === this.clientSecret;
    }
    return (
      form.get('client_id') === this.clientId && form.get('client_secret') === this.clientSecret
    );
  }
}

async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return new URLSearchParams(Buffer.concat(chunks).toString());
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
}
