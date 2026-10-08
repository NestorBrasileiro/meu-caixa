/** Usuário autenticado, montado a partir da introspecção do token no Keycloak. */
export interface AuthUser {
  id: string;
  username: string | null;
  name: string | null;
  email: string | null;
  /** Roles do realm e do client da aplicação. */
  roles: string[];
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
