import { type INestApplication, RequestMethod } from '@nestjs/common';

/**
 * Configuração do app compartilhada entre `main.ts` e os testes.
 *
 * As rotas de dados ficam sob `/api` (a interface faz proxy de `/api/*` para
 * cá); login e health ficam na raiz, porque o browser navega até `/auth/*`.
 * O servidor MCP (`/mcp`) e os metadados OAuth (`/.well-known/*`) também ficam
 * na raiz, onde os clientes MCP os procuram.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'auth/*path', method: RequestMethod.ALL },
      { path: 'mcp', method: RequestMethod.ALL },
      { path: '.well-known/*path', method: RequestMethod.ALL },
    ],
  });
}
