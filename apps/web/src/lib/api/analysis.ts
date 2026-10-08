import type { Cents, IsoDate, IsoDateTime } from "./types"

/**
 * Análise do Claude via MCP — ainda sem backend (marco de 100%). O formato
 * descreve o relatório que a análise vai devolver.
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
