import type { Account, Cents, IsoDate, Transaction } from "@/lib/api/types"
import { categoryLabel } from "@/lib/format/category"
import { isCashAccount, isIncome, isOwnTransfer, isSpending } from "./classify"

export interface MonthlyCashFlow {
  /** `YYYY-MM` */
  month: string
  inflow: Cents
  /** Valor positivo (quanto saiu). */
  outflow: Cents
  net: Cents
}

/** `YYYY-MM` dos últimos `count` meses terminando em `lastMonth`, do mais antigo ao mais novo. */
export function lastMonths(lastMonth: string, count: number): string[] {
  const [year, month] = lastMonth.split("-").map(Number)
  const end = year * 12 + (month - 1)
  return Array.from({ length: count }, (_, i) => {
    const index = end - (count - 1 - i)
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`
  })
}

/**
 * Entradas e saídas do caixa (contas corrente/poupança) por mês. O cartão
 * entra via pagamento da fatura; transferências entre contas próprias se anulam.
 */
export function monthlyCashFlow(
  transactions: Transaction[],
  accounts: Account[],
  months: string[],
): MonthlyCashFlow[] {
  const cashAccounts = new Set(accounts.filter(isCashAccount).map((a) => a.id))
  const byMonth = new Map(months.map((m) => [m, { month: m, inflow: 0, outflow: 0, net: 0 }]))
  for (const tx of transactions) {
    if (!cashAccounts.has(tx.accountId) || isOwnTransfer(tx)) continue
    const row = byMonth.get(tx.date.slice(0, 7))
    if (!row) continue
    if (tx.amount > 0) row.inflow += tx.amount
    else row.outflow -= tx.amount
  }
  return months.map((m) => {
    const row = byMonth.get(m)!
    return { ...row, net: row.inflow - row.outflow }
  })
}

export interface CategoryTotal {
  category: string | null
  label: string
  /** Valor positivo gasto no período. */
  total: Cents
  count: number
}

/** Gasto por categoria no período (cartão + contas, sem pagamento de fatura nem transferências). */
export function spendingByCategory(
  transactions: Transaction[],
  range: { from: IsoDate; to: IsoDate },
): CategoryTotal[] {
  const totals = new Map<string | null, CategoryTotal>()
  for (const tx of transactions) {
    if (!isSpending(tx) || tx.date < range.from || tx.date > range.to) continue
    const current = totals.get(tx.category) ?? {
      category: tx.category,
      label: categoryLabel(tx.category),
      total: 0,
      count: 0,
    }
    current.total -= tx.amount
    current.count += 1
    totals.set(tx.category, current)
  }
  return [...totals.values()].sort((a, b) => b.total - a.total)
}

export interface PeriodTotals {
  income: Cents
  spending: Cents
  net: Cents
}

/** Renda e gasto (sem dupla contagem) num período. */
export function periodTotals(
  transactions: Transaction[],
  range: { from: IsoDate; to: IsoDate },
): PeriodTotals {
  let income = 0
  let spending = 0
  for (const tx of transactions) {
    if (tx.date < range.from || tx.date > range.to) continue
    if (isIncome(tx)) income += tx.amount
    else if (isSpending(tx)) spending -= tx.amount
  }
  return { income, spending, net: income - spending }
}

/** Primeiro e último dia de um mês `YYYY-MM`. */
export function monthRange(month: string): { from: IsoDate; to: IsoDate } {
  const [year, m] = month.split("-").map(Number)
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` }
}

/** Soma de saldos das contas (sem cartão) — "quanto tenho". */
export function totalCash(accounts: Account[]): Cents {
  return accounts.filter(isCashAccount).reduce((sum, a) => sum + a.balance, 0)
}

/** Soma do que se deve nos cartões. */
export function totalCardDebt(accounts: Account[]): Cents {
  return accounts.filter((a) => a.type === "CREDIT_CARD").reduce((sum, a) => sum + a.balance, 0)
}
