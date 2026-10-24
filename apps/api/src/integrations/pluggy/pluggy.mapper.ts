import { toLocalDate } from '../../domain/dates.js';
import type {
  Account,
  AccountType,
  Cents,
  Connection,
  ConnectionStatus,
  Invoice,
  IsoDate,
  Loan,
  LoanPeriodicity,
  PaymentMethod,
  Profile,
  Transaction,
} from '../../domain/finance.js';
import { LOAN_PERIODICITY_LABEL } from '../../domain/loans.js';
import { toCents } from '../../domain/money.js';
import type {
  PluggyAccount,
  PluggyBill,
  PluggyIdentity,
  PluggyItem,
  PluggyLoan,
  PluggyTransaction,
} from './pluggy.schemas.js';

/**
 * Anticorruption layer: traduz o formato da Pluggy para o modelo de domínio.
 * É o único lugar que conhece os nomes e convenções do agregador.
 */

const ITEM_STATUS: Record<string, ConnectionStatus> = {
  UPDATED: 'ACTIVE',
  UPDATING: 'UPDATING',
  MERGING: 'UPDATING',
  WAITING_USER_INPUT: 'ACTION_REQUIRED',
  WAITING_USER_ACTION: 'ACTION_REQUIRED',
  LOGIN_ERROR: 'ACTION_REQUIRED',
  OUTDATED: 'ERROR',
};

const ACCOUNT_SUBTYPE: Record<string, AccountType> = {
  CHECKING_ACCOUNT: 'CHECKING',
  SAVINGS_ACCOUNT: 'SAVINGS',
  CREDIT_CARD: 'CREDIT_CARD',
};

/** Tipos de operação do Open Finance Brasil que viram meio de pagamento. */
const PAYMENT_METHOD: Record<string, PaymentMethod> = {
  PIX: 'PIX',
  TED: 'TED',
  DOC: 'DOC',
  BOLETO: 'BOLETO',
  CARTAO: 'CARD',
};

export function mapItem(item: PluggyItem): Connection {
  return {
    externalId: item.id,
    institutionName: item.connector.name,
    institutionLogoUrl: item.connector.imageUrl ?? null,
    status: ITEM_STATUS[item.status] ?? 'ERROR',
    lastRefreshedAt: item.lastUpdatedAt ? new Date(item.lastUpdatedAt) : null,
  };
}

export function mapIdentity(identity: PluggyIdentity): Profile {
  return {
    fullName: identity.fullName ?? null,
    document: identity.document ?? identity.taxNumber ?? null,
    email: identity.emails?.[0]?.value ?? null,
  };
}

export function mapAccount(account: PluggyAccount): Account {
  const type: AccountType =
    (account.subtype && ACCOUNT_SUBTYPE[account.subtype]) ||
    (account.type === 'CREDIT' ? 'CREDIT_CARD' : 'OTHER');
  const credit = account.creditData;

  return {
    externalId: account.id,
    connectionExternalId: account.itemId,
    type,
    name: account.marketingName || account.name,
    number: account.number || null,
    currency: account.currencyCode ?? 'BRL',
    balance: toCents(account.balance),
    creditLimit: credit?.creditLimit != null ? toCents(credit.creditLimit) : null,
    availableCredit:
      credit?.availableCreditLimit != null ? toCents(credit.availableCreditLimit) : null,
  };
}

export function mapTransaction(transaction: PluggyTransaction, timeZone: string): Transaction {
  // O sinal de `amount` varia por tipo de conta na Pluggy; a direção confiável é `type`.
  const value = Math.abs(transaction.amountInAccountCurrency ?? transaction.amount);
  const isOutflow = transaction.type === 'DEBIT';
  const card = transaction.creditCardMetadata;

  return {
    externalId: transaction.id,
    accountExternalId: transaction.accountId,
    date: toLocalDate(transaction.date, timeZone),
    description: (transaction.description || transaction.descriptionRaw || '').trim(),
    amount: toCents(isOutflow ? -value : value),
    status: transaction.status === 'PENDING' ? 'PENDING' : 'POSTED',
    category: transaction.category ?? null,
    paymentMethod: paymentMethodOf(transaction),
    counterpartyName: counterpartyOf(transaction, isOutflow),
    installment:
      card?.installmentNumber && card.totalInstallments && card.totalInstallments > 1
        ? { number: card.installmentNumber, total: card.totalInstallments }
        : null,
    invoiceExternalId: card?.billId ?? null,
  };
}

