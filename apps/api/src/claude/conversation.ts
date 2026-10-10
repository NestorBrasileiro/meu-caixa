import type { BetaMessage, BetaUsage } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type { AnalysisRunUsage } from '../database/schema.js';
import type { AnthropicClient } from './anthropic.client.js';
import type { ConversationParams } from './prompts.js';

export interface ConversationResult {
  /** Última resposta do Claude (a que encerrou o loop). */
  message: BetaMessage;
  /** Parâmetros com o histórico completo, para continuar a conversa. */
  params: ConversationParams;
  /** Chamadas à API feitas neste trecho. */
  requests: number;
}

/**
 * Roda o loop de ferramentas com o Tool Runner (beta) em streaming: cada volta
 * é um stream, lido até o fim com `finalMessage()` (pedidos com `max_tokens`
 * alto precisam de streaming). O runner executa as ferramentas quando a
 * resposta para em `tool_use`, retoma `pause_turn` e para em `end_turn`,
 * `max_tokens` e `refusal` (sem rodar as ferramentas de uma resposta cortada).
 */
export async function runConversation(
  client: AnthropicClient,
  params: ConversationParams,
  options: {
    signal: AbortSignal;
    usage: AnalysisRunUsage;
    onMessage?: (message: BetaMessage) => void;
  },
): Promise<ConversationResult> {
  const runner = client.beta.messages.toolRunner(params, { signal: options.signal });
  let last: BetaMessage | undefined;
  let requests = 0;
  for await (const stream of runner) {
    const message = await stream.finalMessage();
    requests += 1;
    addUsage(options.usage, message.usage);
    options.onMessage?.(message);
    last = message;
  }
  if (!last) throw new Error('O Tool Runner terminou sem nenhuma resposta');
  return { message: last, params: runner.params as ConversationParams, requests };
}

export function emptyUsage(): AnalysisRunUsage {
  return {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  };
}

/**
 * Soma o uso de uma resposta. Com fallback do servidor, `usage.iterations`
 * traz cada tentativa (inclusive a recusada) e é a fonte para custo; sem ele,
 * vale o `usage` do topo.
 */
export function addUsage(total: AnalysisRunUsage, usage: BetaUsage | null | undefined): void {
  total.requests += 1;
  if (!usage) return;
  const parts: TokenCounts[] = usage.iterations?.length ? usage.iterations : [usage];
  for (const part of parts) {
    total.inputTokens += part.input_tokens ?? 0;
    total.outputTokens += part.output_tokens ?? 0;
    total.cacheCreationInputTokens += part.cache_creation_input_tokens ?? 0;
    total.cacheReadInputTokens += part.cache_read_input_tokens ?? 0;
  }
}

interface TokenCounts {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** Texto da resposta final (blocos `text`, na ordem). */
export function answerText(message: BetaMessage): string {
  return message.content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('\n\n')
    .trim();
}
