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
import { McpTokenVerifier, protectedResourceMetadataUrl } from './mcp-auth.js';
import { McpController, ProtectedResourceController } from './mcp.controller.js';

/**
 * Servidor MCP para o Claude analisar as finanças (claude.ai, Claude Desktop,
 * Claude Code). O /mcp é um resource server OAuth 2.1: aceita só Bearer
 * tokens do Keycloak emitidos para ele (ou o `MCP_ACCESS_TOKEN`).
 */
@Module({
  imports: [AuthModule, InsightsModule],
  controllers: [McpController, ProtectedResourceController],
})
export class McpModule implements NestModule {
  constructor(
    private readonly keycloak: KeycloakClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(
        requireBearerAuth({
          verifier: new McpTokenVerifier(this.keycloak, this.env),
          resourceMetadataUrl: protectedResourceMetadataUrl(this.env),
        }),
      )
      .forRoutes({ path: 'mcp', method: RequestMethod.ALL });
  }
}