export function mapBill(bill: PluggyBill, accountId: string, timeZone: string): Invoice {
  return {
    externalId: bill.id,
    accountExternalId: accountId,
    dueDate: toLocalDate(bill.dueDate, timeZone),
    closingDate: bill.billClosingDate ? toLocalDate(bill.billClosingDate, timeZone) : null,
    total: toCents(bill.totalAmount),
    minimumPayment: bill.minimumPaymentAmount != null ? toCents(bill.minimumPaymentAmount) : null,
    currency: bill.totalAmountCurrencyCode ?? 'BRL',
  };
}

function paymentMethodOf(transaction: PluggyTransaction): PaymentMethod | null {
  const candidates = [transaction.paymentData?.paymentMethod, transaction.operationType];
  for (const candidate of candidates) {
    const method = candidate && PAYMENT_METHOD[candidate.toUpperCase()];
    if (method) return method;
  }
  if (transaction.creditCardMetadata) return 'CARD';
  return candidates.some(Boolean) ? 'OTHER' : null;
}

function counterpartyOf(transaction: PluggyTransaction, isOutflow: boolean): string | null {
  const merchant = transaction.merchant?.name || transaction.merchant?.businessName;
  if (merchant) return merchant;
  const participant = isOutflow
    ? transaction.paymentData?.receiver
    : transaction.paymentData?.payer;
  return participant?.name || null;
}

/**
 * Nome em pt-BR das modalidades de crédito do Open Finance Brasil
 * (`productSubType` de empréstimos, financiamentos, antecipação de recebíveis
 * e adiantamento a depositante), mais alguns nomes em inglês que a Pluggy usa.
 */
const LOAN_TYPE_NAME: Record<string, string> = {
  HOME_EQUITY: 'Crédito com garantia de imóvel',
  CHEQUE_ESPECIAL: 'Cheque especial',
  CONTA_GARANTIDA: 'Conta garantida',
  CAPITAL_GIRO_TETO_ROTATIVO: 'Capital de giro rotativo',
  CREDITO_PESSOAL_SEM_CONSIGNACAO: 'Crédito pessoal',
  CREDITO_PESSOAL_COM_CONSIGNACAO: 'Crédito consignado',
  MICROCREDITO_PRODUTIVO_ORIENTADO: 'Microcrédito produtivo orientado',
  CAPITAL_GIRO_PRAZO_VENCIMENTO_ATE_365_DIAS: 'Capital de giro (até 365 dias)',
  CAPITAL_GIRO_PRAZO_VENCIMENTO_SUPERIOR_365_DIAS: 'Capital de giro (mais de 365 dias)',
  CARTAO_CREDITO_ROTATIVO: 'Rotativo do cartão de crédito',
  CARTAO_CREDITO_PARCELADO: 'Parcelamento do cartão de crédito',
  AQUISICAO_BENS_VEICULOS_AUTOMOTORES: 'Financiamento de veículo',
  AQUISICAO_BENS_OUTROS_BENS: 'Financiamento de bens',
  MICROCREDITO: 'Microcrédito',
  CUSTEIO: 'Crédito rural (custeio)',
  INVESTIMENTO: 'Crédito rural (investimento)',
  INDUSTRIALIZACAO: 'Crédito rural (industrialização)',
  COMERCIALIZACAO: 'Crédito rural (comercialização)',
  FINANCIAMENTO_HABITACIONAL_SFH: 'Financiamento imobiliário (SFH)',
  FINANCIAMENTO_HABITACIONAL_EXCETO_SFH: 'Financiamento imobiliário',
  DESCONTO_DUPLICATAS: 'Desconto de duplicatas',
  DESCONTO_CHEQUES: 'Desconto de cheques',
  ANTECIPACAO_FATURA_CARTAO_CREDITO: 'Antecipação de recebíveis de cartão',
  OUTROS_DIREITOS_CREDITORIOS_DESCONTADOS: 'Direitos creditórios descontados',
  OUTROS_TITULOS_DESCONTADOS: 'Títulos descontados',
  ADIANTAMENTO_A_DEPOSITANTES: 'Adiantamento a depositante',
  PERSONAL_LOAN: 'Crédito pessoal',
  PAYROLL_LOAN: 'Crédito consignado',
  CONSIGNED_LOAN: 'Crédito consignado',
  VEHICLE_FINANCING: 'Financiamento de veículo',
  REAL_ESTATE_FINANCING: 'Financiamento imobiliário',
  OVERDRAFT: 'Cheque especial',
};

