import type { BudgetCategory, CategoryKind, Commitment, Goal, MonthProjection } from "@/lib/api/planning"
import type { Account, Cents, IsoDate, Transaction } from "@/lib/api/types"
import type { CategoryTotal } from "@/lib/finance/aggregate"
import { isSpending } from "@/lib/finance/classify"
import { categoryLabel } from "@/lib/format/category"

/**
 * Regras de montagem do planejamento (funções puras, sem relógio): tudo
 * recebe `today` explicitamente.
 */

/** "1 meta" / "2 metas". */
export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

/** "Janeiro" a partir de "janeiro". */
export function capitalize(value: string): string {
  return value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1)
}

const monthNameFormat = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" })

/** `YYYY-MM` → "novembro". */
export function monthName(month: string): string {
  return monthNameFormat.format(new Date(`${month}-01T12:00:00Z`))
}

/** "nov, fev, mar e abr". */
export function listJoin(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`
}

/** `YYYY-MM` deslocado `offset` meses para a frente (conclusão prevista das metas). */
export function shiftMonth(month: string, offset: number): string {
  const [year, m] = month.split("-").map(Number)
  const index = year * 12 + (m - 1) + offset
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`
}

/** Meses de `from` até `to` (`YYYY-MM`); negativo se `to` vem antes. */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number)
  const [ty, tm] = to.split("-").map(Number)
  return ty * 12 + tm - (fy * 12 + fm)
}

// ------------------------------------------------------------ compromissos

export function sortCommitments(commitments: Commitment[]): Commitment[] {
  return [...commitments].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "pt-BR"))
}

export function commitmentsTotal(commitments: Commitment[]): Cents {
  return commitments.reduce((sum, c) => sum + c.amount, 0)
}

// ------------------------------------------------------------------- metas

export interface GoalProgress {
  id: string
  name: string
  target: Cents
  saved: Cents
  remaining: Cents
  /** 0–1 */
  share: number
  monthlyContribution: Cents
  /** `YYYY-MM` do prazo. */
  targetMonth: string
  /** `YYYY-MM` em que a meta fecha no ritmo atual; null sem aporte. */
  projectedMonth: string | null
  /** Meses de atraso em relação ao prazo (0 = no prazo). null sem aporte. */
  delayMonths: number | null
  /** Aporte mensal que fecha a meta no prazo; null se já está no prazo ou o prazo passou. */
  requiredMonthly: Cents | null
  done: boolean
  /** Nome da conta onde o dinheiro está guardado. */
  accountName: string | null
}

/**
 * Conclusão prevista = mês de hoje + ⌈falta / aporte mensal⌉ meses,
 * comparada ao mês do prazo.
 */
export function goalProgress(goal: Goal, today: IsoDate, accounts: Account[]): GoalProgress {
  const currentMonth = today.slice(0, 7)
  const targetMonth = goal.targetDate.slice(0, 7)
  const remaining = Math.max(0, goal.target - goal.saved)
  const done = remaining === 0
  const months = done ? 0 : goal.monthlyContribution > 0 ? Math.ceil(remaining / goal.monthlyContribution) : null
  const projectedMonth = months === null ? null : shiftMonth(currentMonth, months)
  const delayMonths = projectedMonth === null ? null : Math.max(0, monthsBetween(targetMonth, projectedMonth))
  const monthsLeft = monthsBetween(currentMonth, targetMonth)
  const late = delayMonths === null || delayMonths > 0
  const requiredMonthly = !done && late && monthsLeft > 0 ? Math.ceil(remaining / monthsLeft) : null
  const account = goal.accountId ? accounts.find((a) => a.id === goal.accountId) : undefined

  return {
    id: goal.id,
    name: goal.name,
    target: goal.target,
    saved: goal.saved,
    remaining,
    share: goal.target > 0 ? Math.min(1, goal.saved / goal.target) : 0,
    monthlyContribution: goal.monthlyContribution,
    targetMonth,
    projectedMonth,
    delayMonths,
    requiredMonthly,
    done,
    accountName: account ? account.name : null,
  }
}

// --------------------------------------------------------------- orçamento

export interface BudgetRow {
  id: string
  name: string
  kind: CategoryKind
  actual: Cents
  budget: Cents | null
  /** Gasto ÷ orçamento; null sem orçamento. */
  ratio: number | null
  /** Quanto passou do orçamento (0 se dentro). */
  over: Cents
  /** Categorias do agregador que têm gasto no mês, em pt-BR. */
  sources: string[]
}

