import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { today } from '../domain/dates.js';
import { AnalysisService } from '../insights/analysis.service.js';
import { InsightsService } from '../insights/insights.service.js';
import { createInsightTools } from '../insights/tools.js';
import { ANTHROPIC_CLIENT, type AnthropicClient } from './anthropic.client.js';
import { ClaudeDisabledError } from './claude-disabled.error.js';
import { describeForLog, failure, toClaudeFailure } from './claude-errors.js';
import { toRunnableTool, type RunnableTool } from './claude-tools.js';
import { answerText, emptyUsage, runConversation } from './conversation.js';
import { ASK_LIMITS, type AskTurn, buildAskParams } from './prompts.js';

export class AskInProgressError extends Error {
  constructor() {
    super('O Claude ainda está respondendo a pergunta anterior. Aguarde ela terminar.');
    this.name = 'AskInProgressError';
  }
}

export interface AskAnswer {
  /** Markdown, em português. */
  answer: string;
  /** Modelo que respondeu (pode ser o do fallback em caso de recusa). */
  model: string;
}

const TRUNCATED_NOTE = '\n\n_(A resposta passou do tamanho máximo e foi cortada.)_';

/**
 * "Pergunte ao Claude": responde na hora usando só as ferramentas de leitura
 * (sem `salvar_analise`). Uma pergunta por vez.
 */
@Injectable()
export class AskService {
  private readonly logger = new Logger(AskService.name);
  private readonly tools: RunnableTool[];
  private inFlight = false;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(ANTHROPIC_CLIENT) private readonly client: AnthropicClient | null,
    insights: InsightsService,
    analysis: AnalysisService,
  ) {
    this.tools = createInsightTools({ insights, analysis, source: 'APP' })
      .filter((tool) => tool.readOnly)
      .map(toRunnableTool);
  }

  async ask(question: string, history: AskTurn[]): Promise<AskAnswer> {
    const client = this.client;
    if (!client) throw new ClaudeDisabledError();
    if (this.inFlight) throw new AskInProgressError();
    this.inFlight = true;

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, ASK_LIMITS.timeoutMs);
    const usage = emptyUsage();
    try {
      const { message } = await runConversation(
        client,
        buildAskParams({
          model: this.env.ANTHROPIC_MODEL,
          tools: this.tools,
          today: today(this.env.TIMEZONE),
          timeZone: this.env.TIMEZONE,
          question,
          history,
        }),
        { signal: controller.signal, usage },
      );
      if (message.stop_reason === 'refusal') throw failure('REFUSAL');
      if (message.stop_reason === 'tool_use') throw failure('ITERATION_LIMIT');
      const text = answerText(message);
      if (!text)
        throw failure(message.stop_reason === 'max_tokens' ? 'MAX_TOKENS' : 'EMPTY_ANSWER');
      const answer = message.stop_reason === 'max_tokens' ? text + TRUNCATED_NOTE : text;
      return { answer, model: message.model };
    } catch (error) {
      const failed = toClaudeFailure(error, timedOut);
      this.logger.warn(`Pergunta falhou: ${failed.code} — ${describeForLog(error)}`);
      throw failed;
    } finally {
      clearTimeout(timer);
      this.inFlight = false;
      this.logger.log(
        `Pergunta: ${usage.requests} chamadas, ${usage.inputTokens} in / ${usage.outputTokens} out / ` +
          `${usage.cacheReadInputTokens} cache lido / ${usage.cacheCreationInputTokens} cache escrito`,
      );
    }
  }
}
