import type { Insight, InsightKind } from "@/lib/api/analysis"
import type { Cents, IsoDate } from "@/lib/api/types"
import { formatDateShort, formatMonth, formatMonthShort } from "@/lib/format/date"
import { formatMoney } from "@/lib/format/money"

export interface Period {
  from: IsoDate
  to: IsoDate
}

/** Ordem dos grupos no relatório: do mais "acionável" ao planejamento. */
export const KIND_ORDER: InsightKind[] = ["SIN", "LEAK", "CUT", "SUGGESTION"]

export interface InsightGroup {
  kind: InsightKind
  insights: Insight[]
}

/** Sem economia estimada vai para o fim do grupo; o sort é estável para empates. */
function bySavingsDesc(a: Insight, b: Insight): number {
  return (b.monthlySavings ?? -1) - (a.monthlySavings ?? -1)
}

/** Agrupa por tipo, na ordem do relatório; grupos vazios saem. Dentro do grupo, maior economia primeiro. */
export function groupInsights(insights: Insight[]): InsightGroup[] {
  return KIND_ORDER.map((kind) => ({
    kind,
    insights: insights.filter((insight) => insight.kind === kind).sort(bySavingsDesc),
  })).filter((group) => group.insights.length > 0)
}

export interface SavingsRow {
  id: string
  /** Rótulo curto (o da evidência) para o gráfico. */
  label: string
  /** Título completo do insight, para a dica e a tabela. */
  title: string
  kind: InsightKind
  savings: Cents
}

/** Insights com economia estimada, maior primeiro. */
export function savingsRows(insights: Insight[]): SavingsRow[] {
  return insights
    .filter((insight): insight is Insight & { monthlySavings: Cents } => (insight.monthlySavings ?? 0) > 0)
    .map((insight) => ({
      id: insight.id,
      label: insight.evidence?.label ?? insight.title,
      title: insight.title,
      kind: insight.kind,
      savings: insight.monthlySavings,
    }))
    .sort((a, b) => b.savings - a.savings)
}

/** Percentuais inteiros de duas partes que somam sempre 100. */
export function splitPercent(first: Cents, second: Cents): [number, number] {
  const total = first + second
  if (total <= 0) return [0, 0]
  const firstPercent = Math.round((first / total) * 100)
  return [firstPercent, 100 - firstPercent]
}

function lastDayOfMonth(date: IsoDate): number {
  const [year, month] = date.split("-").map(Number)
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function isWholeMonths(period: Period): boolean {
  return period.from.endsWith("-01") && Number(period.to.slice(8, 10)) === lastDayOfMonth(period.to)
}

/** "jul a set" quando o período é de meses inteiros; senão "01 jul a 30 set". */
export function periodLabel(period: Period): string {
  if (isWholeMonths(period)) {
    const from = period.from.slice(0, 7)
    const to = period.to.slice(0, 7)
    if (from === to) return formatMonth(from).split(" de ")[0]
    return `${formatMonthShort(from)} a ${formatMonthShort(to)}`
  }
  return `${formatDateShort(period.from)} a ${formatDateShort(period.to)}`
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

/** ["Pedidos de delivery", "38 ocorrências", "R$ 2.554,80 no período"] — exibidos separados por " · ". */
export function evidenceParts(evidence: NonNullable<Insight["evidence"]>, reportPeriod: Period): string[] {
  const samePeriod = evidence.period.from === reportPeriod.from && evidence.period.to === reportPeriod.to
  const when = samePeriod ? "no período" : `de ${formatDateShort(evidence.period.from)} a ${formatDateShort(evidence.period.to)}`
  return [
    evidence.label,
    plural(evidence.occurrences, "ocorrência", "ocorrências"),
    `${formatMoney(evidence.total)} ${when}`,
  ]
}

/** Peso aproximado da altura de um grupo: cabeçalho + cartões (texto longo pesa mais). */
function groupWeight(group: InsightGroup): number {
  return 0.4 + group.insights.reduce((sum, insight) => sum + 1 + insight.explanation.length / 300, 0)
}

/**
 * Divide os grupos em duas colunas contíguas de altura parecida, mantendo a
 * ordem do relatório (coluna da esquerda primeiro, como no celular).
 */
export function balanceColumns(groups: InsightGroup[]): [InsightGroup[], InsightGroup[]] {
  const weights = groups.map(groupWeight)
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let best = 0
  let bestDiff = Number.POSITIVE_INFINITY
  let left = 0
  for (let split = 0; split <= groups.length; split++) {
    const diff = Math.abs(total - 2 * left)
    if (diff <= bestDiff) {
      best = split
      bestDiff = diff
    }
    left += weights[split] ?? 0
  }
  return [groups.slice(0, best), groups.slice(best)]
}