/** Família da operação (`kind`), quando a modalidade é desconhecida. */
const LOAN_KIND_NAME: Record<string, string> = {
  LOAN: 'Empréstimo',
  FINANCING: 'Financiamento',
  INVOICE_FINANCING: 'Antecipação de recebíveis',
  UNARRANGED_ACCOUNT_OVERDRAFT: 'Adiantamento a depositante',
};

const LOAN_PERIODICITY: Record<string, LoanPeriodicity> = {
  WEEKLY: 'WEEKLY',
  FORTNIGHTLY: 'FORTNIGHTLY',
  MONTHLY: 'MONTHLY',
  BIMONTHLY: 'BIMONTHLY',
  QUARTERLY: 'QUARTERLY',
  SEMESTERLY: 'SEMIANNUAL',
  YEARLY: 'YEARLY',
  WITHOUT_REGULAR_PERIODICITY: 'IRREGULAR',
  OTHERS: 'OTHER',
};

/** Unidade de prazo do Open Finance que coincide com uma parcela por período. */
const PERIOD_UNIT: Partial<Record<LoanPeriodicity, string>> = {
  WEEKLY: 'WEEK',
  MONTHLY: 'MONTH',
  YEARLY: 'YEAR',
};

/** Sistemas de amortização em que a parcela muda a cada mês. */
const VARIABLE_INSTALLMENT_AMORTIZATION = new Set(['SAC', 'SAM']);

export function mapLoan(loan: PluggyLoan, timeZone: string): Loan {
  const periodicity = loan.installmentPeriodicity
    ? (LOAN_PERIODICITY[loan.installmentPeriodicity] ?? 'OTHER')
    : null;
  const date = (value: string | null | undefined) => (value ? calendarDate(value, timeZone) : null);

  return {
    externalId: loan.id,
    connectionExternalId: loan.itemId,
    productName: loanProductName(loan),
    type: loan.type || null,
    contractNumber: loan.contractNumber || loan.ipocCode || null,
    contractedAmount: centsOrNull(loan.contractAmount),
    outstandingBalance: centsOrNull(loan.payments?.contractOutstandingBalance),
    currency: loan.currencyCode || 'BRL',
    contractDate: date(loan.contractDate),
    finalDueDate: date(loan.dueDate),
    firstInstallmentDueDate: date(loan.firstInstallmentDueDate),
    periodicity,
    periodicityLabel:
      periodicity === 'OTHER'
        ? loan.installmentPeriodicityAdditionalInfo?.trim() || LOAN_PERIODICITY_LABEL.OTHER
        : periodicity && LOAN_PERIODICITY_LABEL[periodicity],
    installments: loanInstallments(loan, periodicity),
    installmentAmount: regularInstallmentAmount(loan),
    scheduledInstallments: (loan.installments?.balloonPayments ?? []).flatMap((balloon) =>
      balloon.dueDate
        ? [
            {
              dueDate: calendarDate(balloon.dueDate, timeZone),
              amount: centsOrNull(balloon.amount?.value),
            },
          ]
        : [],
    ),
    interestRateAnnual: annualInterestRate(loan.interestRates),
    // CET vem como fração ao ano (1 = 100%).
    cetAnnual: loan.CET != null ? percent(loan.CET) : null,
    raw: loan,
  };
}

/** Nome do banco; sem ele, o da modalidade, o da família ou o código legível. */
function loanProductName(loan: PluggyLoan): string {
  const fromBank = loan.productName?.trim();
  if (fromBank) return fromBank;
  if (loan.type && LOAN_TYPE_NAME[loan.type]) return LOAN_TYPE_NAME[loan.type]!;
  if (loan.kind && LOAN_KIND_NAME[loan.kind]) return LOAN_KIND_NAME[loan.kind]!;
  if (loan.type) {
    const words = loan.type.replace(/_/g, ' ').trim().toLowerCase();
    if (words) return words.charAt(0).toUpperCase() + words.slice(1);
  }
  return 'Empréstimo';
}

