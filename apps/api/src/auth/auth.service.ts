import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { Session, SessionData } from 'express-session';
import * as oidc from 'openid-client';
import type { AuthUser } from './auth.types.js';
import { KeycloakClient } from './keycloak.client.js';

/** Renova o access token um pouco antes de expirar. */
const REFRESH_MARGIN_MS = 30_000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly keycloak: KeycloakClient) {}

  /**
   * Valida a sessão no Keycloak a cada requisição (introspecção), renovando o
   * access token quando necessário. Devolve `null` e limpa os tokens quando a
   * sessão não vale mais; lança 503 se o Keycloak estiver fora do ar.
   */
  async authenticate(session: Session & Partial<SessionData>): Promise<AuthUser | null> {
    let tokens = session.tokens;
    if (!tokens) return null;

    try {
      if (tokens.expiresAt - Date.now() < REFRESH_MARGIN_MS) {
        tokens = await this.keycloak.refresh(tokens);
        session.tokens = tokens;
      }
      const user = await this.keycloak.introspect(tokens.accessToken);
      if (!user) delete session.tokens;
      return user;
    } catch (error) {
      if (isSessionRejected(error)) {
        this.logger.log(`Sessão encerrada pelo Keycloak: ${(error as Error).message}`);
        delete session.tokens;
        return null;
      }
      this.logger.error('Falha ao validar a sessão no Keycloak', error);
      throw new ServiceUnavailableException('Serviço de autenticação indisponível');
    }
  }
}

/** Erros OAuth (ex.: `invalid_grant` no refresh) significam sessão inválida, não indisponibilidade. */
function isSessionRejected(error: unknown): boolean {
  return (
    error instanceof oidc.ResponseBodyError ||
    (error instanceof Error && error.message === 'Sessão sem refresh token')
  );
}
