import { createHash, timingSafeEqual } from 'node:crypto';
import { Logger } from '@nestjs/common';
import {
  InsufficientScopeError,
  InvalidTokenError,
  ServerError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import { getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { KeycloakClient } from '../auth/keycloak.client.js';
import type { Env } from '../config/env.js';

/** Client "virtual" de quem entra com o `MCP_ACCESS_TOKEN`. */
export const ACCESS_TOKEN_CLIENT_ID = 'mcp-access-token';
/** Validade informada para o `MCP_ACCESS_TOKEN` (ele não expira; só renova a cada requisição). */
const ACCESS_TOKEN_TTL_SECONDS = 300;

/** Identificador do servidor MCP como recurso OAuth: `${APP_URL}/mcp`. */
export function mcpResourceUrl(env: Env): URL {
  return new URL('/mcp', env.APP_URL);
}

/** `${APP_URL}/.well-known/oauth-protected-resource/mcp` (RFC 9728). */
export function protectedResourceMetadataUrl(env: Env): string {
  return getOAuthProtectedResourceMetadataUrl(mcpResourceUrl(env));
}

/**
 * Valida o Bearer token do /mcp. Aceita:
 *
 * 1. o `MCP_ACCESS_TOKEN`, se configurado (comparação em tempo constante);
 * 2. um access token do Keycloak, por introspecção: ativo, com a role
 *    `KEYCLOAK_REQUIRED_ROLE` e emitido para o servidor MCP — a audiência
 *    (`aud`) inclui `${APP_URL}/mcp`, ou o client que pediu o token (`azp`)
 *    está em `MCP_ALLOWED_CLIENTS`. Um token do realm emitido para outra
 *    aplicação (inclusive o da sessão da interface) não serve.
 *
 * Erros viram 401 (token inválido) ou 403 (sem a role) no `requireBearerAuth`
 * do SDK, com `WWW-Authenticate` apontando para os metadados do recurso.
 */
export class McpTokenVerifier implements OAuthTokenVerifier {
  private readonly logger = new Logger(McpTokenVerifier.name);
  private readonly resource: URL;
  private readonly accessTokenDigest: Buffer | null;

  constructor(
    private readonly keycloak: Pick<KeycloakClient, 'introspectToken'>,
    private readonly env: Env,
  ) {
    this.resource = mcpResourceUrl(env);
    this.accessTokenDigest = env.MCP_ACCESS_TOKEN ? digest(env.MCP_ACCESS_TOKEN) : null;
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    if (this.accessTokenDigest && timingSafeEqual(digest(token), this.accessTokenDigest)) {
      return {
        token,
        clientId: ACCESS_TOKEN_CLIENT_ID,
        scopes: [],
        expiresAt: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS,
        resource: this.resource,
      };
    }

    let introspected: Awaited<ReturnType<KeycloakClient['introspectToken']>>;
    try {
      introspected = await this.keycloak.introspectToken(token);
    } catch (error) {
      this.logger.error('Falha na introspecção do token do MCP no Keycloak', error);
      throw new ServerError('Serviço de autenticação indisponível');
    }
    if (!introspected) throw new InvalidTokenError('Token inválido ou expirado');

    const forThisServer =
      introspected.audience.some((audience) => sameResource(audience, this.resource)) ||
      (introspected.clientId !== null &&
        this.env.MCP_ALLOWED_CLIENTS.includes(introspected.clientId));
    if (!forThisServer) {
      throw new InvalidTokenError('Token não foi emitido para este servidor MCP');
    }
    if (!introspected.user.roles.includes(this.env.KEYCLOAK_REQUIRED_ROLE)) {
      throw new InsufficientScopeError(`Requer a role ${this.env.KEYCLOAK_REQUIRED_ROLE}`);
    }

    return {
      token,
      clientId: introspected.clientId ?? 'desconhecido',
      scopes: introspected.scopes,
      expiresAt: introspected.expiresAt ?? undefined,
      resource: this.resource,
      extra: { userId: introspected.user.id, username: introspected.user.username },
    };
  }
}

/** Hash antes de comparar: `timingSafeEqual` exige o mesmo tamanho e não vaza o do segredo. */
function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** Mesma URL, ignorando fragmento e uma barra final. */
function sameResource(value: string, resource: URL): boolean {
  const normalize = (text: string) => text.split('#')[0]!.replace(/\/$/, '');
  return normalize(value) === normalize(resource.href);
}
