import type { Insight } from "@/lib/api/analysis"
import type { Commitment } from "@/lib/api/planning"
import type { Account, Cents, Invoice, IsoDate } from "@/lib/api/types"
import type { CategoryTotal } from "@/lib/finance/aggregate"
import { formatDateShort, formatMonthShort } from "@/lib/format/date"

/**
 * Regras de montagem da visão geral (funções puras, sem relógio): tudo
 * recebe `today` explicitamente.
 */

const DAY_MS = 86_400_000

function calendarDate(date: IsoDate): Date {
  return new Date(`${date}T12:00:00Z`)
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = calendarDate(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((calendarDate(to).getTime() - calendarDate(from).getTime()) / DAY_MS)
}

function shiftMonth(month: string, offset: number): string {
  const [year, m] = month.split("-").map(Number)
  const index = year * 12 + (m - 1) + offset
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`
}

/** Dia `dayOfMonth` do mês `YYYY-MM`, limitado ao último dia (31 → 30 em setembro). */
function dayIn(month: string, dayOfMonth: number): IsoDate {
  const [year, m] = month.split("-").map(Number)
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate()
  return `${month}-${String(Math.min(dayOfMonth, lastDay)).padStart(2, "0")}`
}

/** Próxima data (a partir de `from`, inclusive) em que cai o dia `dayOfMonth`. */
export function nextOccurrence(dayOfMonth: number, from: IsoDate): IsoDate {
  const month = from.slice(0, 7)
  const thisMonth = dayIn(month, dayOfMonth)
  return thisMonth >= from ? thisMonth : dayIn(shiftMonth(month, 1), dayOfMonth)
}

/** "Quarta-feira" a partir de "quarta-feira". */
export function capitalize(value: string): string {
  return value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1)
}

const monthNameFormatter = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" })

/** `YYYY-MM` → "outubro". */
export function monthNameOf(month: string): string {
  return monthNameFormatter.format(calendarDate(`${month}-01`))
}

/** "jul a set" (meses do período), como na tela de análise; "setembro" quando é um mês só. */
export function monthSpanLabel(from: IsoDate, to: IsoDate): string {
  const first = from.slice(0, 7)
  const last = to.slice(0, 7)
  return first === last ? monthNameOf(first) : `${formatMonthShort(first)} a ${formatMonthShort(last)}`
}

/** "1 conta", "4 contas". */
export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

/** "15 out" com espaço não separável, para dia e mês não quebrarem em linhas diferentes. */
function shortDate(date: IsoDate): string {
  return formatDateShort(date).replace(" ", "\u00a0")
}

/** "hoje", "amanhã", "em 3 dias". */
export function relativeDays(days: number): string {
  if (days <= 0) return "hoje"
  if (days === 1) return "amanhã"
  return `em ${days} dias`
}

// ------------------------------------------------------------ vencimentos

export interface UpcomingItem {
  id: string
  kind: "COMMITMENT" | "INVOICE"
  name: string
  /** Linha secundária (parcela, onde é pago, fechamento da fatura). */
  detail: string | null
  date: IsoDate
  daysAway: number
  amount: Cents
  /**
   * Cobrado direto no cartão. `invoiceDue` é o vencimento da fatura em que a
   * cobrança cai (null = numa fatura que ainda não existe).
   */
  card: { invoiceDue: IsoDate | null } | null
  /**
   * Entra no "total a pagar" da janela. Uma cobrança no cartão só entra
   * quando a fatura em que ela cai vence na janela: a fatura listada mostra o
   * valor de hoje, sem essa cobrança futura, então não há dupla contagem.
   */
  inTotal: boolean
}

/** Compromisso cobrado no cartão: sai do caixa só quando a fatura for paga. */
export function isChargedToCard(commitment: Pick<Commitment, "paymentMethod">): boolean {
  return commitment.paymentMethod === "CARD"
}

/**
 * Fatura em aberto em que cai uma cobrança no cartão feita em `date`: a
 * primeira que fecha no próprio dia ou depois (mesma regra do agregador).
 */
function invoiceForCharge(invoices: Invoice[], date: IsoDate, today: IsoDate): Invoice | null {
  return (
    invoices
      .filter((invoice) => invoice.dueDate >= today && invoice.closingDate !== null && invoice.closingDate >= date)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null
  )
}

/**
 * Compromissos fixos que vencem na janela `[today, today + horizonDays]`
 * mais as faturas de cartão em aberto que vencem nela, por data.
 */
export function upcomingDue({
  commitments,
  invoices,
  accounts,
  today,
  horizonDays,
}: {
  commitments: Commitment[]
  invoices: Invoice[]
  accounts: Account[]
  today: IsoDate
  horizonDays: number
}): UpcomingItem[] {
  const until = addDays(today, horizonDays)
  const items: UpcomingItem[] = []

  for (const commitment of commitments) {
    const date = nextOccurrence(commitment.dayOfMonth, today)
    if (date > until || date < commitment.startsOn) continue
    if (commitment.endsOn && date > commitment.endsOn) continue
    const installment = commitment.installments
      ? `Parcela ${commitment.installments.paid + 1} de ${commitment.installments.total}`
      : null
    const invoice = isChargedToCard(commitment) ? invoiceForCharge(invoices, date, today) : null
    const card = isChargedToCard(commitment) ? { invoiceDue: invoice?.dueDate ?? null } : null
    const cardDetail = card
      ? `No cartão · entra na ${card.invoiceDue ? `fatura de ${shortDate(card.invoiceDue)}` : "próxima fatura"}`
      : null
    items.push({
      id: commitment.id,
      kind: "COMMITMENT",
      name: commitment.name,
      detail: [cardDetail, installment, commitment.notes].filter(Boolean).join(" · ") || null,
      date,
      daysAway: daysBetween(today, date),
      amount: commitment.amount,
      card,
      inTotal: card === null || (card.invoiceDue !== null && card.invoiceDue <= until),
    })
  }

  for (const invoice of invoices) {
    if (invoice.dueDate < today || invoice.dueDate > until) continue
    const account = accounts.find((a) => a.id === invoice.accountId)
    const closing =
      invoice.closingDate && invoice.closingDate >= today
        ? `fecha ${shortDate(invoice.closingDate)}`
        : null
    items.push({
      id: invoice.id,
      kind: "INVOICE",
      name: "Fatura do cartão",
      detail: [account?.name, closing].filter(Boolean).join(" · ") || null,
      date: invoice.dueDate,
      daysAway: daysBetween(today, invoice.dueDate),
      amount: invoice.total,
      card: null,
      inTotal: true,
    })
  }

  return items.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "pt-BR"))
}

/** Fatura em aberto mais próxima (vencimento a partir de hoje). */
export function nextOpenInvoice(invoices: Invoice[], today: IsoDate): Invoice | null {
  return (
    invoices
      .filter((invoice) => invoice.dueDate >= today)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null
  )
}

// ------------------------------------------------------------- categorias

export interface CategoryBar {
  key: string
  label: string
  total: Cents
  count: number
  share: number
  /** Para "Outros": quantas categorias foram agrupadas. */
  grouped: number
}

/** Top `limit` categorias + "Outros" com o resto (sempre por último). */
export function topCategories(rows: CategoryTotal[], limit: number): CategoryBar[] {
  const total = rows.reduce((sum, row) => sum + row.total, 0)
  const share = (value: Cents) => (total > 0 ? value / total : 0)
  const top: CategoryBar[] = rows.slice(0, limit).map((row) => ({
    key: row.category ?? "none",
    label: row.label,
    total: row.total,
    count: row.count,
    share: share(row.total),
    grouped: 0,
  }))
  const rest = rows.slice(limit)
  if (rest.length > 0) {
    const restTotal = rest.reduce((sum, row) => sum + row.total, 0)
    top.push({
      key: "others",
      label: "Outros",
      total: restTotal,
      count: rest.reduce((sum, row) => sum + row.count, 0),
      share: share(restTotal),
      grouped: rest.length,
    })
  }
  return top
}

// ------------------------------------------------------------- vazamentos

export interface LeakItem {
  id: string
  kind: "LEAK" | "SIN"
  title: string
  reason: string
  monthlySavings: Cents | null
}

/** Primeira frase da explicação: o "porquê" em uma linha. */
export function firstSentence(text: string): string {
  const match = text.match(/^.+?[.!?](?=\s|$)/)
  return (match?.[0] ?? text).trim()
}

/** Os `count` maiores vazamentos/gastos do pecado, por economia mensal. */
export function topLeaks(insights: Insight[], count: number): LeakItem[] {
  return insights
    .filter((insight): insight is Insight & { kind: "LEAK" | "SIN" } =>
      insight.kind === "LEAK" || insight.kind === "SIN",
    )
    .sort((a, b) => (b.monthlySavings ?? 0) - (a.monthlySavings ?? 0))
    .slice(0, count)
    .map((insight) => ({
      id: insight.id,
      kind: insight.kind,
      title: insight.title,
      reason: firstSentence(insight.explanation),
      monthlySavings: insight.monthlySavings,
    }))
}
