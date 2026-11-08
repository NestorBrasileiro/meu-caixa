import type { SubscriptionPreferenceKind } from '../database/schema.js';
import { addDays } from '../domain/dates.js';
import type { Cents, IsoDate, PaymentMethod } from '../domain/finance.js';
import { dueDate, monthOf, shiftMonth } from '../domain/months.js';
import { recurrenceKey, type Recurrence } from '../insights/aggregate.js';

/** Sem cobrança há mais que isso: some de "pararam de cobrar" (mais, se a cobrança for espaçada). */
const STOPPED_WINDOW_DAYS = 180;
/** Ativa = a próxima cobrança esperada não atrasou mais que isso. */
const ACTIVE_GRACE_DAYS = 9;
/** Recorrente de valor variável só entra em "outras" com ~1 cobrança por mês... */
const OTHERS_MAX_PER_MONTH = 1.25;
/** ...em pelo menos estes meses (mercado e contas de consumo erram menos assim). */
const OTHERS_MIN_MONTHS = 3;
/** Aumento abaixo disso é arredondamento (IOF, câmbio de centavos). */
const PRICE_INCREASE_TOLERANCE = 0.01;
/**
 * Pagamento de fatura que o banco não categorizou como tal (a Pluggy já mandou
 * "Loans and financing"): se repete todo mês, mas nunca é assinatura.
 */
const CARD_BILL = /\bfatura\b/;

export interface SubscriptionPreference {
  key: string;
  kind: SubscriptionPreferenceKind | null;
  name: string | null;
}

/** Compromisso do planejamento ainda em vigor (os encerrados não contam como planejados). */
export interface PlannedCommitment {
  id: string;
  name: string;
  /** Assinatura de onde o compromisso foi criado ("Adicionar ao planejamento"). */
  subscriptionKey: string | null;
}

export interface Subscription {
  /** Chave estável da cobrança (`recurrenceKey`), usada nas preferências. */
  key: string;
  /** Nome escolhido pelo usuário ou, sem ele, a descrição do extrato. */
  name: string;
  detectedName: string;
  customName: string | null;
  /** `PROMOTED` = o usuário marcou como assinatura (o detector achava variável). */
  source: 'DETECTED' | 'PROMOTED';
  counterpartyName: string | null;
  category: string | null;
  /** Todas as contas e cartões em que já caiu. */
  accounts: string[];
  /** Conta ou cartão da cobrança mais recente. */
  account: string;
  /** Valor de cada cobrança: o preço atual (fixo) ou o típico (variável). */
  chargeAmount: Cents;
  lastAmount: Cents;
  /** O valor muda de uma cobrança para a outra (conta de consumo, cobrança em dólar). */
  variable: boolean;
  priceIncrease: { from: Cents; to: Cents; on: IsoDate } | null;
  /** Meses entre cobranças: 1 = mensal, 3 = trimestral. */
  intervalMonths: number;
  lastDate: IsoDate;
  /** Próxima cobrança esperada, no dia de cobrança (limitado ao fim do mês). */
  nextDate: IsoDate;
  since: IsoDate;
  /** Meses com cobrança no histórico. */
  months: number;
  /** Quanto pesa por mês (uma trimestral de 300 = 100). */
  monthlyCost: Cents;
  yearlyCost: Cents;
  paymentMethod: PaymentMethod | null;
  /** A cobrança mais recente caiu num cartão de crédito. */
  onCreditCard: boolean;
  dayOfMonth: number;
  /** Compromisso do planejamento em vigor para esta cobrança, se houver. */
  plannedCommitmentId: string | null;
}

export interface SubscriptionsOverview {
  /** Ativas: a próxima cobrança ainda não atrasou. */
  subscriptions: Subscription[];
  /** Recorrentes de valor variável, ~1 por mês, que o usuário pode promover. */
  others: Subscription[];
  /** Assinaturas sem cobrança recente: cancelamento confirmado (ou atraso). */
  stopped: Subscription[];
  /** Marcadas como "não é assinatura". */
  hidden: Subscription[];
  totals: { monthly: Cents; yearly: Cents; active: number };
}

/**
 * Separa as recorrências detectadas em assinaturas, outras cobranças,
 * assinaturas que pararam e ocultas, aplicando os ajustes do usuário.
 * Hábitos (várias vezes por mês) e parcelamentos ficam de fora, a não ser que
 * o usuário tenha marcado como assinatura.
 */
