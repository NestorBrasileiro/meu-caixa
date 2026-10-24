import { isCardPayment, isIncome, isOwnTransfer, isSpending } from '../domain/classify.js';
import { addDays } from '../domain/dates.js';
import type { AccountType, Cents, Installment, IsoDate, PaymentMethod } from '../domain/finance.js';
import { lastDayOf, monthOf, monthsBetween, shiftMonth, type IsoMonth } from '../domain/months.js';

/**
 * Agregações puras usadas pelas ferramentas de análise (MCP e, depois, a API
 * da Anthropic). Mesmas regras do resto do app: pagamento de fatura e
 * transferência entre contas próprias não são renda nem gasto.
 */

/** Transação já com a categoria efetiva (a do usuário, se houver) e a conta. */
export interface AnalyzedTransaction {
  id: string;
  date: IsoDate;
  description: string;
  counterpartyName: string | null;
  amount: Cents;
  /** Categoria efetiva: a escolhida pelo usuário ou, sem escolha, a do agregador. */
  category: string | null;
  installment: Installment | null;
  accountId: string;
  accountName: string;
  accountType: AccountType;
  paymentMethod?: PaymentMethod | null;
}

export type TransactionKind =
  'GASTO' | 'RECEITA' | 'PAGAMENTO_FATURA' | 'TRANSFERENCIA_PROPRIA' | 'NEUTRA';

export function kindOf(tx: Pick<AnalyzedTransaction, 'amount' | 'category'>): TransactionKind {
  if (isCardPayment(tx)) return 'PAGAMENTO_FATURA';
  if (isOwnTransfer(tx)) return 'TRANSFERENCIA_PROPRIA';
  if (isSpending(tx)) return 'GASTO';
  if (isIncome(tx)) return 'RECEITA';
  return 'NEUTRA';
}

/** Meses (`YYYY-MM`) de `from` a `to`, inclusive, do mais antigo ao mais novo. */
export function monthsInRange(from: IsoDate, to: IsoDate): IsoMonth[] {
  const first = monthOf(from);
  const count = monthsBetween(first, monthOf(to)) + 1;
  return Array.from({ length: Math.max(0, count) }, (_, i) => shiftMonth(first, i));
}

export interface MonthTotals {
  month: IsoMonth;
  income: Cents;
  /** Valor positivo (quanto foi gasto). */
  spending: Cents;
  net: Cents;
  /** Fora da conta de gasto: pagamentos de fatura (valor positivo). */
  cardPayments: Cents;
  /** Fora da conta de gasto e renda: saídas para contas próprias (valor positivo). */
  ownTransfersOut: Cents;
}

/** Renda, gasto e resultado por mês (cada real gasto conta uma vez). */
export function monthlyTotals(txs: AnalyzedTransaction[], months: IsoMonth[]): MonthTotals[] {
  const byMonth = new Map(
    months.map((month) => [
      month,
      { month, income: 0, spending: 0, net: 0, cardPayments: 0, ownTransfersOut: 0 },
    ]),
  );
  for (const tx of txs) {
    const row = byMonth.get(monthOf(tx.date));
    if (!row) continue;
    switch (kindOf(tx)) {
      case 'RECEITA':
        row.income += tx.amount;
        break;
      case 'GASTO':
        row.spending -= tx.amount;
        break;
      case 'PAGAMENTO_FATURA':
        if (tx.amount < 0) row.cardPayments -= tx.amount;
        break;
      case 'TRANSFERENCIA_PROPRIA':
        if (tx.amount < 0) row.ownTransfersOut -= tx.amount;
        break;
    }
  }
  return months.map((month) => {
    const row = byMonth.get(month)!;
    return { ...row, net: row.income - row.spending };
  });
}

export interface CategorySpending {
  category: string | null;
  /** Valor positivo gasto no período. */
  total: Cents;
  count: number;
  byMonth: { month: IsoMonth; total: Cents }[];
}

/** Gasto por categoria efetiva, do maior para o menor, com o total de cada mês. */
export function spendingByCategory(
  txs: AnalyzedTransaction[],
  months: IsoMonth[],
): CategorySpending[] {
  const totals = new Map<string | null, CategorySpending & { perMonth: Map<IsoMonth, Cents> }>();
  const monthSet = new Set(months);
  for (const tx of txs) {
    const month = monthOf(tx.date);
    if (!monthSet.has(month) || kindOf(tx) !== 'GASTO') continue;
    let entry = totals.get(tx.category);
    if (!entry) {
      entry = { category: tx.category, total: 0, count: 0, byMonth: [], perMonth: new Map() };
      totals.set(tx.category, entry);
    }
    entry.total -= tx.amount;
    entry.count += 1;
    entry.perMonth.set(month, (entry.perMonth.get(month) ?? 0) - tx.amount);
  }
  return [...totals.values()]
    .map(({ perMonth, ...entry }) => ({
      ...entry,
      byMonth: months.map((month) => ({ month, total: perMonth.get(month) ?? 0 })),
    }))
    .sort((a, b) => b.total - a.total || String(a.category).localeCompare(String(b.category)));
}

// ------------------------------------------------------------- recorrências