/** Gasto do mês por categoria do orçamento (soma das categorias do agregador que caem nela). */
export function budgetRows(categories: BudgetCategory[], spending: CategoryTotal[]): BudgetRow[] {
  return categories.map((category) => {
    const matched = spending.filter((row) => row.category !== null && category.sourceCategories.includes(row.category))
    const actual = matched.reduce((sum, row) => sum + row.total, 0)
    const budget = category.monthlyBudget
    return {
      id: category.id,
      name: category.name,
      kind: category.kind,
      actual,
      budget,
      ratio: budget && budget > 0 ? actual / budget : null,
      over: budget !== null ? Math.max(0, actual - budget) : 0,
      sources: matched.map((row) => row.label),
    }
  })
}

/** Gasto do mês que não cai em nenhuma categoria do orçamento. */
export function unbudgetedSpending(categories: BudgetCategory[], spending: CategoryTotal[]): CategoryTotal[] {
  const mapped = new Set(categories.flatMap((c) => c.sourceCategories))
  return spending.filter((row) => row.category === null || !mapped.has(row.category))
}

/**
 * Aviso de contas cujas transações só foram sincronizadas até antes de
 * `until` (o gasto delas depois disso fica de fora do mês). null se nenhuma.
 */
export function staleSyncNote(
  accounts: Account[],
  until: IsoDate,
  formatDate: (date: IsoDate) => string,
): string | null {
  const stale = accounts.flatMap((account) =>
    account.transactionsSyncedThrough !== null && account.transactionsSyncedThrough < until
      ? [{ account, syncedThrough: account.transactionsSyncedThrough }]
      : [],
  )
  if (stale.length === 0) return null
  const names = stale.map(({ account }) => `${account.name} (${account.institutionName})`).join(", ")
  const oldest = stale.map(({ syncedThrough }) => syncedThrough).sort()[0]
  const verb = stale.length === 1 ? "sincronizada" : "sincronizadas"
  return `${names} ${verb} só até ${formatDate(oldest)}; o que foi gasto depois não aparece aqui.`
}

export const KIND_LABEL: Record<CategoryKind, string> = {
  ESSENTIAL: "Essenciais",
  DISCRETIONARY: "Não essenciais",
}

export interface BudgetGroup {
  kind: CategoryKind
  label: string
  rows: BudgetRow[]
  actual: Cents
  budget: Cents
}

export function groupBudget(rows: BudgetRow[]): BudgetGroup[] {
  return (["ESSENTIAL", "DISCRETIONARY"] as const)
    .map((kind) => {
      const groupRows = rows.filter((row) => row.kind === kind)
      return {
        kind,
        label: KIND_LABEL[kind],
        rows: groupRows,
        actual: groupRows.reduce((sum, row) => sum + row.actual, 0),
        budget: groupRows.reduce((sum, row) => sum + (row.budget ?? 0), 0),
      }
    })
    .filter((group) => group.rows.length > 0)
}

/**
 * Escala comum das barras em "fração do orçamento": o marcador de 100% fica
 * na mesma posição em todas as linhas. Vai de 125% até o maior estouro
 * (arredondado para 25%), com teto de 300%.
 */
export function budgetScaleMax(rows: BudgetRow[]): number {
  const maxRatio = Math.max(0, ...rows.map((row) => row.ratio ?? 0))
  return Math.min(3, Math.max(1.25, Math.ceil(maxRatio * 4) / 4))
}

// ---------------------------------------------------------------- projeção

/** Linha da projeção com o rótulo do mês já resolvido (dados serializáveis para o gráfico). */
export interface ProjectionRow extends MonthProjection {
  /** "nov/26", "dez", "jan/27" — com ano no primeiro mês e na virada. */
  tick: string
  /** "novembro de 2026" */
  label: string
}

/** Frase única sobre o pior mês no vermelho (null se nenhum fica negativo). */
export function projectionCallout(
  projections: MonthProjection[],
  formatMonthName: (month: string) => string,
  formatMoney: (cents: Cents) => string,
): string | null {
  const worst = projections.reduce<MonthProjection | null>(
    (min, row) => (row.projectedBalance < 0 && (!min || row.projectedBalance < min.projectedBalance) ? row : min),
    null,
  )
  if (!worst) return null

  const negatives = projections.filter((row) => row.projectedBalance < 0).length
  const baseVariable = Math.min(...projections.map((row) => row.expectedVariableSpending))
  const baseIncome = Math.min(...projections.map((row) => row.expectedIncome))
  const extra = worst.expectedVariableSpending - baseVariable
  const index = projections.indexOf(worst)
  const previous = index > 0 ? projections[index - 1] : null
  const deficit = -worst.projectedBalance

  const name = formatMonthName(worst.month)
  const negativeValues = new Set(projections.filter((row) => row.projectedBalance < 0).map((row) => row.projectedBalance))
  // Todos os meses no vermelho com o mesmo valor: não há "pior mês" para apontar.
  if (negatives === projections.length && negatives > 1 && negativeValues.size === 1) {
    return `Os ${negatives} meses fecham no vermelho, com ${formatMoney(worst.projectedBalance)} cada: a renda média não cobre compromissos, metas e gasto variável.`
  }
  let sentence =
    negatives > 1
      ? `${negatives} meses fecham no vermelho; o pior é ${name}, com ${formatMoney(worst.projectedBalance)}`
      : `${capitalize(name)} fecha em ${formatMoney(worst.projectedBalance)}`

  if (extra > 0) {
    const seasonal = worst.month.endsWith("-01") ? "pelos gastos sazonais do início do ano" : "por gastos sazonais"
    sentence += ` ${seasonal}, que somam ${formatMoney(extra)} ao gasto variável`
  }
  if (previous && previous.projectedBalance >= deficit) {
    const bonus = previous.month.endsWith("-12") && previous.expectedIncome > baseIncome ? ", que tem o 13º," : ""
    sentence += `; guardar ${formatMoney(deficit)} da sobra de ${formatMonthName(previous.month)}${bonus} cobre a diferença`
  }
  return `${sentence}.`
}

