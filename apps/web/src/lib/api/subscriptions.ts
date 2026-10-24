import type { Cents, IsoDate, PaymentMethod } from "./types"

/** Assinaturas: contratos de `/api/subscriptions` (módulo `subscriptions` da API). */

/** Cobrança recorrente detectada nas transações (assinatura, conta fixa ou variável). */
export interface Subscription {
  /** Chave estável da cobrança: identifica a assinatura nos ajustes. */
  key: string
  /** Nome escolhido pelo usuário ou, sem ele, a descrição do extrato. */
  name: string
  detectedName: string
  customName: string | null
  /** `PROMOTED` = o usuário marcou como assinatura. */
  source: "DETECTED" | "PROMOTED"
  counterpartyName: string | null
  category: string | null
  /** Todas as contas e cartões em que já caiu. */
  accounts: string[]
  /** Conta ou cartão da cobrança mais recente. */
  account: string
  /** Valor de cada cobrança: o preço atual (fixo) ou o típico (variável). */
  chargeAmount: Cents
  lastAmount: Cents
  /** O valor muda de um mês para o outro. */
  variable: boolean
  priceIncrease: { from: Cents; to: Cents; on: IsoDate } | null
  /** Meses entre cobranças: 1 = mensal, 3 = trimestral. */
  intervalMonths: number
  lastDate: IsoDate
  /** Próxima cobrança esperada, no dia de cobrança. */
  nextDate: IsoDate
  since: IsoDate
  /** Meses com cobrança no histórico. */
  months: number
  /** Quanto pesa por mês (uma trimestral de 300 = 100). */
  monthlyCost: Cents
  yearlyCost: Cents
  paymentMethod: PaymentMethod | null
  /** A cobrança mais recente caiu num cartão de crédito. */
  onCreditCard: boolean
  dayOfMonth: number
  /** Compromisso do planejamento com o mesmo nome, se já existe. */
  plannedCommitmentId: string | null
}

export interface SubscriptionsOverview {
  today: IsoDate
  /** Ativas (cobradas nos últimos 40 dias). */
  subscriptions: Subscription[]
  /** Recorrentes de valor variável (luz, água): dá para promover a assinatura. */
  others: Subscription[]
  /** Assinaturas sem cobrança recente. */
  stopped: Subscription[]
  /** Marcadas como "não é assinatura". */
  hidden: Subscription[]
  totals: { monthly: Cents; yearly: Cents; active: number }
}

/** Corpo de `PUT /api/subscriptions/preferences`: ausente = não muda; null = volta ao automático. */
export interface SubscriptionPreferenceInput {
  key: string
  kind?: "SUBSCRIPTION" | "IGNORED" | null
  name?: string | null
}
