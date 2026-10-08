import { createHash, timingSafeEqual } from 'node:crypto';
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { IS_PUBLIC } from './public.decorator.js';

/**
 * Exige `Authorization: Bearer <API_TOKEN>` quando `API_TOKEN` está definido.
 * Sem token configurado (desenvolvimento local), a API fica aberta.
 */
@Injectable()
export class ApiTokenGuard implements CanActivate {
  private readonly expected: Buffer | null;

  constructor(
    private readonly reflector: Reflector,
    @Inject(ENV) env: Env,
  ) {
    this.expected = env.API_TOKEN ? digest(env.API_TOKEN) : null;
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.expected) return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const header = context.switchToHttp().getRequest<Request>().headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (
      scheme?.toLowerCase() !== 'bearer' ||
      !token ||
      !timingSafeEqual(digest(token), this.expected)
    ) {
      throw new UnauthorizedException();
    }
    return true;
  }
}

/** Compara hashes de tamanho fixo para não vazar o tamanho do token. */
function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
