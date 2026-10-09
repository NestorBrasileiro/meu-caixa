import type { Account, Cents, IsoDate, Transaction, TransactionStatus } from "@/lib/api/types"
import { lastMonths, monthRange } from "@/lib/finance/aggregate"
import { isCardPayment, isCashAccount, isOwnTransfer } from "@/lib/finance/classify"
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

export type InternalKind = "card-payment" | "own-transfer"

/** Tipo de movimentação interna que a categoria representa (as regras olham só a categoria). */
export function internalKindOf(category: string | null): InternalKind | null {
  const probe = { category } as Transaction
  return isCardPayment(probe) ? "card-payment" : isOwnTransfer(probe) ? "own-transfer" : null
}

/** Por que um lançamento editado nesta tela só continua na lista por estar fixado. */
export type OutOfFilterReason = "internal" | "category"

export interface FilterResult {
  rows: Transaction[]
  /** Quantos lançamentos o "ocultar movimentações internas" está escondendo. */
  hiddenInternal: number
  /** Lançamentos fixados (editados com os filtros atuais) que, pelos filtros, já teriam saído da lista. */
  outOfFilter: Map<string, OutOfFilterReason>
}

/**
 * Aplica os filtros. Duas exceções ao "ocultar movimentações internas":
 * - escolher uma categoria é pedir por ela; se a categoria é interna, ela aparece;
 * - lançamentos em `pinned` (recategorizados desde a última mudança de filtro)
 *   continuam onde o usuário os viu, em vez de sumir no clique.
 */
export function applyFilters(
  transactions: Transaction[],
  filters: Filters,
  range: DateRange,
  searchIndex: Map<string, string>,
  pinned: ReadonlySet<string> = new Set(),
): FilterResult {
  const query = normalizeText(filters.search)
  const rows: Transaction[] = []
  const outOfFilter = new Map<string, OutOfFilterReason>()
  let hiddenInternal = 0
  for (const tx of transactions) {
    if (tx.date < range.from || tx.date > range.to) continue
    if (filters.accountId !== ALL && tx.accountId !== filters.accountId) continue
    if (filters.flow === "in" && tx.amount <= 0) continue
    if (filters.flow === "out" && tx.amount >= 0) continue
    if (filters.status !== "all" && tx.status !== filters.status) continue
    if (query && !searchIndex.get(tx.id)?.includes(query)) continue
    const reason: OutOfFilterReason | null =
      filters.category !== ALL && (tx.category ?? NO_CATEGORY) !== filters.category
        ? "category"
        : filters.hideInternal && filters.category === ALL && isInternal(tx)
          ? "internal"
          : null
    if (reason && pinned.has(tx.id)) outOfFilter.set(tx.id, reason)
    else if (reason === "internal") {
      hiddenInternal += 1
      continue
    } else if (reason) continue
    rows.push(tx)
  }
  // A API já devolve do mais novo para o mais antigo; o sort estável só garante.
  rows.sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1))
  return { rows, hiddenInternal, outOfFilter }
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
  /** Saldo do dia: os dias nunca são cortados na paginação, então bate com as linhas mostradas. */
  net: Cents
  items: Transaction[]
}

/**
 * Quantas linhas mostrar: `limit`, estendido até o fim do último dia, para
 * que nenhum dia fique pela metade (e o total do dia some o que está na tela).
 */
export function visibleCount(rows: Transaction[], limit: number): number {
  if (limit >= rows.length) return rows.length
  let end = Math.max(limit, 1)
  while (end < rows.length && rows[end].date === rows[end - 1].date) end += 1
  return end
}

/** Agrupa por dia (as linhas já vêm do mais novo para o mais antigo). */
export function groupByDay(rows: Transaction[]): DayGroup[] {
  const groups: DayGroup[] = []
  for (const tx of rows) {
    const last = groups.at(-1)
    if (last && last.date === tx.date) {
      last.items.push(tx)
      last.net += tx.amount
    } else groups.push({ date: tx.date, net: tx.amount, items: [tx] })
  }
  return groups
}

// --------------------------------------------------------------- categorias

export interface CategoryOption {
  value: string
  label: string
  /** Pagamento de fatura ou transferência entre contas próprias (regras de `@/lib/finance/classify`). */
  internal: InternalKind | null
}

function toOption(category: string | null): CategoryOption {
  return { value: category ?? NO_CATEGORY, label: categoryLabel(category), internal: internalKindOf(category) }
}

/**
 * Categorias presentes nos dados (mais as de `extra`), em ordem alfabética do
 * rótulo em português.
 */
export function categoryOptions(transactions: Transaction[], extra: Iterable<string | null> = []): CategoryOption[] {
  const byValue = new Map<string, CategoryOption>()
  const add = (category: string | null) => {
    const value = category ?? NO_CATEGORY
    if (!byValue.has(value)) byValue.set(value, toOption(category))
  }
  for (const tx of transactions) add(tx.category)
  for (const category of extra) add(category)
  return [...byValue.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
}

/**
 * Categorias que fazem sentido para um lançamento. As internas só onde podem
 * ocorrer: pagamento de fatura sai da conta (ou entra como crédito no cartão);
 * transferência para poupança só entre contas de dinheiro. A categoria atual
 * e a original sempre ficam na lista.
 *
 * "Sem categoria" só aparece quando é a original: a API guarda uma categoria
 * escolhida, e mandar `null` significa "voltar para a do banco".
 */
export function categoryOptionsFor(
  options: CategoryOption[],
  tx: Transaction,
  account: Pick<Account, "type"> | undefined,
): CategoryOption[] {
  const cash = account ? isCashAccount(account) : true
  return options.filter((option) => {
    const value = option.value === NO_CATEGORY ? null : option.value
    if (value === tx.category || value === tx.originalCategory) return true
    if (value === null) return false
    if (option.internal === null) return true
    if (option.internal === "card-payment") return cash ? tx.amount < 0 : tx.amount > 0
    return cash
  })
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

// --------------------------------------------------------------- sem dados

/** Por que a tela não tem nenhum lançamento (antes de qualquer filtro). */
export type NoDataReason = "no-accounts" | "not-synced"

/**
 * Sem lançamento nenhum, "nada corresponde aos filtros" seria mentira: ou não
 * há banco conectado, ou a sincronização ainda não trouxe lançamentos.
 */
export function noDataReason(transactionCount: number, accountCount: number): NoDataReason | null {
  if (transactionCount > 0) return null
  return accountCount === 0 ? "no-accounts" : "not-synced"
}
