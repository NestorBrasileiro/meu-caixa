import type { Cents, IsoDate, PaymentMethod } from "./types"

/** Planejamento: contratos de `GET /api/planning` (módulo `planning` da API). */

/** Como a categoria entra no orçamento. */
export type CategoryKind = "ESSENTIAL" | "DISCRETIONARY"

export interface BudgetCategory {
  id: string
  name: string
  kind: CategoryKind
  /** Categorias do agregador que caem aqui. */
  sourceCategories: string[]
  monthlyBudget: Cents | null
}

/** Compromisso fixo recorrente (ex.: parcela do terreno). */
export interface Commitment {
  id: string
  name: string
  amount: Cents
  dayOfMonth: number
  /** Como é pago. "CARD" = cai na fatura do cartão (não somar de novo ao pagar a fatura). */
  paymentMethod: PaymentMethod
  /** null = sem categoria de orçamento (ou a categoria foi apagada). */
  categoryId: string | null
  startsOn: IsoDate
  /** null = sem data para acabar. */
  endsOn: IsoDate | null
  /** Para financiamentos/parcelados: quantas já foram pagas de quantas. */
  installments: { paid: number; total: number } | null
  notes: string | null
}

/** Meta de economia (ex.: entrada do carro). */
export interface Goal {
  id: string
  name: string
  target: Cents
  saved: Cents
  targetDate: IsoDate
  monthlyContribution: Cents
  /** Conta onde o dinheiro está sendo guardado. */
  accountId: string | null
}

/** Projeção mensal: renda esperada menos compromissos, metas e gasto variável médio. */
export interface MonthProjection {
  /** `YYYY-MM` */
  month: string
  expectedIncome: Cents
  commitments: Cents
  goalContributions: Cents
  expectedVariableSpending: Cents
  /** Sobra (ou falta) prevista no mês. */
  projectedBalance: Cents
}

export interface PlanningOverview {
  categories: BudgetCategory[]
  commitments: Commitment[]
  goals: Goal[]
  projections: MonthProjection[]
}
