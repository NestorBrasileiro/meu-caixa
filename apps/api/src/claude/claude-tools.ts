import { Logger } from '@nestjs/common';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { BetaRunnableTool } from '@anthropic-ai/sdk/lib/tools/BetaRunnableTool';
import type { BetaTool } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { ToolError } from '@anthropic-ai/sdk/lib/tools/ToolError';
import { z } from 'zod';
import { ToolInputError } from '../insights/insights.service.js';
import type { InsightTool } from '../insights/tools.js';

const logger = new Logger('ClaudeTools');

export type RunnableTool = BetaRunnableTool<Record<string, unknown>>;

/**
 * Embrulha uma ferramenta de `insights/tools.ts` no formato do Tool Runner da
 * Anthropic (`betaZodTool`). Diferenças em relação ao helper puro:
 *
 * - o JSON Schema enviado à API é o de **entrada** do zod 4 (`io: 'input'`):
 *   o padrão do helper (`output`) marca campos com `.default()` como
 *   obrigatórios, e o Claude teria de mandar todos. Também sem `$ref`
 *   (`reused: 'inline'`): o helper gera `$defs` até para campos com
 *   `.describe()` usados uma vez só;
 * - erros de validação e de entrada voltam ao Claude como `is_error` com
 *   mensagem legível (para ele corrigir e chamar de novo), e erros internos
 *   viram uma mensagem genérica — nada de stack nem detalhes do banco.
 */
export function toRunnableTool(tool: InsightTool): RunnableTool {
  const base = betaZodTool({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    run: async (input) => {
      try {
        return JSON.stringify(await tool.run(input as never));
      } catch (error) {
        throw toToolError(tool.name, error);
      }
    },
  });
  return {
    ...base,
    input_schema: toolInputJsonSchema(tool.inputSchema),
    parse: (input: unknown) => {
      const result = tool.inputSchema.safeParse(input);
      if (!result.success) throw invalidInput(result.error);
      return result.data as Record<string, unknown>;
    },
  } as RunnableTool;
}

/** JSON Schema da entrada da ferramenta, como vai no campo `input_schema`. */
export function toolInputJsonSchema(schema: z.ZodObject): BetaTool['input_schema'] {
  const { $schema: _dialect, ...jsonSchema } = z.toJSONSchema(schema, {
    io: 'input',
    reused: 'inline',
  });
  return jsonSchema as BetaTool['input_schema'];
}

function invalidInput(error: z.ZodError): ToolError {
  return new ToolError(`Entrada inválida:\n${z.prettifyError(error)}`);
}

function toToolError(name: string, error: unknown): ToolError {
  if (error instanceof ToolError) return error;
  if (error instanceof ToolInputError) return new ToolError(error.message);
  if (error instanceof z.ZodError) return invalidInput(error);
  logger.error(`Ferramenta ${name} falhou`, error);
  return new ToolError('Erro interno ao executar a ferramenta. Tente de novo mais tarde.');
}
