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
import type { UsersService } from '../users/users.service.js';
import { MCP_TOKEN_PREFIX, type McpTokenStore } from './mcp-token.store.js';

/** Client "virtual" de quem entra com o token pessoal (tela Configurações). */
export const PERSONAL_TOKEN_CLIENT_ID = 'mcp-personal-token';
/** Validade informada para o token pessoal (ele não expira; só renova a cada requisição). */
const PERSONAL_TOKEN_TTL_SECONDS = 300;

/** O que o `McpController` lê de `req.auth.extra`. */
export interface McpAuthExtra extends Record<string, unknown> {
  /** Dono dos dados (`users.id`). */
  userId: string;
}

/** Identificador do servidor MCP como recurso OAuth: `${APP_URL}/mcp`. */
export function mcpResourceUrl(env: Env): URL {
  return new URL('/mcp', env.APP_URL);
}

/** `${APP_URL}/.well-known/oauth-protected-resource/mcp` (RFC 9728). */
export function protectedResourceMetadataUrl(env: Env): string {
  return getOAuthProtectedResourceMetadataUrl(mcpResourceUrl(env));
}

/**
 * Valida o Bearer token do /mcp e descobre de qual usuário são os dados.
 * Aceita:
 *
 * 1. o token pessoal do usuário (`mcx_...`, gerado em Configurações);
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

  constructor(
    private readonly keycloak: Pick<KeycloakClient, 'introspectToken'>,
    private readonly env: Env,
    private readonly users: Pick<UsersService, 'resolve'>,
    private readonly tokens: Pick<McpTokenStore, 'findUser'>,
  ) {
    this.resource = mcpResourceUrl(env);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    if (token.startsWith(MCP_TOKEN_PREFIX)) return this.verifyPersonalToken(token);

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

    let userId: string;
    try {
      userId = await this.users.resolve(introspected.user);
    } catch (error) {
      this.logger.error('Falha ao identificar o usuário do token do MCP', error);
      throw new ServerError('Não foi possível identificar o usuário');
    }
    const extra: McpAuthExtra = { userId };
    return {
      token,
      clientId: introspected.clientId ?? 'desconhecido',
      scopes: introspected.scopes,
      expiresAt: introspected.expiresAt ?? undefined,
      resource: this.resource,
      extra,
    };
  }

  private async verifyPersonalToken(token: string): Promise<AuthInfo> {
    let userId: string | null;
    try {
      userId = await this.tokens.findUser(token);
    } catch (error) {
      this.logger.error('Falha ao consultar o token pessoal do MCP', error);
      throw new ServerError('Não foi possível validar o token');
    }
    if (!userId) throw new InvalidTokenError('Token inválido ou revogado');
    const extra: McpAuthExtra = { userId };
    return {
      token,
      clientId: PERSONAL_TOKEN_CLIENT_ID,
      scopes: [],
      expiresAt: Math.floor(Date.now() / 1000) + PERSONAL_TOKEN_TTL_SECONDS,
      resource: this.resource,
      extra,
    };
  }
}

/** Mesma URL, ignorando fragmento e uma barra final. */
function sameResource(value: string, resource: URL): boolean {
  const normalize = (text: string) => text.split('#')[0]!.replace(/\/$/, '');
  return normalize(value) === normalize(resource.href);
}
