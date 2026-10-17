import { ToolError } from '@anthropic-ai/sdk/lib/tools/ToolError';
import { z } from 'zod';
import { ToolInputError } from '../insights/insights.service.js';
import type { InsightTool } from '../insights/tools.js';
import { toRunnableTool } from './claude-tools.js';
import { addUsage, answerText, emptyUsage } from './conversation.js';

function insightTool(run: InsightTool['run']): InsightTool {
  return {
    name: 'buscar',
    title: 'Buscar',
    description: 'Busca transações',
    inputSchema: z.object({
      de: z.string().optional().describe('Início'),
      limite: z.number().int().min(1).max(200).default(50),
    }),
    readOnly: true,
    run,
  };
}

describe('toRunnableTool', () => {
  it('gera o schema de entrada do zod 4: campos com default não são obrigatórios', () => {
    const tool = toRunnableTool(insightTool(async () => ({})));
    expect(tool).toMatchObject({ type: 'custom', name: 'buscar', description: 'Busca transações' });
    const schema = (tool as unknown as { input_schema: Record<string, unknown> }).input_schema;
    expect(schema).toMatchObject({
      type: 'object',
      properties: {
        de: { type: 'string', description: 'Início' },
        limite: { type: 'integer', default: 50, minimum: 1, maximum: 200 },
      },
    });
    expect(schema).not.toHaveProperty('required');
    expect(schema).not.toHaveProperty('$schema');
  });

  it('valida e aplica defaults antes de rodar; devolve JSON', async () => {
    const run = vi.fn(async (input: Record<string, unknown>) => ({ recebido: input }));
    const tool = toRunnableTool(insightTool(run));
    const input = tool.parse({});
    expect(input).toEqual({ limite: 50 });
    expect(JSON.parse((await tool.run(input)) as string)).toEqual({ recebido: { limite: 50 } });
  });

  it('entrada inválida vira ToolError legível (o Claude corrige e chama de novo)', () => {
    const tool = toRunnableTool(insightTool(async () => ({})));
    expect(() => tool.parse({ limite: 500 })).toThrow(ToolError);
    try {
      tool.parse({ limite: 500 });
    } catch (error) {
      expect((error as ToolError).content).toContain('Entrada inválida');
      expect((error as ToolError).content).toContain('limite');
    }
  });

  it('ToolInputError passa a mensagem; erro interno vira mensagem genérica', async () => {
    const userError = toRunnableTool(
      insightTool(async () => {
        throw new ToolInputError('Período maior que 24 meses');
      }),
    );
    await expect(userError.run({ limite: 1 })).rejects.toMatchObject({
      content: 'Período maior que 24 meses',
    });

    const internal = toRunnableTool(
      insightTool(async () => {
        throw new Error('connection terminated: senha=xyz');
      }),
    );
    await expect(internal.run({ limite: 1 })).rejects.toMatchObject({
      content: 'Erro interno ao executar a ferramenta. Tente de novo mais tarde.',
    });
  });
});

describe('addUsage', () => {
  it('soma o uso do topo da resposta', () => {
    const total = emptyUsage();
    addUsage(total, {
      input_tokens: 10,
      output_tokens: 5,
      cache_creation_input_tokens: 100,
      cache_read_input_tokens: null,
    } as never);
    expect(total).toEqual({
      requests: 1,
      inputTokens: 10,
      outputTokens: 5,
      cacheCreationInputTokens: 100,
      cacheReadInputTokens: 0,
    });
  });

  it('com fallback, soma cada tentativa de usage.iterations', () => {
    const total = emptyUsage();
    addUsage(total, {
      input_tokens: 7,
      output_tokens: 3,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      iterations: [
        {
          type: 'message',
          input_tokens: 50,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 10,
        },
        {
          type: 'fallback_message',
          input_tokens: 7,
          output_tokens: 3,
          cache_creation_input_tokens: 40,
          cache_read_input_tokens: 0,
        },
      ],
    } as never);
    expect(total).toEqual({
      requests: 1,
      inputTokens: 57,
      outputTokens: 3,
      cacheCreationInputTokens: 40,
      cacheReadInputTokens: 10,
    });
  });
});

describe('answerText', () => {
  it('junta só os blocos de texto', () => {
    expect(
      answerText({
        content: [
          { type: 'thinking', thinking: '', signature: 'x' },
          { type: 'text', text: 'Parte 1' },
          { type: 'text', text: 'Parte 2 ' },
        ],
      } as never),
    ).toBe('Parte 1\n\nParte 2');
  });
});
