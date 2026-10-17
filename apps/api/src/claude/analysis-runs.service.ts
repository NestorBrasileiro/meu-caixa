import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { and, desc, eq, lt } from 'drizzle-orm';
import { ToolError } from '@anthropic-ai/sdk/lib/tools/ToolError';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { analysisRuns, type AnalysisRunRow, type AnalysisRunUsage } from '../database/schema.js';
import { today } from '../domain/dates.js';
import { analysisReportInputSchema } from '../insights/analysis.schema.js';
import { AnalysisService } from '../insights/analysis.service.js';
import { InsightsService } from '../insights/insights.service.js';
import { createInsightTools, type InsightTool } from '../insights/tools.js';
import { ANTHROPIC_CLIENT, type AnthropicClient } from './anthropic.client.js';
import { ClaudeDisabledError } from './claude-disabled.error.js';
import { describeForLog, failure, toClaudeFailure } from './claude-errors.js';
import { toRunnableTool, type RunnableTool } from './claude-tools.js';
import { emptyUsage, runConversation } from './conversation.js';
import { RUN_LIMITS, SAVE_REMINDER, SAVE_TOOL_NAME, buildRunParams } from './prompts.js';

/** Uma execução RUNNING mais velha que isso com certeza morreu (o limite é 10 min). */
export const STALE_RUN_MS = 30 * 60_000;
export const STALE_RUN_ERROR = 'Interrompida: a execução não terminou (a API pode ter reiniciado).';
const SHUTDOWN_ERROR = 'Interrompida: a API foi desligada durante a análise.';

/** Formato devolvido pela API (`AnalysisRun` do contrato com a interface). */
export interface AnalysisRunDto {
  id: string;
  status: AnalysisRunRow['status'];
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  reportId: string | null;
  model: string | null;
}

export class AnalysisRunInProgressError extends Error {
  constructor() {
    super('Já existe uma análise sendo gerada. Aguarde ela terminar.');
    this.name = 'AnalysisRunInProgressError';
  }
}

export interface StartedRun {
  run: AnalysisRunDto;
  /** Resolve quando a execução termina (com sucesso ou falha). */
  completion: Promise<AnalysisRunDto>;
}

/**
 * "Gerar análise": o Claude (API da Anthropic) roda as mesmas ferramentas do
 * servidor MCP em background e termina salvando o relatório com
 * `salvar_analise` (origem `APP`). Uma execução por vez.
 */
