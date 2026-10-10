import { Inject, Injectable } from '@nestjs/common';
import * as oidc from 'openid-client';
import { z } from 'zod';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import type { AuthUser, PendingLogin, SessionTokens } from './auth.types.js';

const SCOPE = 'openid profile email roles';

const rolesSchema = z.object({ roles: z.array(z.string()).optional() }).optional();

/** Claims que usamos da introspecção do Keycloak. */
const introspectionSchema = z.object({
  sub: z.string(),
  aud: z.union([z.string(), z.array(z.string())]).optional(),
  azp: z.string().optional(),
  client_id: z.string().optional(),
  scope: z.string().optional(),
  exp: z.number().optional(),
  preferred_username: z.string().optional(),
  name: z.string().optional(),
  email: z.string().optional(),
  realm_access: rolesSchema,
  resource_access: z.record(z.string(), rolesSchema).optional(),
});

/**
 * Cliente OIDC do Keycloak (Authorization Code + PKCE, client confidencial).
 * Só conhece o protocolo; o que fica na sessão é decidido por `AuthService`.
 */
@Injectable()
export class KeycloakClient {
  private configuration: Promise<oidc.Configuration> | null = null;

  constructor(@Inject(ENV) private readonly env: Env) {}

  get redirectUri(): string {
    return new URL('/auth/callback', this.env.APP_URL).href;
  }

  async startLogin(): Promise<{ url: URL; login: PendingLogin }> {
    const config = await this.getConfiguration();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const url = oidc.buildAuthorizationUrl(config, {
      redirect_uri: this.redirectUri,
      scope: SCOPE,
      code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
      code_challenge_method: 'S256',
      state,
    });
    return { url, login: { codeVerifier, state } };
  }

  /** Troca o `code` do callback por tokens, validando state e PKCE. */
  async finishLogin(query: Record<string, string>, login: PendingLogin): Promise<SessionTokens> {
    const config = await this.getConfiguration();
    // Monta a URL a partir do redirect_uri configurado (não do request), para
    // funcionar atrás de proxy: o redirect_uri enviado ao token endpoint
    // precisa ser idêntico ao do pedido de autorização.
    const currentUrl = new URL(this.redirectUri);
    for (const [key, value] of Object.entries(query)) currentUrl.searchParams.set(key, value);

    const response = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: login.codeVerifier,
      expectedState: login.state,
    });
    return toSessionTokens(response);
  }

  async refresh(tokens: SessionTokens): Promise<SessionTokens> {
    if (!tokens.refreshToken) throw new Error('Sessão sem refresh token');
    const config = await this.getConfiguration();
    const response = await oidc.refreshTokenGrant(config, tokens.refreshToken);
    return toSessionTokens(response, tokens);
  }

  /** `null` quando o token não está mais ativo (expirado, revogado, logout). */
  async introspect(accessToken: string): Promise<AuthUser | null> {
    return (await this.introspectToken(accessToken))?.user ?? null;
  }

  /**
   * Introspecção com os dados do token além do usuário: audiência, client
   * que o pediu, escopos e validade (usados para validar tokens do /mcp).
   */
  async introspectToken(accessToken: string): Promise<IntrospectedToken | null> {
    const config = await this.getConfiguration();
    const response = await oidc.tokenIntrospection(config, accessToken);
    if (!response.active) return null;

    const claims = introspectionSchema.parse(response);
    const clientRoles = claims.resource_access?.[this.env.KEYCLOAK_CLIENT_ID]?.roles ?? [];
    return {
      user: {
        id: claims.sub,
        username: claims.preferred_username ?? null,
        name: claims.name ?? null,
        email: claims.email ?? null,
        roles: [...new Set([...(claims.realm_access?.roles ?? []), ...clientRoles])],
      },
      audience: claims.aud === undefined ? [] : ([] as string[]).concat(claims.aud),
      clientId: claims.azp ?? claims.client_id ?? null,
      scopes: claims.scope?.split(' ').filter(Boolean) ?? [],
      expiresAt: claims.exp ?? null,
    };
  }

  /** Issuer do realm (vai nos metadados do recurso protegido do /mcp). */
  async issuer(): Promise<string> {
    return (await this.getConfiguration()).serverMetadata().issuer;
  }

  /** URL de logout no Keycloak (encerra também a sessão SSO). */
  async logoutUrl(idToken: string | null): Promise<URL | null> {
    const config = await this.getConfiguration();
    if (!config.serverMetadata().end_session_endpoint) return null;
    return oidc.buildEndSessionUrl(config, {
      post_logout_redirect_uri: this.env.FRONTEND_URL,
      ...(idToken ? { id_token_hint: idToken } : { client_id: this.env.KEYCLOAK_CLIENT_ID }),
    });
  }

  private getConfiguration(): Promise<oidc.Configuration> {
    this.configuration ??= oidc
      .discovery(
        new URL(`/realms/${encodeURIComponent(this.env.KEYCLOAK_REALM)}`, this.env.KEYCLOAK_URL),
        this.env.KEYCLOAK_CLIENT_ID,
        this.env.KEYCLOAK_CLIENT_SECRET,
        undefined,
        // Keycloak local roda em HTTP; em produção só HTTPS.
        this.env.NODE_ENV === 'production' ? undefined : { execute: [oidc.allowInsecureRequests] },
      )
      .catch((error: unknown) => {
        // Não guarda a falha: a próxima chamada tenta a descoberta de novo.
        this.configuration = null;
        throw error;
      });
    return this.configuration;
  }
}

export interface IntrospectedToken {
  user: AuthUser;
  /** Claim `aud`, sempre como lista. */
  audience: string[];
  /** Client que pediu o token (`azp`). */
  clientId: string | null;
  scopes: string[];
  /** Epoch em segundos. */
  expiresAt: number | null;
}

function toSessionTokens(
  response: oidc.TokenEndpointResponse,
  previous?: SessionTokens,
): SessionTokens {
  return {
    accessToken: response.access_token,
    // O Keycloak pode não reenviar refresh/id token na renovação.
    refreshToken: response.refresh_token ?? previous?.refreshToken ?? null,
    idToken: response.id_token ?? previous?.idToken ?? null,
    expiresAt: Date.now() + (response.expires_in ?? 60) * 1000,
  };
}
