import { type INestApplication, RequestMethod } from '@nestjs/common';

/**
 * Configuração do app compartilhada entre `main.ts` e os testes.
 *
 * As rotas de dados ficam sob `/api` (a interface faz proxy de `/api/*` para
 * cá); login e health ficam na raiz, porque o browser navega até `/auth/*`.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'auth/*path', method: RequestMethod.ALL },
    ],
  });
}
