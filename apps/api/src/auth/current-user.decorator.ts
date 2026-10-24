import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Id do usuário logado (`users.id`), dono dos dados que a rota lê ou altera.
 * Preenchido pelo `AuthGuard`; rotas `@Public()` não têm usuário.
 */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const user = context.switchToHttp().getRequest<Request>().user;
  if (!user) throw new Error('@CurrentUser() em rota sem usuário (@Public())');
  return user.id;
});
