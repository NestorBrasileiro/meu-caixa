import { dueDate, shift } from "@/components/planning/schedule"
import type { Subscription, SubscriptionsOverview } from "@/lib/api/subscriptions"
import type { Cents, PaymentMethod, Transaction } from "@/lib/api/types"
import { isSpending } from "@/lib/finance/classify"
import { addDays, MOCK_TODAY, type MockDataset } from "./generator"
import { COMMITMENTS } from "./planning"

// Mesmas constantes da API (`apps/api/src/insights/aggregate.ts` e `src/subscriptions/subscriptions.ts`).
const STABLE_TOLERANCE = 0.15
const PLATEAU_TOLERANCE = 0.02
const PRICE_INCREASE_TOLERANCE = 0.01
const ACTIVE_GRACE_DAYS = 9
const STOPPED_WINDOW_DAYS = 180
const OTHERS_MAX_PER_MONTH = 1.25
const OTHERS_MIN_MONTHS = 3
const CARD_BILL = /\bfatura\b/
const BILLING_INTERVALS = [1, 2, 3, 6, 12]

/**
 * Assinaturas do dataset fictício com as regras da API (`detectRecurrences` +
 * `buildSubscriptions`), sem os ajustes salvos (o modo mock é só leitura):
 * mesma origem em 2+ meses; preço fixo (estável ou com um reajuste) ~1x por
 * mês = assinatura; variável ~1x por mês em 3+ meses = "outras"; hábitos,
 * parcelas e pagamentos de fatura ficam de fora.
 */
export function buildSubscriptions(dataset: MockDataset): SubscriptionsOverview {
  const accountsById = new Map(dataset.accounts.map((account) => [account.id, account]))
  const plannedByName = new Map(COMMITMENTS.map((commitment) => [keyOf(commitment.name), commitment.id]))
  const groups = new Map<string, Transaction[]>()
  for (const tx of dataset.transactions) {
    if (!isSpending(tx)) continue
    const key = keyOf(tx.counterpartyName?.trim() || tx.description)
    if (!key) continue
    groups.set(key, [...(groups.get(key) ?? []), tx])
  }

  const overview: SubscriptionsOverview = {
    today: MOCK_TODAY,
    subscriptions: [],
    others: [],
    stopped: [],
    hidden: [],
    totals: { monthly: 0, yearly: 0, active: 0 },
  }
  const currentMonth = MOCK_TODAY.slice(0, 7)
  for (const [key, group] of groups) {
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date))
    const last = sorted[sorted.length - 1]
    if (CARD_BILL.test(key) || CARD_BILL.test(keyOf(last.description) ?? "")) continue
    if (last.installment) continue
    const months = [...new Set(sorted.map((tx) => tx.date.slice(0, 7)))]
    const perMonth = sorted.length / months.length
    if (months.length < 2 || perMonth >= 2) continue

    const amounts = sorted.map((tx) => -tx.amount)
    const typical = median(amounts)
    const stable = amounts.every((value) => Math.abs(value - typical) <= Math.max(1, typical * STABLE_TOLERANCE))
    const step = priceStep(sorted)
    const fixedPrice = stable || step !== null
    const cadence = billingInterval(months)
    const subscription = fixedPrice && perMonth <= OTHERS_MAX_PER_MONTH && cadence !== null
    // Sem cadência (variável irregular): conta como mensal.
    const intervalMonths = cadence ?? 1
    const chargeAmount = fixedPrice ? (step?.to ?? -last.amount) : typical
    const closed = sorted.filter((tx) => !tx.date.startsWith(currentMonth))
    const closedMonths = new Set(closed.map((tx) => tx.date.slice(0, 7))).size
    const average =
      closedMonths > 0 ? Math.round(closed.reduce((sum, tx) => sum - tx.amount, 0) / closedMonths) : typical
    const perChargeMonth = fixedPrice ? chargeAmount * perMonth : average
    const monthlyCost = Math.round(perChargeMonth / intervalMonths)
    const dayOfMonth = billingDay(sorted)
    const account = accountsById.get(last.accountId)

    const item: Subscription = {
      key,
      name: last.description,
      detectedName: last.description,
      customName: null,
      source: "DETECTED",
      counterpartyName: last.counterpartyName,
      category: mostCommon(sorted.map((tx) => tx.category)),
      accounts: [...new Set(sorted.map((tx) => accountsById.get(tx.accountId)?.name ?? ""))].filter(Boolean),
      account: account?.name ?? "",
      chargeAmount,
      lastAmount: -last.amount,
      variable: !fixedPrice,
      priceIncrease: step && step.to > step.from * (1 + PRICE_INCREASE_TOLERANCE) ? step : null,
      intervalMonths,
      lastDate: last.date,
      nextDate: dueDate(shift(last.date.slice(0, 7), intervalMonths), dayOfMonth),
      since: sorted[0].date,
      months: months.length,
      monthlyCost,
      yearlyCost: monthlyCost * 12,
      paymentMethod: last.paymentMethod ?? mostCommonKnown(sorted.map((tx) => tx.paymentMethod)),
      onCreditCard: account?.type === "CREDIT_CARD",
      dayOfMonth,
      plannedCommitmentId: plannedByName.get(key) ?? plannedByName.get(keyOf(last.description) ?? "") ?? null,
    }

    const active = last.date >= addDays(MOCK_TODAY, -(intervalMonths * 31 + ACTIVE_GRACE_DAYS))
    const stoppedSince = addDays(MOCK_TODAY, -Math.max(STOPPED_WINDOW_DAYS, intervalMonths * 62))
    if (subscription) {
      if (active) overview.subscriptions.push(item)
      else if (last.date >= stoppedSince) overview.stopped.push(item)
    } else if (active && perMonth <= OTHERS_MAX_PER_MONTH && months.length >= OTHERS_MIN_MONTHS) {
      overview.others.push(item)
    }
  }

  const byCost = (a: Subscription, b: Subscription) => b.monthlyCost - a.monthlyCost || a.name.localeCompare(b.name)
  overview.subscriptions.sort(byCost)
  overview.others.sort(byCost)
  overview.stopped.sort((a, b) => b.lastDate.localeCompare(a.lastDate) || byCost(a, b))
  const monthly = overview.subscriptions.reduce((sum, item) => sum + item.monthlyCost, 0)
  overview.totals = { monthly, yearly: monthly * 12, active: overview.subscriptions.length }
  return overview
}