@Injectable()
export class AnalysisRunsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AnalysisRunsService.name);
  private readonly tools: InsightTool[];
  private current: Promise<unknown> | null = null;
  private readonly aborts = new Set<AbortController>();
  private shuttingDown = false;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(ANTHROPIC_CLIENT) private readonly client: AnthropicClient | null,
    insights: InsightsService,
    analysis: AnalysisService,
  ) {
    this.tools = createInsightTools({ insights, analysis, source: 'APP' });
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  get model(): string | null {
    return this.client ? this.env.ANTHROPIC_MODEL : null;
  }

  /**
   * A API roda em uma instância só (o deploy): uma execução que ainda está
   * RUNNING na subida morreu com o processo anterior.
   */
  async onApplicationBootstrap(): Promise<void> {
    const interrupted = await this.db
      .update(analysisRuns)
      .set({ status: 'FAILED', finishedAt: new Date(), error: STALE_RUN_ERROR })
      .where(eq(analysisRuns.status, 'RUNNING'))
      .returning({ id: analysisRuns.id });
    for (const { id } of interrupted) {
      this.logger.warn(`Análise ${id} marcada como falha: não terminou antes de a API reiniciar`);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;
    for (const controller of this.aborts) controller.abort();
    await this.waitForIdle();
  }

  async start(): Promise<StartedRun> {
    const client = this.client;
    if (!client) throw new ClaudeDisabledError();
    await this.failStaleRuns();

    let run: AnalysisRunRow;
    try {
      [run] = (await this.db
        .insert(analysisRuns)
        .values({ status: 'RUNNING', model: this.env.ANTHROPIC_MODEL })
        .returning()) as [AnalysisRunRow];
    } catch (error) {
      // Índice único parcial: já existe uma RUNNING.
      if (isUniqueViolation(error)) throw new AnalysisRunInProgressError();
      throw error;
    }

    const completion = this.execute(client, run);
    const tracked = completion.catch(() => undefined);
    this.current = tracked;
    void tracked.finally(() => {
      if (this.current === tracked) this.current = null;
    });
    return { run: toDto(run), completion };
  }

  async waitForIdle(): Promise<void> {
    await this.current;
  }

  async get(id: string): Promise<AnalysisRunDto | null> {
    const [run] = await this.db.select().from(analysisRuns).where(eq(analysisRuns.id, id));
    return run ? toDto(run) : null;
  }

  async latest(): Promise<AnalysisRunDto | null> {
    const [run] = await this.db
      .select()
      .from(analysisRuns)
      .orderBy(desc(analysisRuns.startedAt))
      .limit(1);
    return run ? toDto(run) : null;
  }

  private async failStaleRuns(): Promise<void> {
    const stale = await this.db
      .update(analysisRuns)
      .set({ status: 'FAILED', finishedAt: new Date(), error: STALE_RUN_ERROR })
      .where(
        and(
          eq(analysisRuns.status, 'RUNNING'),
          lt(analysisRuns.startedAt, new Date(Date.now() - STALE_RUN_MS)),
        ),
      )
      .returning({ id: analysisRuns.id });
    for (const { id } of stale) this.logger.warn(`Análise ${id} marcada como falha: travada`);
  }

  private async execute(client: AnthropicClient, run: AnalysisRunRow): Promise<AnalysisRunDto> {
    this.logger.log(`Análise ${run.id} iniciada (${this.env.ANTHROPIC_MODEL})`);
    const usage = emptyUsage();
    const controller = new AbortController();
    this.aborts.add(controller);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, RUN_LIMITS.timeoutMs);

    const state: { reportId: string | null; model: string } = {
      reportId: null,
      model: this.env.ANTHROPIC_MODEL,
    };
    let status: 'SUCCEEDED' | 'FAILED' = 'FAILED';
    let error: string | null = null;
    try {
      await this.converse(client, state, usage, controller.signal);
      status = 'SUCCEEDED';
    } catch (cause) {
      const failed = toClaudeFailure(cause, timedOut);
      this.logger.warn(`Análise ${run.id}: ${failed.code} — ${describeForLog(cause)}`);
      // Relatório já salvo: o que falhou depois (a frase final) não importa.
      if (state.reportId) status = 'SUCCEEDED';
      else error = this.shuttingDown && !timedOut ? SHUTDOWN_ERROR : failed.message;
    } finally {
      clearTimeout(timer);
      this.aborts.delete(controller);
    }

    const [finished] = await this.db
      .update(analysisRuns)
      .set({
        status,
        finishedAt: new Date(),
        error,
        reportId: state.reportId,
        model: state.model,
        usage,
      })
      .where(eq(analysisRuns.id, run.id))
      .returning();
    this.logger.log(
      `Análise ${run.id} terminou: ${status} (${usage.requests} chamadas, ` +
        `${usage.inputTokens} in / ${usage.outputTokens} out / ` +
        `${usage.cacheReadInputTokens} cache lido / ${usage.cacheCreationInputTokens} cache escrito)`,
    );
    return toDto(finished!);
  }

  /** O loop com o Claude; lança `ClaudeFailure` (ou erro do SDK) se não terminar salvando. */
  private async converse(
    client: AnthropicClient,
    state: { reportId: string | null; model: string },
    usage: AnalysisRunUsage,
    signal: AbortSignal,
  ): Promise<void> {
    const params = buildRunParams({
      model: this.env.ANTHROPIC_MODEL,
      tools: this.runTools(state),
      today: today(this.env.TIMEZONE),
      timeZone: this.env.TIMEZONE,
    });
    const onMessage = (message: { model: string }) => {
      state.model = message.model;
    };

    let result = await runConversation(client, params, { signal, usage, onMessage });
    const iterationsLeft = RUN_LIMITS.maxIterations - result.requests;
    // `tool_choice` forçado não existe neste modelo: se o Claude encerrar sem
    // salvar, um lembrete (uma vez só) antes de dar como falha.
    if (!state.reportId && result.message.stop_reason === 'end_turn' && iterationsLeft > 0) {
      result = await runConversation(
        client,
        {
          ...result.params,
          max_iterations: iterationsLeft,
          messages: [...result.params.messages, { role: 'user', content: SAVE_REMINDER }],
        },
        { signal, usage, onMessage },
      );
    }

    if (state.reportId) return;
    switch (result.message.stop_reason) {
      case 'refusal':
        throw failure('REFUSAL');
      case 'max_tokens':
        throw failure('MAX_TOKENS');
      case 'tool_use':
        throw failure('ITERATION_LIMIT');
      default:
        throw failure('NOT_SAVED');
    }
  }

  /**
   * Ferramentas da execução: as mesmas do MCP, com `salvar_analise` gravando o
   * modelo que de fato respondeu (o fallback pode trocar) e uma vez só.
   */
  private runTools(state: { reportId: string | null; model: string }): RunnableTool[] {
    return this.tools.map((tool) => {
      if (tool.name !== SAVE_TOOL_NAME) return toRunnableTool(tool);
      return toRunnableTool({
        ...tool,
        // O modelo é registrado pelo servidor, não informado pelo Claude.
        inputSchema: analysisReportInputSchema.omit({ model: true }),
        run: async (input) => {
          if (state.reportId) {
            throw new ToolError(
              `A análise desta execução já foi salva (id ${state.reportId}). Não chame ${SAVE_TOOL_NAME} de novo.`,
            );
          }
          const result = await tool.run({ ...input, model: state.model });
          state.reportId = String(result.id);
          return result;
        },
      });
    });
  }
}

export function toDto(run: AnalysisRunRow): AnalysisRunDto {
  return {
    id: run.id,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    error: run.error,
    reportId: run.reportId,
    model: run.model,
  };
}

function isUniqueViolation(error: unknown): boolean {
  for (let current = error; current; current = (current as { cause?: unknown }).cause) {
    if ((current as { code?: unknown }).code === '23505') return true;
  }
  return false;
}
