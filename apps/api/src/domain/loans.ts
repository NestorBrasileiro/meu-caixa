import { addDays } from './dates.js';
import type { Cents, IsoDate, Loan, LoanPeriodicity } from './finance.js';
import { dueDate, monthOf, monthsBetween, shiftMonth } from './months.js';

/** Periodicidades com passo fixo em meses. */
const MONTH_STEP: Partial<Record<LoanPeriodicity, number>> = {
  MONTHLY: 1,
  BIMONTHLY: 2,
  QUARTERLY: 3,
  SEMIANNUAL: 6,
  YEARLY: 12,
};

/** Periodicidades com passo fixo em dias. Quinzenal fica de fora: 14 ou 15 dias varia por banco. */
const DAY_STEP: Partial<Record<LoanPeriodicity, number>> = { WEEKLY: 7 };

export const LOAN_PERIODICITY_LABEL: Record<LoanPeriodicity, string> = {
  WEEKLY: 'Semanal',
  FORTNIGHTLY: 'Quinzenal',
  MONTHLY: 'Mensal',
  BIMONTHLY: 'Bimestral',
  QUARTERLY: 'Trimestral',
  SEMIANNUAL: 'Semestral',
  YEARLY: 'Anual',
  IRREGULAR: 'Sem periodicidade regular',
  OTHER: 'Outra',
};

export type NextInstallmentInput = Pick<
  Loan,
  | 'firstInstallmentDueDate'
  | 'finalDueDate'
  | 'periodicity'
  | 'installments'
  | 'installmentAmount'
  | 'scheduledInstallments'
>;

export interface NextInstallment {
  dueDate: IsoDate;
  amount: Cents | null;
}

/**
 * Próxima parcela a vencer (em `today` ou depois). O Open Finance não informa
 * a data da próxima parcela: ela sai do calendário do contrato (primeiro
 * vencimento + periodicidade, ou, sem ele, contando para trás do vencimento
 * final pelas parcelas a vencer) e das parcelas não regulares com data
 * própria. Sem dados suficientes, `null` — nada é inventado.
 */
export function nextInstallment(
  loan: NextInstallmentInput,
  today: IsoDate,
): NextInstallment | null {
  if (loan.installments.remaining === 0) return null;

  const regular = nextRegularDueDate(loan, today);
  const scheduled = loan.scheduledInstallments
    .filter((installment) => installment.dueDate >= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  if (regular && (!scheduled || regular < scheduled.dueDate)) {
    return { dueDate: regular, amount: loan.installmentAmount };
  }
  if (!scheduled) return null;
  if (regular === scheduled.dueDate) {
    // Parcela regular e intermediária no mesmo dia: vence a soma.
    const amount =
      loan.installmentAmount !== null && scheduled.amount !== null
        ? loan.installmentAmount + scheduled.amount
        : null;
    return { dueDate: scheduled.dueDate, amount };
  }
  return { dueDate: scheduled.dueDate, amount: scheduled.amount };
}

function nextRegularDueDate(loan: NextInstallmentInput, today: IsoDate): IsoDate | null {
  const { firstInstallmentDueDate: first, finalDueDate: last, periodicity } = loan;
  if (!periodicity) return null;
  const monthStep = MONTH_STEP[periodicity];
  const dayStep = DAY_STEP[periodicity];

  let next: IsoDate | null = null;
  if (first && monthStep) {
    const day = Number(first.slice(8, 10));
    let k = Math.max(0, Math.floor(monthsBetween(monthOf(first), monthOf(today)) / monthStep));
    next = dueDate(shiftMonth(monthOf(first), k * monthStep), day);
    while (next < today) {
      k++;
      next = dueDate(shiftMonth(monthOf(first), k * monthStep), day);
    }
  } else if (first && dayStep) {
    const elapsed = daysBetween(first, today);
    next = elapsed <= 0 ? first : addDays(first, Math.ceil(elapsed / dayStep) * dayStep);
  } else if (last && monthStep && loan.installments.remaining) {
    // Sem o primeiro vencimento: a próxima é a N-ésima antes do fim, N = a vencer.
    const day = Number(last.slice(8, 10));
    next = dueDate(shiftMonth(monthOf(last), -(loan.installments.remaining - 1) * monthStep), day);
    return next >= today ? next : null;
  }

  if (!next || (last && next > last)) return null;
  return next;
}

function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * Empréstimo visto só pelas transações, para quando o banco não compartilha o
 * contrato pelo Open Finance: o que entrou de crédito e o que saiu em parcelas.
 */
export interface DetectedLoan {
  institutionName: string;
  accountName: string;
  /** Dinheiro emprestado que entrou no período. */
  released: Cents;
  releases: number;
  /** Parcelas pagas no período (valor positivo). */
  paid: Cents;
  payments: number;
  lastPaymentDate: IsoDate | null;
}

export interface LoanMovement {
  date: IsoDate;
  amount: Cents;
  institutionName: string;
  accountName: string;
  /** `isLoanCredit` / `isLoanPayment` de `classify.ts`. */
  loanCredit: boolean;
  loanPayment: boolean;
}

/** Liberações e parcelas agrupadas por conta, da conta com mais movimento para a com menos. */
export function detectLoans(movements: LoanMovement[]): DetectedLoan[] {
  const byAccount = new Map<string, DetectedLoan>();
  for (const tx of movements) {
    if (!tx.loanCredit && !tx.loanPayment) continue;
    const key = `${tx.institutionName}|${tx.accountName}`;
    const loan = byAccount.get(key) ?? {
      institutionName: tx.institutionName,
      accountName: tx.accountName,
      released: 0,
      releases: 0,
      paid: 0,
      payments: 0,
      lastPaymentDate: null,
    };
    if (tx.loanCredit) {
      loan.released += tx.amount;
      loan.releases += 1;
    } else {
      loan.paid -= tx.amount;
      loan.payments += 1;
      if (!loan.lastPaymentDate || tx.date > loan.lastPaymentDate) loan.lastPaymentDate = tx.date;
    }
    byAccount.set(key, loan);
  }
  return [...byAccount.values()].sort((a, b) => b.released + b.paid - (a.released + a.paid));
}