export function buildSubscriptions(
  recurrences: Recurrence[],
  preferences: SubscriptionPreference[],
  commitments: PlannedCommitment[],
  today: IsoDate,
): SubscriptionsOverview {
  const byKey = new Map(preferences.map((preference) => [preference.key, preference]));
  const planned = plannedIndex(commitments);

  const overview: SubscriptionsOverview = {
    subscriptions: [],
    others: [],
    stopped: [],
    hidden: [],
    totals: { monthly: 0, yearly: 0, active: 0 },
  };
  for (const recurrence of recurrences) {
    // A chave vem da contraparte quando há uma: olha também a descrição.
    if (CARD_BILL.test(recurrence.key) || CARD_BILL.test(normalizedName(recurrence.label) ?? '')) {
      continue;
    }
    const preference = byKey.get(recurrence.key);
    const promoted = preference?.kind === 'SUBSCRIPTION';
    const item = toSubscription(recurrence, preference, planned, promoted);
    // Ativa conforme o intervalo: uma trimestral sem cobrança há 60 dias está em dia.
    const active =
      recurrence.lastDate >= addDays(today, -(item.intervalMonths * 31 + ACTIVE_GRACE_DAYS));
    const stoppedSince = addDays(today, -Math.max(STOPPED_WINDOW_DAYS, item.intervalMonths * 62));
    // A média do detector é arredondada para exibição; o corte usa o valor exato.
    const perMonth = recurrence.occurrences / recurrence.monthsSeen.length;

    if (preference?.kind === 'IGNORED') {
      overview.hidden.push(item);
    } else if (promoted || recurrence.pattern === 'ASSINATURA_OU_CONTA_FIXA') {
      if (active) overview.subscriptions.push(item);
      else if (recurrence.lastDate >= stoppedSince) overview.stopped.push(item);
    } else if (
      recurrence.pattern === 'RECORRENTE_VARIAVEL' &&
      active &&
      perMonth <= OTHERS_MAX_PER_MONTH &&
      recurrence.monthsSeen.length >= OTHERS_MIN_MONTHS
    ) {
      overview.others.push(item);
    }
  }

  const byCost = (a: Subscription, b: Subscription) =>
    b.monthlyCost - a.monthlyCost || a.name.localeCompare(b.name, 'pt-BR');
  overview.subscriptions.sort(byCost);
  overview.others.sort(byCost);
  overview.stopped.sort((a, b) => b.lastDate.localeCompare(a.lastDate) || byCost(a, b));
  overview.hidden.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  const monthly = overview.subscriptions.reduce((sum, item) => sum + item.monthlyCost, 0);
  overview.totals = { monthly, yearly: monthly * 12, active: overview.subscriptions.length };
  return overview;
}

function toSubscription(
  recurrence: Recurrence,
  preference: SubscriptionPreference | undefined,
  planned: PlannedIndex,
  promoted: boolean,
): Subscription {
  const customName = preference?.name ?? null;
  const change = recurrence.priceChange;
  // Fixo: o preço atual (depois de um reajuste, o novo). Variável: o típico.
  const chargeAmount = recurrence.fixedPrice
    ? (change?.to ?? recurrence.lastAmount)
    : recurrence.typicalAmount;
  // Sem cadência (variável irregular): conta como mensal.
  const interval = recurrence.intervalMonths ?? 1;
  // Por mês com cobrança (fixo: preço × cobranças por mês; variável: a média
  // medida), dividido pelo intervalo: uma trimestral de 300 pesa 100 por mês.
  const perChargeMonth = recurrence.fixedPrice
    ? (chargeAmount * recurrence.occurrences) / recurrence.monthsSeen.length
    : recurrence.estimatedMonthlyCost;
  const monthlyCost = Math.round(perChargeMonth / interval);

  return {
    key: recurrence.key,
    name: customName ?? recurrence.label,
    detectedName: recurrence.label,
    customName,
    source: promoted && recurrence.pattern !== 'ASSINATURA_OU_CONTA_FIXA' ? 'PROMOTED' : 'DETECTED',
    counterpartyName: recurrence.counterpartyName,
    category: recurrence.category,
    accounts: recurrence.accounts,
    account: recurrence.account,
    chargeAmount,
    lastAmount: recurrence.lastAmount,
    variable: !recurrence.fixedPrice,
    priceIncrease:
      change && change.to > change.from * (1 + PRICE_INCREASE_TOLERANCE) ? { ...change } : null,
    intervalMonths: interval,
    lastDate: recurrence.lastDate,
    nextDate: dueDate(shiftMonth(monthOf(recurrence.lastDate), interval), recurrence.dayOfMonth),
    since: recurrence.firstDate,
    months: recurrence.monthsSeen.length,
    monthlyCost,
    yearlyCost: monthlyCost * 12,
    paymentMethod: recurrence.paymentMethod,
    onCreditCard: recurrence.onCreditCard,
    dayOfMonth: recurrence.dayOfMonth,
    plannedCommitmentId: planned.find(recurrence, customName),
  };
}

interface PlannedIndex {
  find(recurrence: Recurrence, customName: string | null): string | null;
}

/**
 * Compromisso de cada assinatura: primeiro o criado a partir dela (guarda a
 * chave, então sobrevive a renomear); senão, o de mesmo nome normalizado.
 */
function plannedIndex(commitments: PlannedCommitment[]): PlannedIndex {
  const byKey = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const commitment of commitments) {
    if (commitment.subscriptionKey && !byKey.has(commitment.subscriptionKey)) {
      byKey.set(commitment.subscriptionKey, commitment.id);
    }
    const name = normalizedName(commitment.name);
    if (name && !byName.has(name)) byName.set(name, commitment.id);
  }
  return {
    find(recurrence, customName) {
      const names = [recurrence.key, customName, recurrence.label].map((name) =>
        name === null ? null : normalizedName(name),
      );
      return (
        byKey.get(recurrence.key) ??
        names.map((name) => (name ? byName.get(name) : undefined)).find(Boolean) ??
        null
      );
    },
  };
}

/** Mesma normalização das chaves de recorrência ("Netflix 10/2026" = "netflix"). */
function normalizedName(name: string): string | null {
  return recurrenceKey({ counterpartyName: null, description: name });
}
