import { Logger } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ToolInputError } from '../insights/insights.service.js';
import { ANALYSIS_INSTRUCTIONS } from '../insights/instructions.js';
import type { InsightTool } from '../insights/tools.js';

const logger = new Logger('McpServer');

/**
 * Servidor MCP com as ferramentas de análise. Modo sem estado: um servidor
 * por requisição HTTP (barato — só registra as definições).
 */
export function createMcpServer(tools: InsightTool[]): McpServer {
  const server = new McpServer(
    { name: 'meu-caixa', title: 'Meu Caixa', version: '1.0.0' },
    { instructions: ANALYSIS_INSTRUCTIONS },
  );
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          title: tool.title,
          readOnlyHint: tool.readOnly,
          destructiveHint: false,
          idempotentHint: tool.readOnly,
          openWorldHint: false,
        },
      },
      (input) => runTool(tool, input),
    );
  }
  return server;
}

/** Executa a ferramenta e devolve o JSON como texto e como `structuredContent`. */
export async function runTool(tool: InsightTool, input: unknown): Promise<CallToolResult> {
  try {
    const result = await tool.run(input as Record<string, unknown>);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      structuredContent: result,
    };
  } catch (error) {
    if (error instanceof ToolInputError) return toolError(error.message);
    if (error instanceof z.ZodError)
      return toolError(`Entrada inválida:\n${z.prettifyError(error)}`);
    logger.error(`Ferramenta ${tool.name} falhou`, error);
    return toolError('Erro interno ao executar a ferramenta. Tente de novo mais tarde.');
  }
}

function toolError(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}