/**
 * Nota sobre os meses de sobra positiva mas abaixo da margem (no gráfico as
 * barras deles quase somem). null se há menos de dois meses assim.
 */
export function thinMarginNote(
  rows: ProjectionRow[],
  margin: Cents,
  formatMoney: (cents: Cents) => string,
): string | null {
  const thin = rows.filter((row) => row.projectedBalance >= 0 && row.projectedBalance < margin)
  if (thin.length < 2) return null
  const months = listJoin(thin.map((row) => monthName(row.month)))
  const values = thin.map((row) => row.projectedBalance)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const amount = min === max ? `é de só ${formatMoney(min)} por mês` : `fica entre ${formatMoney(min)} e ${formatMoney(max)}`
  return `Em ${months} a sobra prevista ${amount}, margem apertada para imprevistos.`
}

/**
 * Histórico que a projeção da API usa: a média dos 3 últimos meses fechados
 * (renda e gasto somados e divididos por 3, mesmo que um mês esteja vazio).
 *
 * - `none`: nenhum desses meses tem transações (usuário novo ou sem sincronizar).
 * - `partial`: só parte deles tem; a média fica abaixo do real.
 */
export type HistoryState = { kind: "none" } | { kind: "partial"; months: string[] } | { kind: "full" }

export function historyState(transactions: Pick<Transaction, "date">[], closedMonths: string[]): HistoryState {
  const seen = new Set(transactions.map((tx) => tx.date.slice(0, 7)))
  const months = closedMonths.filter((month) => seen.has(month))
  if (months.length === 0) return { kind: "none" }
  if (months.length < closedMonths.length) return { kind: "partial", months }
  return { kind: "full" }
}

/** Aviso da projeção com histórico incompleto (null se completo ou vazio). */
export function partialHistoryNote(state: HistoryState, total: number): string | null {
  if (state.kind !== "partial") return null
  const names = listJoin(state.months.map(monthName))
  const verb = state.months.length === 1 ? "tem" : "têm"
  return `Dos ${total} últimos meses fechados, só ${names} ${verb} transações: renda e gasto médios ficam abaixo do real até completar o histórico.`
}

/** Frase do cabeçalho da página. */
export function headerSummary(
  committed: Cents,
  commitmentCount: number,
  activeGoals: number,
  formatMoney: (cents: Cents) => string,
): string {
  if (commitmentCount === 0 && activeGoals === 0) {
    return "Cadastre compromissos fixos e metas para ver quanto sobra nos próximos meses."
  }
  const goals = activeGoals === 0 ? "nenhuma meta em andamento" : plural(activeGoals, "meta em andamento", "metas em andamento")
  const commitments = commitmentCount === 0 ? "Nenhum compromisso fixo" : `${formatMoney(committed)}/mês já comprometidos`
  return `${commitments} · ${goals}`
}

export interface SourceCategoryOption {
  /** Nome do agregador (o que a API guarda), ex.: "Groceries". */
  value: string
  /** Nome em pt-BR, ex.: "Mercado". */
  label: string
}

/**
 * Categorias do banco que podem entrar no orçamento: as que aparecem como
 * gasto nas transações carregadas mais as que alguma categoria já usa.
 */
export function sourceCategoryOptions(
  transactions: Transaction[],
  categories: Pick<BudgetCategory, "sourceCategories">[],
): SourceCategoryOption[] {
  const names = new Set<string>()
  for (const tx of transactions) if (tx.category && isSpending(tx)) names.add(tx.category)
  for (const category of categories) for (const name of category.sourceCategories) names.add(name)
  return [...names]
    .map((value) => ({ value, label: categoryLabel(value) }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
}
