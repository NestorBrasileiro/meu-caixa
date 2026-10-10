import { Logger } from '@nestjs/common';
import {
  InsufficientScopeError,
  InvalidTokenError,
  ServerError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { IntrospectedToken } from '../auth/keycloak.client.js';
import { validateEnv } from '../config/env.js';
import {
  ACCESS_TOKEN_CLIENT_ID,
  McpTokenVerifier,
  mcpResourceUrl,
  protectedResourceMetadataUrl,
} from './mcp-auth.js';

const ACCESS_TOKEN = 'a'.repeat(64);

const env = (extra: Record<string, string> = {}) =>
  validateEnv({
    DATABASE_URL: 'postgres://localhost/x',
    FINANCE_PROVIDER: 'fake',
    KEYCLOAK_CLIENT_SECRET: 'segredo',
    APP_URL: 'https://caixa.example.com',
    ...extra,
  });

const token = (overrides: Partial<IntrospectedToken> = {}): IntrospectedToken => ({
  user: { id: 'u1', username: 'dev', name: null, email: null, roles: ['owner'] },
  audience: ['https://caixa.example.com/mcp', 'web'],
  clientId: 'claude',
  scopes: ['profile'],
  expiresAt: 2_000_000_000,
  ...overrides,
});

function verifierWith(result: IntrospectedToken | null | Error, extraEnv = {}) {
  const introspectToken = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  return { verifier: new McpTokenVerifier({ introspectToken }, env(extraEnv)), introspectToken };
}

describe('McpTokenVerifier', () => {
  it('monta as URLs do recurso a partir do APP_URL', () => {
    expect(mcpResourceUrl(env()).href).toBe('https://caixa.example.com/mcp');
    expect(protectedResourceMetadataUrl(env())).toBe(
      'https://caixa.example.com/.well-known/oauth-protected-resource/mcp',
    );
  });

  it('aceita token do Keycloak com a audiência do MCP e a role', async () => {
    const { verifier } = verifierWith(token());
    await expect(verifier.verifyAccessToken('t')).resolves.toMatchObject({
      clientId: 'claude',
      scopes: ['profile'],
      expiresAt: 2_000_000_000,
      extra: { userId: 'u1' },
    });
  });

  it('ignora barra final na audiência', async () => {
    const { verifier } = verifierWith(token({ audience: ['https://caixa.example.com/mcp/'] }));
    await expect(verifier.verifyAccessToken('t')).resolves.toBeDefined();
  });

  it('recusa token de outra audiência, a não ser que o client esteja liberado', async () => {
    const other = token({ audience: ['web', 'account'], clientId: 'claude' });
    await expect(verifierWith(other).verifier.verifyAccessToken('t')).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
    const allowed = verifierWith(other, { MCP_ALLOWED_CLIENTS: 'claude, outro' }).verifier;
    await expect(allowed.verifyAccessToken('t')).resolves.toBeDefined();
    const web = verifierWith(token({ audience: [], clientId: 'web' }), {
      MCP_ALLOWED_CLIENTS: 'claude',
    }).verifier;
    await expect(web.verifyAccessToken('t')).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('recusa token inativo (401) e sem a role (403)', async () => {
    await expect(verifierWith(null).verifier.verifyAccessToken('t')).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
    const noRole = token({ user: { ...token().user, roles: ['default-roles-meu-caixa'] } });
    await expect(verifierWith(noRole).verifier.verifyAccessToken('t')).rejects.toBeInstanceOf(
      InsufficientScopeError,
    );
  });

  it('Keycloak fora do ar vira erro de servidor, não token inválido', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { verifier } = verifierWith(new Error('ECONNREFUSED'));
    await expect(verifier.verifyAccessToken('t')).rejects.toBeInstanceOf(ServerError);
  });

  it('aceita o MCP_ACCESS_TOKEN sem consultar o Keycloak', async () => {
    const { verifier, introspectToken } = verifierWith(null, { MCP_ACCESS_TOKEN: ACCESS_TOKEN });
    const info = await verifier.verifyAccessToken(ACCESS_TOKEN);
    expect(info.clientId).toBe(ACCESS_TOKEN_CLIENT_ID);
    expect(info.expiresAt).toBeGreaterThan(Date.now() / 1000);
    expect(introspectToken).not.toHaveBeenCalled();

    await expect(verifier.verifyAccessToken(ACCESS_TOKEN.slice(1))).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
    expect(introspectToken).toHaveBeenCalledOnce();
  });

  it('exige MCP_ACCESS_TOKEN longo', () => {
    expect(() => env({ MCP_ACCESS_TOKEN: 'curto' })).toThrow(/MCP_ACCESS_TOKEN/);
  });
});
