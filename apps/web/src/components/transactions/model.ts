import type { Account, Cents, IsoDate, Transaction, TransactionStatus } from "@/lib/api/types"
import { lastMonths, monthRange } from "@/lib/finance/aggregate"
import { isCardPayment, isOwnTransfer } from "@/lib/finance/classify"
import { categoryLabel } from "@/lib/format/category"

/**
 * Regras puras da tela de transações: períodos, filtros, resumo e agrupamento
 * por dia. Sem relógio: tudo deriva de `today`, recebido do servidor.
 */

export const PAGE_SIZE = 50
export const ALL = "all"
/** Valor de filtro/menu para lançamentos sem categoria (Radix não aceita "" como valor). */
export const NO_CATEGORY = "__none__"

// ------------------------------------------------------------------ período

export type PeriodKey = "this-month" | "last-month" | "3m" | "12m"

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "this-month", label: "Este mês" },
  { key: "last-month", label: "Mês passado" },
  { key: "3m", label: "Últimos 3 meses" },
  { key: "12m", label: "Últimos 12 meses" },
]

export interface DateRange {
  from: IsoDate
  to: IsoDate
}

/** Períodos em meses de calendário (o mês corrente conta até hoje). */
export function periodRange(period: PeriodKey, today: IsoDate): DateRange {
  const month = today.slice(0, 7)
  switch (period) {
    case "this-month":
      return { from: `${month}-01`, to: today }
    case "last-month":
      return monthRange(lastMonths(month, 2)[0])
    case "3m":
      return { from: `${lastMonths(month, 3)[0]}-01`, to: today }
    case "12m":
      return { from: `${lastMonths(month, 12)[0]}-01`, to: today }
  }
}

// ------------------------------------------------------------------ filtros

export type FlowFilter = "all" | "in" | "out"
export type StatusFilter = "all" | TransactionStatus

export interface Filters {
  search: string
  accountId: string
  period: PeriodKey
  flow: FlowFilter
  /** Categoria do agregador, `ALL` ou `NO_CATEGORY`. */
  category: string
  status: StatusFilter
  /** Esconde pagamento de fatura e transferências entre contas próprias. */
  hideInternal: boolean
}

export const DEFAULT_FILTERS: Filters = {
  search: "",
  accountId: ALL,
  period: "3m",
  flow: "all",
  category: ALL,
  status: "all",
  hideInternal: true,
}

export function hasActiveFilters(filters: Filters): boolean {
  return (Object.keys(DEFAULT_FILTERS) as (keyof Filters)[]).some((key) =>
    key === "search" ? filters.search.trim() !== "" : filters[key] !== DEFAULT_FILTERS[key],
  )
}

/** Busca sem acento e sem caixa: "farmacia" encontra "Farmácia". */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim()
}

/** Movimentação interna: não é dinheiro novo entrando nem gasto novo saindo. */
export function isInternal(tx: Transaction): boolean {
  return isOwnTransfer(tx) || isCardPayment(tx)
}

export interface FilterResult {
  rows: Transaction[]
  /** Quantos lançamentos o "ocultar movimentações internas" está escondendo. */
  hiddenInternal: number
}

export function applyFilters(
  transactions: Transaction[],
  filters: Filters,
  range: DateRange,
  searchIndex: Map<string, string>,
): FilterResult {
  const query = normalizeText(filters.search)
  const rows: Transaction[] = []
  let hiddenInternal = 0
  for (const tx of transactions) {
    if (tx.date < range.from || tx.date > range.to) continue
    if (filters.accountId !== ALL && tx.accountId !== filters.accountId) continue
    if (filters.flow === "in" && tx.amount <= 0) continue
    if (filters.flow === "out" && tx.amount >= 0) continue
    if (filters.status !== "all" && tx.status !== filters.status) continue
    if (filters.category !== ALL && (tx.category ?? NO_CATEGORY) !== filters.category) continue
    if (query && !searchIndex.get(tx.id)?.includes(query)) continue
    if (filters.hideInternal && isInternal(tx)) {
      hiddenInternal += 1
      continue
    }
    rows.push(tx)
  }
  // A API já devolve do mais novo para o mais antigo; o sort estável só garante.
  rows.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1))
  return { rows, hiddenInternal }
}

/** Texto pesquisável de cada lançamento (descrição + favorecido), já normalizado. */
export function buildSearchIndex(transactions: Transaction[]): Map<string, string> {
  return new Map(
    transactions.map((tx) => [tx.id, normalizeText(`${tx.description}\n${tx.counterpartyName ?? ""}`)]),
  )
}

// ------------------------------------------------------------------- resumo

export interface Summary {
  count: number
  inflow: Cents
  inflowCount: number
  /** Soma dos valores negativos (fica negativa). */
  outflow: Cents
  outflowCount: number
  net: Cents
}

export function summarize(rows: Transaction[]): Summary {
  const summary: Summary = { count: rows.length, inflow: 0, inflowCount: 0, outflow: 0, outflowCount: 0, net: 0 }
  for (const tx of rows) {
    if (tx.amount > 0) {
      summary.inflow += tx.amount
      summary.inflowCount += 1
    } else if (tx.amount < 0) {
      summary.outflow += tx.amount
      summary.outflowCount += 1
    }
  }
  summary.net = summary.inflow + summary.outflow
  return summary
}

// ---------------------------------------------------------------- agrupamento

export interface DayGroup {
  date: IsoDate
  /** Saldo do dia considerando todos os lançamentos filtrados do dia (não só os visíveis). */
  net: Cents
  count: number
  items: Transaction[]
}

/** Agrupa por dia os `limit` primeiros lançamentos; o total do dia usa o conjunto filtrado inteiro. */
export function groupByDay(rows: Transaction[], limit: number): DayGroup[] {
  const totals = new Map<IsoDate, { net: Cents; count: number }>()
  for (const tx of rows) {
    const day = totals.get(tx.date) ?? { net: 0, count: 0 }
    day.net += tx.amount
    day.count += 1
    totals.set(tx.date, day)
  }
  const groups: DayGroup[] = []
  for (const tx of rows.slice(0, limit)) {
    const last = groups.at(-1)
    if (last && last.date === tx.date) last.items.push(tx)
    else groups.push({ date: tx.date, ...totals.get(tx.date)!, items: [tx] })
  }
  return groups
}

// --------------------------------------------------------------- categorias

export interface CategoryOption {
  value: string
  label: string
}

/** Categorias presentes nos dados, em ordem alfabética do rótulo em português. */
export function categoryOptions(transactions: Transaction[]): CategoryOption[] {
  const values = new Set(transactions.map((tx) => tx.category ?? NO_CATEGORY))
  return [...values]
    .map((value) => ({ value, label: categoryLabel(value === NO_CATEGORY ? null : value) }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
}

// ------------------------------------------------------------------- contas

/** O que a tela precisa de cada conta (o resto não vai para o cliente). */
export type AccountOption = Pick<
  Account,
  "id" | "name" | "institutionName" | "type" | "connectionStatus" | "transactionsSyncedThrough"
>

/**
 * Contas com conexão parada cujos lançamentos terminam antes do fim do
 * período: sem o aviso, a falta de lançamentos recentes parece "nada gasto".
 */
export function staleAccounts(accounts: AccountOption[], accountId: string, range: DateRange): AccountOption[] {
  return accounts.filter(
    (account) =>
      (accountId === ALL || account.id === accountId) &&
      account.connectionStatus !== "ACTIVE" &&
      account.transactionsSyncedThrough !== null &&
      account.transactionsSyncedThrough < range.to,
  )
}
