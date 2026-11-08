import {
  Inject,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { AuthModule } from '../auth/auth.module.js';
import { KeycloakClient } from '../auth/keycloak.client.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { InsightsModule } from '../insights/insights.module.js';
import { UsersService } from '../users/users.service.js';
import { McpTokenVerifier, protectedResourceMetadataUrl } from './mcp-auth.js';
import { McpTokenStore } from './mcp-token.store.js';
import { McpController, ProtectedResourceController } from './mcp.controller.js';

/**
 * Servidor MCP para o Claude analisar as finanças (claude.ai, Claude Desktop,
 * Claude Code). O /mcp é um resource server OAuth 2.1: aceita só Bearer
 * tokens do Keycloak emitidos para ele (ou o token pessoal do usuário).
 */
@Module({
  imports: [AuthModule, InsightsModule],
  controllers: [McpController, ProtectedResourceController],
  providers: [McpTokenStore],
  exports: [McpTokenStore],
})
export class McpModule implements NestModule {
  constructor(
    private readonly keycloak: KeycloakClient,
    private readonly users: UsersService,
    private readonly tokens: McpTokenStore,
    @Inject(ENV) private readonly env: Env,
  ) {}

  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(
        requireBearerAuth({
          verifier: new McpTokenVerifier(this.keycloak, this.env, this.users, this.tokens),
          resourceMetadataUrl: protectedResourceMetadataUrl(this.env),
        }),
      )
      .forRoutes({ path: 'mcp', method: RequestMethod.ALL });
  }
}
