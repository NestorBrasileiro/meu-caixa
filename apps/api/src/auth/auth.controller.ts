import {
  Controller,
  Get,
  Inject,
  Logger,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Session } from 'express-session';
import { Public } from '../common/public.decorator.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import type { AuthUser } from './auth.types.js';
import { KeycloakClient } from './keycloak.client.js';
import { SESSION_COOKIE } from './session.constants.js';

/**
 * Fluxo de login do frontend (padrão BFF): o browser só guarda o cookie de
 * sessão; os tokens do Keycloak ficam no servidor.
 */
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly keycloak: KeycloakClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Redireciona para a tela de login do Keycloak. */
  @Public()
  @Get('login')
  async login(@Req() req: Request, @Res() res: Response): Promise<void> {
    const { url, login } = await this.keycloak.startLogin().catch((error: unknown) => {
      this.logger.error('Não foi possível iniciar o login no Keycloak', error);
      throw new ServiceUnavailableException('Serviço de autenticação indisponível');
    });
    req.session.login = login;
    res.redirect(url.href);
  }

  /** Volta do Keycloak: troca o code por tokens e abre a sessão. */
  @Public()
  @Get('callback')
  async callback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const login = req.session.login;
    if (!login) {
      res.redirect('/auth/login');
      return;
    }
    try {
      const tokens = await this.keycloak.finishLogin(req.query as Record<string, string>, login);
      // Novo id de sessão após o login (evita session fixation).
      await regenerate(req.session);
      req.session.tokens = tokens;
      res.redirect(this.env.FRONTEND_URL);
    } catch (error) {
      // Sem redirecionar para /auth/login: com SSO ativo, um erro persistente
      // viraria um loop entre a API e o Keycloak.
      this.logger.warn(`Callback de login falhou: ${(error as Error).message}`);
      delete req.session.login;
      const target = new URL(this.env.FRONTEND_URL);
      target.searchParams.set('authError', 'login_failed');
      res.redirect(target.href);
    }
  }

  /** Encerra a sessão local e a sessão SSO no Keycloak. */
  @Public()
  @Get('logout')
  async logout(@Req() req: Request, @Res() res: Response): Promise<void> {
    const logoutUrl = await this.keycloak
      .logoutUrl(req.session.tokens?.idToken ?? null)
      .catch((error: unknown) => {
        this.logger.warn(`Não foi possível montar o logout do Keycloak: ${String(error)}`);
        return null;
      });
    await destroy(req.session);
    res.clearCookie(SESSION_COOKIE);
    res.redirect(logoutUrl?.href ?? this.env.FRONTEND_URL);
  }

  /** Usuário logado (o frontend chama para saber se há sessão). */
  @Get('me')
  me(@Req() req: Request): AuthUser {
    return req.user!;
  }
}

function regenerate(session: Session): Promise<void> {
  return new Promise((resolve, reject) =>
    session.regenerate((error: unknown) => (error ? reject(error) : resolve())),
  );
}

function destroy(session: Session): Promise<void> {
  return new Promise((resolve, reject) =>
    session.destroy((error: unknown) => (error ? reject(error) : resolve())),
  );
}