/** Reajuste: as últimas cobranças num valor e todas as anteriores (2+) noutro, cada grupo dentro de ±2%. */
function priceStep(sorted: Transaction[]): Subscription["priceIncrease"] {
  const amounts = sorted.map((tx) => -tx.amount)
  const near = (value: Cents, reference: Cents) => Math.abs(value - reference) <= Math.max(1, reference * PLATEAU_TOLERANCE)
  const latest = amounts[amounts.length - 1]
  let start = amounts.length - 1
  while (start > 0 && near(amounts[start - 1], latest)) start--
  const before = amounts.slice(0, start)
  if (before.length < 2) return null
  const previous = median(before)
  if (!before.every((value) => near(value, previous))) return null
  return { from: previous, to: median(amounts.slice(start)), on: sorted[start].date }
}

/** O dia 31 cobrado em 28/02 continua sendo 31. */
function billingDay(sorted: Transaction[]): number {
  const lastDate = sorted[sorted.length - 1].date
  const day = Number(lastDate.slice(8, 10))
  if (day < Number(dueDate(lastDate.slice(0, 7), 31).slice(8, 10))) return day
  return Math.max(...sorted.slice(-3).map((tx) => Number(tx.date.slice(8, 10))))
}

/** Cadência pela mediana dos intervalos; espaçada precisa de 3 meses com cobrança. */
function billingInterval(months: string[]): number | null {
  if (months.length < 2) return null
  const gaps = months.slice(1).map((month, i) => monthsBetween(months[i], month))
  const interval = Math.round(median(gaps))
  if (!BILLING_INTERVALS.includes(interval)) return null
  if (interval > 1 && months.length < 3) return null
  if (interval > 1 && gaps.some((gap) => Math.abs(gap - interval) > 1)) return null
  return interval
}

function monthsBetween(from: string, to: string): number {
  const index = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7))
  return index(to) - index(from)
}

/** Mesma normalização de `recurrenceKey` na API: sem acentos, números e pontuação. */
function keyOf(source: string): string | null {
  const key = source
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\bparc(ela)?\b/g, " ")
    .replace(/[0-9]+/g, " ")
    .replace(/[^a-z]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
  return key.length >= 2 ? key : null
}

function median(values: Cents[]): Cents {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

function mostCommon<T>(values: T[]): T {
  const counts = new Map<T, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  let best = values[values.length - 1]
  for (const [value, count] of counts) if (count > (counts.get(best) ?? 0)) best = value
  return best
}

function mostCommonKnown(values: (PaymentMethod | null)[]): PaymentMethod | null {
  const known = values.filter((value): value is PaymentMethod => value !== null)
  return known.length > 0 ? mostCommon(known) : null
}