/**
 * Chave de agrupamento de cobranças da mesma origem: contraparte (ou, sem ela,
 * a descrição) sem acentos, números, datas e marcas de parcela. "NETFLIX.COM
 * 10/2026" e "Netflix.com 11/2026" viram a mesma chave.
 */
export function recurrenceKey(tx: Pick<AnalyzedTransaction, 'counterpartyName' | 'description'>) {
  const source = tx.counterpartyName?.trim() || tx.description;
  const key = source
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\bparc(ela)?\b/g, ' ')
    .replace(/[0-9]+/g, ' ')
    .replace(/[^a-z]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  return key.length >= 2 ? key : null;
}

export type RecurrencePattern =
  /** Uma cobrança por mês com valor estável: assinatura, plano, conta fixa. */
  | 'ASSINATURA_OU_CONTA_FIXA'
  /** Várias vezes por mês (delivery, corrida de app): hábito. */
  | 'HABITO_FREQUENTE'
  /** Compra parcelada: tem fim. */
  | 'PARCELAMENTO'
  /** Todo mês, mas com valor variável (mercado, conta de consumo). */
  | 'RECORRENTE_VARIAVEL';

export interface Recurrence {
  key: string;
  /** Descrição mais recente, como aparece no extrato. */
  label: string;
  counterpartyName: string | null;
  category: string | null;
  pattern: RecurrencePattern;
  occurrences: number;
  monthsSeen: IsoMonth[];
  averagePerMonth: number;
  /** Mediana das cobranças (valor positivo). */
  typicalAmount: Cents;
  minAmount: Cents;
  maxAmount: Cents;
  lastAmount: Cents;
  /** Valores dentro de ±15% da mediana. */
  stableAmount: boolean;
  /**
   * Preço que mudou num degrau (ex.: 39,90 por meses e depois 55,90): todas as
   * cobranças antigas num valor e as recentes noutro. null sem mudança.
   */
  priceChange: { from: Cents; to: Cents; on: IsoDate } | null;
  /** Preço fixo: estável ou com um degrau (assinatura que reajustou). */
  fixedPrice: boolean;
  /**
   * Meses entre uma cobrança e a seguinte (1 = mensal, 3 = trimestral, até 12);
   * null quando não há cadência reconhecível (ex.: duas compras a 10 meses).
   */
  intervalMonths: number | null;
  firstDate: IsoDate;
  lastDate: IsoDate;
  /**
   * Dia de cobrança: o da última, a não ser que ela tenha caído no último dia
   * de um mês curto (o dia 31 cobrado em 28/02 continua sendo 31).
   */
  dayOfMonth: number;
  /** Teve cobrança nos últimos 40 dias. */
  active: boolean;
  total: Cents;
  /** Gasto médio nos meses em que houve cobrança (sem o mês corrente, incompleto, se houver outros). */
  estimatedMonthlyCost: Cents;
  accounts: string[];
  /** Conta ou cartão da cobrança mais recente (onde ela cai hoje). */
  account: string;
  /** Forma de pagamento da cobrança mais recente (ou a mais comum, se ela não informa). */
  paymentMethod: PaymentMethod | null;
  /** A cobrança mais recente caiu num cartão de crédito. */
  onCreditCard: boolean;
  installment: { current: number; total: number; remaining: number } | null;
}

export interface RecurrenceOptions {
  today: IsoDate;
  /** Meses distintos com cobrança para considerar recorrente. */
  minMonths: number;
}

const STABLE_TOLERANCE = 0.15;
/** Variação aceita dentro de um mesmo preço (IOF, centavos de câmbio). */
const PLATEAU_TOLERANCE = 0.02;
/** Cadências de cobrança reconhecidas, em meses. */
const BILLING_INTERVALS = [1, 2, 3, 6, 12];
const ACTIVE_WINDOW_DAYS = 40;

/**
 * Detecta gastos recorrentes: mesma origem cobrada em pelo menos `minMonths`
 * meses distintos. Base para achar assinaturas esquecidas, hábitos caros
 * ("gastos do pecado") e parcelamentos em andamento.
 */
