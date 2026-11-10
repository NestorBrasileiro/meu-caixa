import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC } from '../common/public.decorator.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import { describeSession } from './session-diagnostics.js';

/**
 * Guard global: toda rota exige sessão válida no Keycloak e a role
 * `KEYCLOAK_REQUIRED_ROLE`, exceto as marcadas com `@Public()`. Preenche
 * `request.user` com o usuário do banco (criado no primeiro acesso).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly users: UsersService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const hadTokens = Boolean(request.session.tokens);
    const identity = await this.auth.authenticate(request.session);
    if (!identity) {
      this.logger.debug(
        `401 em ${request.method} ${request.originalUrl}: ${describeSession(request)}, ` +
          (hadTokens ? 'tinha login (recusado pelo Keycloak)' : 'sem login na sessão'),
      );
      throw new UnauthorizedException();
    }
    if (!identity.roles.includes(this.env.KEYCLOAK_REQUIRED_ROLE)) {
      throw new ForbiddenException(`Requer a role ${this.env.KEYCLOAK_REQUIRED_ROLE}`);
    }
    request.user = await this.users.toAuthUser(identity);
    return true;
  }
}
