/** Usuário como o Keycloak informa, a partir da introspecção do token. */
export interface KeycloakUser {
  /** `sub` do token. */
  sub: string;
  username: string | null;
  name: string | null;
  email: string | null;
  /** Roles do realm e do client da aplicação. */
  roles: string[];
}

/** Usuário autenticado no app: `id` é o do banco (`users.id`), dono dos dados. */
export interface AuthUser extends Omit<KeycloakUser, 'sub'> {
  id: string;
  keycloakId: string;
}

/** Tokens guardados na sessão — nunca chegam ao browser. */
export interface SessionTokens {
  accessToken: string;
  refreshToken: string | null;
  idToken: string | null;
  /** Epoch em ms. */
  expiresAt: number;
}

/** Estado do login em andamento (PKCE + state), entre o redirect e o callback. */
export interface PendingLogin {
  codeVerifier: string;
  state: string;
}

declare module 'express-session' {
  interface SessionData {
    tokens?: SessionTokens;
    login?: PendingLogin;
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