export function detectRecurrences(
  txs: AnalyzedTransaction[],
  options: RecurrenceOptions,
): Recurrence[] {
  const groups = new Map<string, AnalyzedTransaction[]>();
  for (const tx of txs) {
    if (kindOf(tx) !== 'GASTO') continue;
    const key = recurrenceKey(tx);
    if (!key) continue;
    const group = groups.get(key);
    if (group) group.push(tx);
    else groups.set(key, [tx]);
  }

  const activeSince = addDays(options.today, -ACTIVE_WINDOW_DAYS);
  const currentMonth = monthOf(options.today);
  const result: Recurrence[] = [];
  for (const [key, group] of groups) {
    const monthsSeen = [...new Set(group.map((tx) => monthOf(tx.date)))].sort();
    if (monthsSeen.length < options.minMonths) continue;

    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date));
    const last = sorted[sorted.length - 1]!;
    const amounts = sorted.map((tx) => -tx.amount);
    const typical = median(amounts);
    const total = amounts.reduce((sum, value) => sum + value, 0);
    const stable = amounts.every(
      (value) => Math.abs(value - typical) <= Math.max(1, typical * STABLE_TOLERANCE),
    );
    const priceChange = priceStep(sorted);
    const fixedPrice = stable || priceChange !== null;
    const intervalMonths = billingInterval(monthsSeen);
    const averagePerMonth = sorted.length / monthsSeen.length;
    // O mês corrente está pela metade: entra na média só se for o único.
    const closedMonths = monthsSeen.filter((month) => month !== currentMonth);
    const costBase = closedMonths.length > 0 ? closedMonths : monthsSeen;
    const costTotal = sorted
      .filter((tx) => costBase.includes(monthOf(tx.date)))
      .reduce((sum, tx) => sum - tx.amount, 0);
    const installment = last.installment
      ? {
          current: last.installment.number,
          total: last.installment.total,
          remaining: Math.max(0, last.installment.total - last.installment.number),
        }
      : null;

    result.push({
      key,
      label: last.description,
      counterpartyName: last.counterpartyName,
      category: mostCommon(sorted.map((tx) => tx.category)),
      pattern: installment
        ? 'PARCELAMENTO'
        : averagePerMonth >= 2
          ? 'HABITO_FREQUENTE'
          : fixedPrice && averagePerMonth <= 1.25 && intervalMonths !== null
            ? 'ASSINATURA_OU_CONTA_FIXA'
            : 'RECORRENTE_VARIAVEL',
      occurrences: sorted.length,
      monthsSeen,
      averagePerMonth: Math.round(averagePerMonth * 10) / 10,
      typicalAmount: typical,
      minAmount: Math.min(...amounts),
      maxAmount: Math.max(...amounts),
      lastAmount: -last.amount,
      stableAmount: stable,
      priceChange,
      fixedPrice,
      intervalMonths,
      firstDate: sorted[0]!.date,
      lastDate: last.date,
      dayOfMonth: billingDay(sorted),
      active: last.date >= activeSince,
      total,
      estimatedMonthlyCost: Math.round(costTotal / costBase.length),
      accounts: [...new Set(sorted.map((tx) => tx.accountName))],
      account: last.accountName,
      paymentMethod:
        last.paymentMethod ?? mostCommonKnown(sorted.map((tx) => tx.paymentMethod ?? null)),
      onCreditCard: last.accountType === 'CREDIT_CARD',
      installment,
    });
  }
  return result.sort(
    (a, b) => b.estimatedMonthlyCost - a.estimatedMonthlyCost || a.key.localeCompare(b.key),
  );
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

/**
 * Degrau de preço: as cobranças mais recentes num valor e todas as anteriores
 * (pelo menos duas) noutro, cada grupo dentro de ±2%. Conta variável (luz)
 * não forma dois patamares assim.
 */
function priceStep(sorted: AnalyzedTransaction[]): Recurrence['priceChange'] {
  const amounts = sorted.map((tx) => -tx.amount);
  const near = (value: number, reference: number) =>
    Math.abs(value - reference) <= Math.max(1, reference * PLATEAU_TOLERANCE);
  const latest = amounts[amounts.length - 1]!;
  let start = amounts.length - 1;
  while (start > 0 && near(amounts[start - 1]!, latest)) start--;
  const before = amounts.slice(0, start);
  if (before.length < 2) return null;
  const previous = median(before);
  if (!before.every((value) => near(value, previous))) return null;
  return { from: previous, to: median(amounts.slice(start)), on: sorted[start]!.date };
}

/**
 * Cadência pela mediana dos intervalos entre os meses com cobrança (um mês
 * pulado não desfaz a mensal). Espaçada (2+ meses) precisa de 3 meses com
 * cobrança, todos os intervalos a até 1 mês dela: dois pontos não provam cadência.
 */
function billingInterval(monthsSeen: IsoMonth[]): number | null {
  if (monthsSeen.length < 2) return null;
  const gaps = monthsSeen.slice(1).map((month, i) => monthsBetween(monthsSeen[i]!, month));
  const interval = Math.round(median(gaps));
  if (!BILLING_INTERVALS.includes(interval)) return null;
  if (interval > 1 && monthsSeen.length < 3) return null;
  // Espaçada tem que ser regular: março, agosto e setembro não são "trimestral".
  if (interval > 1 && gaps.some((gap) => Math.abs(gap - interval) > 1)) return null;
  return interval;
}

function billingDay(sorted: AnalyzedTransaction[]): number {
  const lastDate = sorted[sorted.length - 1]!.date;
  const day = Number(lastDate.slice(8, 10));
  if (day < lastDayOf(monthOf(lastDate))) return day;
  return Math.max(...sorted.slice(-3).map((tx) => Number(tx.date.slice(8, 10))));
}

function mostCommonKnown<T>(values: (T | null)[]): T | null {
  const known = values.filter((value): value is T => value !== null);
  return known.length > 0 ? mostCommon(known) : null;
}

function mostCommon<T>(values: T[]): T {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = values[values.length - 1] as T;
  for (const [value, count] of counts) if (count > counts.get(best)!) best = value;
  return best;
}