/**
 * O Open Finance informa prazos (total e restante) numa unidade (dia, semana,
 * mês, ano); só viram quantidade de parcelas quando a unidade bate com a
 * periodicidade. "A vencer" e "vencidas" já são contagens de parcelas.
 */
function loanInstallments(
  loan: PluggyLoan,
  periodicity: LoanPeriodicity | null,
): Loan['installments'] {
  const data = loan.installments;
  const paid = data?.paidInstallments ?? null;
  const overdue = data?.pastDueInstallments ?? null;
  const countsInstallments = (unit: string | null | undefined) =>
    !unit || (periodicity ? PERIOD_UNIT[periodicity] === unit : unit === 'MONTH');

  let total =
    data?.totalNumberOfInstallments != null && countsInstallments(data.typeNumberOfInstallments)
      ? data.totalNumberOfInstallments
      : null;
  let remaining =
    data?.dueInstallments ??
    (data?.contractRemainingNumber != null && countsInstallments(data.typeContractRemaining)
      ? data.contractRemainingNumber
      : null);

  if (remaining === null && total !== null && paid !== null) {
    const derived = total - paid - (overdue ?? 0);
    remaining = derived >= 0 ? derived : null;
  }
  if (total === null && paid !== null && remaining !== null && overdue !== null) {
    total = paid + remaining + overdue;
  }
  return { total, paid, remaining, overdue };
}

/**
 * A Pluggy não informa o valor da parcela. Com parcelas fixas (Price e
 * afins), ele é o da última parcela regular paga; com SAC/SAM a parcela muda
 * todo mês e fica desconhecida.
 */
function regularInstallmentAmount(loan: PluggyLoan): Cents | null {
  if (
    loan.amortizationScheduled &&
    VARIABLE_INSTALLMENT_AMORTIZATION.has(loan.amortizationScheduled)
  ) {
    return null;
  }
  const regular = (loan.payments?.releases ?? [])
    .filter((release) => release.isOverParcelPayment !== true && (release.paidAmount ?? 0) > 0)
    .sort((a, b) => (b.paidDate ?? '').localeCompare(a.paidDate ?? ''));
  const latest = regular[0];
  return latest?.paidAmount != null ? toCents(latest.paidAmount) : null;
}

/**
 * Taxa de juros prefixada em % ao ano. Mensal vira anual pela taxa
 * equivalente (juros compostos, o padrão) ou ×12 (juros simples). Contrato
 * pós-fixado (ex.: CDI + x%) depende do indexador: fica `null`.
 */
function annualInterestRate(rates: PluggyLoan['interestRates']): number | null {
  const rate = rates?.find((candidate) => candidate.preFixedRate != null);
  if (!rate || rate.preFixedRate == null) return null;
  if (rate.postFixedRate != null && rate.postFixedRate > 0) return null;

  const value = rate.preFixedRate;
  switch (rate.taxPeriodicity) {
    case 'YEARLY':
      return percent(value);
    case 'MONTHLY':
      return percent(rate.interestRateType === 'SIMPLE' ? value * 12 : (1 + value) ** 12 - 1);
    default:
      return null;
  }
}

/** Fração (1 = 100%) para percentual com 2 casas. */
function percent(fraction: number): number {
  return Math.round(fraction * 10_000) / 100;
}

function centsOrNull(value: number | null | undefined): Cents | null {
  return value != null ? toCents(value) : null;
}

/**
 * Datas de contrato são de calendário: `YYYY-MM-DD` puro, ou serializado como
 * meia-noite UTC, vale como está (no fuso local viraria o dia anterior). Um
 * instante de verdade vai para o dia local.
 */
function calendarDate(value: string, timeZone: string): IsoDate {
  if (/^\d{4}-\d{2}-\d{2}(T00:00(:00(\.0+)?)?(Z|[+-]00:?00))?$/.test(value)) {
    return value.slice(0, 10);
  }
  return toLocalDate(value, timeZone);
}
