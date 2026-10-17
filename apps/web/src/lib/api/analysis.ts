import type { Cents, IsoDate, IsoDateTime } from "./types"

/**
 * Análise do Claude. O relatório chega de dois jeitos: o Claude do usuário
 * conectado ao servidor MCP (`/mcp`) salva com `salvar_analise`, ou o app gera
 * pela API da Anthropic ("Gerar análise"). As perguntas avulsas ("Pergunte ao
 * Claude") também vão pela API da Anthropic, com as mesmas ferramentas.
 */

export type InsightKind =
  /** Dá para cortar sem mexer na qualidade de vida. */
  | "CUT"
  /** "Gasto do pecado": supérfluo recorrente. */
  | "SIN"
  /** Vazamento: assinatura esquecida, tarifa, juros. */
  | "LEAK"
  /** Sugestão de planejamento. */
  | "SUGGESTION"

export interface Insight {
  id: string
  kind: InsightKind
  title: string
  /** Explicação em linguagem natural, como o Claude escreveria. */
  explanation: string
  /** Economia mensal estimada se a sugestão for seguida. */
  monthlySavings: Cents | null
  /** Evidência: o que nas transações sustenta o insight. */
  evidence: {
    label: string
    occurrences: number
    total: Cents
    period: { from: IsoDate; to: IsoDate }
  } | null
  confidence: "HIGH" | "MEDIUM" | "LOW"
}

export interface AnalysisReport {
  generatedAt: IsoDateTime
  period: { from: IsoDate; to: IsoDate }
  /** Resumo de uma frase. */
  headline: string
  summary: string
  /** Média mensal de gasto fixo (compromissos) vs. discricionário. */
  monthlyFixed: Cents
  monthlyDiscretionary: Cents
  potentialMonthlySavings: Cents
  insights: Insight[]
}

/** De onde veio o relatório: o Claude do usuário via MCP ou o app (API da Anthropic). */
export type AnalysisSource = "MCP" | "APP"

/** GET /api/analysis/latest (404 quando ainda não há nenhum) e GET /api/analysis. */
export interface StoredAnalysis extends AnalysisReport {
  id: string
  source: AnalysisSource
  /** Modelo que gerou o relatório, quando informado. */
  model: string | null
}

/**
 * O relatório como as telas recebem da camada de dados: `sample` é o relatório
 * ilustrativo do modo `DATA_SOURCE=mock`, que não veio das transações de ninguém.
 */
export type ShownAnalysis = StoredAnalysis & { sample: boolean }

export type AnalysisRunStatus = "RUNNING" | "SUCCEEDED" | "FAILED"

/** Uma geração de relatório pelo app (POST /api/analysis/runs, GET /api/analysis/runs/:id). */
export interface AnalysisRun {
  id: string
  status: AnalysisRunStatus
  startedAt: IsoDateTime
  finishedAt: IsoDateTime | null
  /** Motivo da falha, em pt-BR e seguro para mostrar. */
  error: string | null
  /** Relatório salvo quando terminou bem. */
  reportId: string | null
  model: string | null
}

/** GET /api/analysis/status */
export interface AnalysisStatus {
  /** `enabled`: a API tem `ANTHROPIC_API_KEY` e pode gerar análises e responder perguntas. */
  app: { enabled: boolean; model: string | null }
  latestRun: AnalysisRun | null
}

export interface AskTurn {
  role: "user" | "assistant"
  content: string
}

/** POST /api/analysis/ask */
export interface AskRequest {
  question: string
  history?: AskTurn[]
}

export interface AskAnswer {
  /** Markdown, em pt-BR. */
  answer: string
  model: string
}

/** Limites que a API aceita em POST /api/analysis/ask. */
export const ASK_LIMITS = {
  /** Caracteres da pergunta. */
  question: 1000,
  /** Caracteres de cada mensagem do histórico. */
  turnContent: 8000,
  /** Mensagens no histórico. */
  historyTurns: 10,
} as const
