import type { Account, Cents, Invoice, IsoDate } from "@/lib/api/types"

/** Uma fatura pronta para o gráfico/tabela (dados simples, serializáveis). */
export interface InvoicePoint {
  id: string
  /** `YYYY-MM` do vencimento — é o mês pelo qual a fatura é conhecida. */
  month: string
  dueDate: IsoDate
  closingDate: IsoDate | null
  total: Cents
  open: boolean
}

export interface InvoiceHistory {
  accountId: string
  cardName: string
  /** Do mais antigo ao mais novo, no máximo `count`. */
  points: InvoicePoint[]
  open: InvoicePoint | null
  /** A fatura em aberto já fechou (não recebe mais compras), mas ainda não venceu. */
  openHasClosed: boolean
  /** Média das faturas fechadas exibidas (null se não houver nenhuma). */
  averageClosed: Cents | null
  closedCount: number
}

/**
 * Fatura em aberto do cartão: a de vencimento mais próximo a partir de hoje (mesma regra da visão geral).
 * Faturas futuras além dela (parcelas, por exemplo) não contam como "a" fatura em aberto.
 */
export function findOpenInvoice(invoices: Invoice[], accountId: string, today: IsoDate): Invoice | null {
  return (
    invoices
      .filter((invoice) => invoice.accountId === accountId && invoice.dueDate >= today)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null
  )
}

/** A fatura já fechou: compras novas vão para a próxima. No dia do fechamento ela ainda está aberta. */
export function hasClosed(invoice: Pick<Invoice, "closingDate">, today: IsoDate): boolean {
  return invoice.closingDate !== null && invoice.closingDate < today
}

/** Últimas `count` faturas de um cartão, com a aberta marcada e a média das fechadas. */
export function buildInvoiceHistory(
  card: Pick<Account, "id" | "name">,
  invoices: Invoice[],
  today: IsoDate,
  count = 12,
): InvoiceHistory {
  const open = findOpenInvoice(invoices, card.id, today)
  // Faturas que vencem depois da em aberto (parcelas futuras) ainda não são uma fatura de verdade: ficam fora.
  const points = invoices
    .filter((invoice) => invoice.accountId === card.id && (!open || invoice.dueDate <= open.dueDate))
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
    .slice(0, count)
    .reverse()
    .map<InvoicePoint>((invoice) => ({
      id: invoice.id,
      month: invoice.dueDate.slice(0, 7),
      dueDate: invoice.dueDate,
      closingDate: invoice.closingDate,
      total: invoice.total,
      open: invoice.id === open?.id,
    }))
  const closed = points.filter((point) => !point.open)
  const averageClosed =
    closed.length > 0 ? Math.round(closed.reduce((sum, point) => sum + point.total, 0) / closed.length) : null

  return {
    accountId: card.id,
    cardName: card.name,
    points,
    open: points.find((point) => point.open) ?? null,
    openHasClosed: open !== null && hasClosed(open, today),
    averageClosed,
    closedCount: closed.length,
  }
}

/**
 * Escala "redonda" para o eixo de valores, partindo do zero: passos de 1, 2, 2,5 ou 5 × 10ⁿ
 * (em centavos, nunca menor que R$ 1). Ex.: máximo de R$ 3.600 → 0, 1 mil, 2 mil, 3 mil, 4 mil.
 */
export function niceAxis(max: number, targetSteps = 4): { domain: [number, number]; ticks: number[] } {
  if (!(max > 0)) return { domain: [0, 100_00], ticks: [0, 50_00, 100_00] }
  const raw = max / targetSteps
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const residual = raw / magnitude
  const nice = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 2.5 ? 2.5 : residual <= 5 ? 5 : 10
  const step = Math.max(100, nice * magnitude)
  const top = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let value = 0; value <= top; value += step) ticks.push(value)
  return { domain: [0, top], ticks }
}

/** "nov/25 a out/26" — período coberto pelas faturas (por mês de vencimento). */
export function periodLabel(points: Pick<InvoicePoint, "month">[], format: (month: string) => string): string | null {
  if (points.length === 0) return null
  const first = points[0].month
  const last = points[points.length - 1].month
  return first === last ? format(first) : `${format(first)} a ${format(last)}`
}
