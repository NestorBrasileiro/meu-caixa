import { formatMoneyInput, type CommitmentForm } from "@/components/planning/forms"
import { plural } from "@/components/planning/model"
import type { Subscription, SubscriptionsOverview } from "@/lib/api/subscriptions"
import type { IsoDate } from "@/lib/api/types"
import { formatDateShort } from "@/lib/format/date"
import { formatMoney } from "@/lib/format/money"

/** Em que lista a cobrança está: define as ações oferecidas e a data mostrada. */
export type SubscriptionSection = "active" | "other" | "stopped" | "hidden"

/** "No cartão Nubank" / "Conta Itaú": onde cai a cobrança hoje (a mais recente). */
export function chargedOn(subscription: Subscription): string {
  if (subscription.onCreditCard) return subscription.account ? `No cartão ${subscription.account}` : "No cartão"
  return subscription.account || "Conta"
}

/** "R$ 300,00 a cada 3 meses"; null na mensal (o valor por mês já diz tudo). */
export function intervalLabel(subscription: Subscription): string | null {
  if (subscription.intervalMonths <= 1) return null
  return `${formatMoney(subscription.chargeAmount)} a cada ${subscription.intervalMonths} meses`
}

/** "Próxima em 1 de nov." ou, se já devia ter sido cobrada, "Esperada desde 1 de nov.". */
export function nextChargeLabel(subscription: Subscription, today: IsoDate): string {
  return subscription.nextDate < today
    ? `Esperada desde ${formatDateShort(subscription.nextDate)}`
    : `Próxima em ${formatDateShort(subscription.nextDate)}`
}

/** "Subiu de R$ 21,90 para R$ 23,90 em 3 de out." */
export function priceIncreaseLabel(subscription: Subscription): string | null {
  const increase = subscription.priceIncrease
  if (!increase) return null
  return `Subiu de ${formatMoney(increase.from)} para ${formatMoney(increase.to)} em ${formatDateShort(increase.on)}`
}

/** Linha do cabeçalho: "8 assinaturas · R$ 2.764,30 por mês · R$ 33.171,60 por ano". */
export function headerSummary(overview: SubscriptionsOverview): string {
  if (overview.totals.active === 0) return "Cobranças que se repetem todo mês nos seus bancos e cartões."
  return [
    plural(overview.totals.active, "assinatura ativa", "assinaturas ativas"),
    `${formatMoney(overview.totals.monthly)} por mês`,
    `${formatMoney(overview.totals.yearly)} por ano`,
  ].join(" · ")
}

export function recentIncreases(overview: SubscriptionsOverview): Subscription[] {
  return overview.subscriptions.filter((subscription) => subscription.priceIncrease !== null)
}

/**
 * Compromisso do planejamento já preenchido a partir da assinatura. O
 * planejamento é mensal: cobrança espaçada entra pelo valor por mês, com a
 * observação de como ela cobra de verdade.
 */
export function commitmentDraft(subscription: Subscription, today: IsoDate): Partial<CommitmentForm> {
  const interval = intervalLabel(subscription)
  return {
    name: subscription.name,
    amount: formatMoneyInput(subscription.monthlyCost),
    dayOfMonth: String(subscription.dayOfMonth),
    paymentMethod: subscription.onCreditCard ? "CARD" : (subscription.paymentMethod ?? "OTHER"),
    startsOn: today,
    ...(interval ? { notes: `Cobra ${interval}; aqui, o valor por mês.` } : {}),
  }
}
