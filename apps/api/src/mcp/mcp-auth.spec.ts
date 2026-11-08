import { Logger } from '@nestjs/common';
import {
  InsufficientScopeError,
  InvalidTokenError,
  ServerError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { IntrospectedToken } from '../auth/keycloak.client.js';
import { validateEnv } from '../config/env.js';
import {
  McpTokenVerifier,
  PERSONAL_TOKEN_CLIENT_ID,
  mcpResourceUrl,
  protectedResourceMetadataUrl,
} from './mcp-auth.js';

const PERSONAL_TOKEN = 'mcx_' + 'a'.repeat(43);

const env = (extra: Record<string, string> = {}) =>
  validateEnv({
    DATABASE_URL: 'postgres://localhost/x',
    FINANCE_PROVIDER: 'fake',
    KEYCLOAK_CLIENT_SECRET: 'segredo',
    APP_URL: 'https://caixa.example.com',
    ...extra,
  });

const token = (overrides: Partial<IntrospectedToken> = {}): IntrospectedToken => ({
  user: { sub: 'kc-1', username: 'dev', name: null, email: null, roles: ['owner'] },
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
  // Usuário do banco: o id interno, não o `sub` do Keycloak.
  const resolve = vi.fn(async () => 'u1');
  const findUser = vi.fn(async (value: string) => (value === PERSONAL_TOKEN ? 'u2' : null));
  const verifier = new McpTokenVerifier(
    { introspectToken },
    env(extraEnv),
    { resolve },
    { findUser },
  );
  return { verifier, introspectToken, resolve, findUser };
}

describe('McpTokenVerifier', () => {
  it('monta as URLs do recurso a partir do APP_URL', () => {
    expect(mcpResourceUrl(env()).href).toBe('https://caixa.example.com/mcp');
    expect(protectedResourceMetadataUrl(env())).toBe(
      'https://caixa.example.com/.well-known/oauth-protected-resource/mcp',
    );
  });

  it('aceita token do Keycloak com a audiência do MCP e a role, com o usuário do banco', async () => {
    const { verifier, resolve } = verifierWith(token());
    await expect(verifier.verifyAccessToken('t')).resolves.toMatchObject({
      clientId: 'claude',
      scopes: ['profile'],
      expiresAt: 2_000_000_000,
      extra: { userId: 'u1' },
    });
    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ sub: 'kc-1' }));
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

  it('aceita o token pessoal com o dono dele, sem consultar o Keycloak', async () => {
    const { verifier, introspectToken } = verifierWith(null);
    const info = await verifier.verifyAccessToken(PERSONAL_TOKEN);
    expect(info.clientId).toBe(PERSONAL_TOKEN_CLIENT_ID);
    expect(info.extra).toEqual({ userId: 'u2' });
    expect(info.expiresAt).toBeGreaterThan(Date.now() / 1000);
    expect(introspectToken).not.toHaveBeenCalled();
  });

  it('token pessoal desconhecido ou revogado é inválido (sem cair na introspecção)', async () => {
    const { verifier, introspectToken } = verifierWith(token());
    await expect(verifier.verifyAccessToken(PERSONAL_TOKEN + 'x')).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
    expect(introspectToken).not.toHaveBeenCalled();
  });
});
