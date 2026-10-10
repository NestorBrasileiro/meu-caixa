import { z } from 'zod';
import { ANALYSIS_INSTRUCTIONS } from '../insights/instructions.js';
import { toRunnableTool } from './claude-tools.js';
import {
  ASK_SYSTEM_SUFFIX,
  buildAskParams,
  buildRunParams,
  historyMessages,
  RUN_SYSTEM_SUFFIX,
  SERVER_SIDE_FALLBACK_BETA,
} from './prompts.js';

const tool = toRunnableTool({
  name: 'resumo_financeiro',
  title: 'Resumo',
  description: 'Resumo',
  inputSchema: z.object({}),
  readOnly: true,
  run: async () => ({}),
});

describe('buildRunParams', () => {
  const params = buildRunParams({
    model: 'claude-opus-5-5',
    tools: [tool],
    today: '2026-10-10',
    timeZone: 'America/Sao_Paulo',
  });

  it('usa effort high, fallback do servidor, streaming e cache, sem thinking nem tool_choice', () => {
    expect(params).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 64_000,
      max_iterations: 25,
      stream: true,
      betas: [SERVER_SIDE_FALLBACK_BETA],
      fallbacks: 'default',
      output_config: { effort: 'high' },
      cache_control: { type: 'ephemeral' },
    });
    expect(SERVER_SIDE_FALLBACK_BETA).toBe('server-side-fallback-2026-07-01');
    expect(params).not.toHaveProperty('thinking');
    expect(params).not.toHaveProperty('tool_choice');
  });

  it('system: instruções do MCP + modo, com o breakpoint de cache no último bloco', () => {
    expect(params.system).toEqual([
      { type: 'text', text: ANALYSIS_INSTRUCTIONS },
      { type: 'text', text: RUN_SYSTEM_SUFFIX, cache_control: { type: 'ephemeral' } },
    ]);
    expect(RUN_SYSTEM_SUFFIX).toContain('salvar_analise exatamente uma vez');
  });

  it('a data de hoje vai na mensagem, não no system (o system fica estável para o cache)', () => {
    expect(JSON.stringify(params.system)).not.toContain('2026-10-10');
    expect(params.messages).toEqual([
      {
        role: 'user',
        content: expect.stringContaining('Hoje é 2026-10-10 (fuso America/Sao_Paulo)'),
      },
    ]);
  });
});

describe('buildAskParams', () => {
  it('usa effort medium e põe o histórico antes da pergunta', () => {
    const params = buildAskParams({
      model: 'claude-opus-5-5',
      tools: [tool],
      today: '2026-10-10',
      timeZone: 'America/Sao_Paulo',
      question: 'Quanto gastei?',
      history: [
        { role: 'user', content: 'Oi' },
        { role: 'assistant', content: 'Olá!' },
      ],
    });
    expect(params).toMatchObject({
      max_tokens: 16_000,
      max_iterations: 12,
      output_config: { effort: 'medium' },
      fallbacks: 'default',
      betas: [SERVER_SIDE_FALLBACK_BETA],
    });
    expect(params.system.at(-1)).toEqual({
      type: 'text',
      text: ASK_SYSTEM_SUFFIX,
      cache_control: { type: 'ephemeral' },
    });
    expect(params.messages).toEqual([
      { role: 'user', content: 'Oi' },
      { role: 'assistant', content: 'Olá!' },
      {
        role: 'user',
        content: [
          { type: 'text', text: '(Hoje é 2026-10-10, fuso America/Sao_Paulo.)' },
          { type: 'text', text: 'Quanto gastei?' },
        ],
      },
    ]);
  });
});

describe('historyMessages', () => {
  it('descarta turnos do assistente antes da primeira mensagem do usuário', () => {
    expect(
      historyMessages([
        { role: 'assistant', content: 'Bem-vindo' },
        { role: 'user', content: 'Oi' },
        { role: 'assistant', content: 'Olá' },
      ]),
    ).toEqual([
      { role: 'user', content: 'Oi' },
      { role: 'assistant', content: 'Olá' },
    ]);
    expect(historyMessages([{ role: 'assistant', content: 'Só eu' }])).toEqual([]);
  });
});
