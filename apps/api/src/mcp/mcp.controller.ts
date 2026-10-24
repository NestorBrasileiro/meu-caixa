import { Controller, Delete, Get, Inject, Logger, Post, Req, Res } from '@nestjs/common';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import { KeycloakClient } from '../auth/keycloak.client.js';
import { Public } from '../common/public.decorator.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { AnalysisService } from '../insights/analysis.service.js';
import { InsightsService } from '../insights/insights.service.js';
import { createInsightTools } from '../insights/tools.js';
import { type McpAuthExtra, mcpResourceUrl } from './mcp-auth.js';
import { createMcpServer } from './mcp-server.js';

/**
 * Servidor MCP (Streamable HTTP, sem estado) em `/mcp`. A autenticação é por
 * Bearer token no middleware do `McpModule`, não pela sessão: por isso
 * `@Public()` para o guard da sessão.
 */
@Public()
@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(
    private readonly insights: InsightsService,
    private readonly analysis: AnalysisService,
  ) {}

  @Post()
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    // Defesa em profundidade: sem o middleware de Bearer, nada passa.
    const userId = (req.auth?.extra as McpAuthExtra | undefined)?.userId;
    if (!userId) {
      res.status(401).json({ error: 'invalid_token', error_description: 'Token ausente' });
      return;
    }
    // Ferramentas por requisição: cada uma só enxerga os dados do dono do token.
    const tools = createInsightTools({
      insights: this.insights,
      analysis: this.analysis,
      source: 'MCP',
      userId,
    });
    const server = createMcpServer(tools);
    // Respostas JSON (sem SSE): atravessam proxies (o rewrite do Next) sem surpresa.
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      this.logger.error('Falha ao atender requisição MCP', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Erro interno' },
          id: null,
        });
      }
    }
  }

  /** Sem estado: não há stream de notificações (GET) nem sessão para encerrar (DELETE). */
  @Get()
  stream(@Res() res: Response): void {
    methodNotAllowed(res);
  }

  @Delete()
  endSession(@Res() res: Response): void {
    methodNotAllowed(res);
  }
}

function methodNotAllowed(res: Response): void {
  res
    .status(405)
    .set('Allow', 'POST')
    .json({ jsonrpc: '2.0', error: { code: -32000, message: 'Método não permitido' }, id: null });
}

/**
 * Metadados do recurso protegido (RFC 9728): dizem ao cliente MCP qual
 * servidor de autorização (o realm do Keycloak) emite tokens para o /mcp.
 */
@Public()
@Controller('.well-known')
export class ProtectedResourceController {
  private readonly logger = new Logger(ProtectedResourceController.name);

  constructor(
    private readonly keycloak: KeycloakClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get(['oauth-protected-resource', 'oauth-protected-resource/mcp'])
  async metadata(@Res({ passthrough: true }) res: Response) {
    res.set('Access-Control-Allow-Origin', '*');
    return {
      resource: mcpResourceUrl(this.env).href,
      authorization_servers: [await this.issuer()],
      bearer_methods_supported: ['header'],
      resource_name: 'Meu Caixa',
      resource_documentation:
        'https://github.com/NestorBrasileiro/meu-caixa#conectar-no-claude-mcp',
    };
  }

  /** Issuer anunciado pelo próprio Keycloak; sem ele, o padrão `${KEYCLOAK_URL}/realms/<realm>`. */
  private async issuer(): Promise<string> {
    try {
      return await this.keycloak.issuer();
    } catch (error) {
      this.logger.warn(`Descoberta do Keycloak falhou; usando KEYCLOAK_URL: ${String(error)}`);
      return new URL(
        `/realms/${encodeURIComponent(this.env.KEYCLOAK_REALM)}`,
        this.env.KEYCLOAK_URL,
      ).href;
    }
  }
}
