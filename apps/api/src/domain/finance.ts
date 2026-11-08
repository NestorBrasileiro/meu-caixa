/**
 * Modelo de domínio próprio. Nada aqui conhece a Pluggy: os adapters de
 * integração traduzem o formato do agregador para estes tipos.
 */

/** Valor monetário em centavos (inteiro), para evitar erro de ponto flutuante. */
export type Cents = number;

/** Data de calendário `YYYY-MM-DD`, já no fuso do usuário. */
export type IsoDate = string;

export interface DateRange {
  from: IsoDate;
  to: IsoDate;
}

export interface Profile {
  fullName: string | null;
  document: string | null;
  email: string | null;
}

export const CONNECTION_STATUSES = ['ACTIVE', 'UPDATING', 'ACTION_REQUIRED', 'ERROR'] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/** Um banco conectado (no Pluggy, um "item"). */
export interface Connection {
  externalId: string;
  institutionName: string;
  institutionLogoUrl: string | null;
  status: ConnectionStatus;
  /** Última vez que o agregador buscou dados no banco. */
  lastRefreshedAt: Date | null;
}

export const ACCOUNT_TYPES = ['CHECKING', 'SAVINGS', 'CREDIT_CARD', 'OTHER'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export interface Account {
  externalId: string;
  connectionExternalId: string;
  type: AccountType;
  name: string;
  number: string | null;
  currency: string;
  /** Conta: saldo disponível. Cartão: valor em aberto (quanto se deve). */
  balance: Cents;
  creditLimit: Cents | null;
  availableCredit: Cents | null;
}

export const TRANSACTION_STATUSES = ['POSTED', 'PENDING'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const PAYMENT_METHODS = ['PIX', 'TED', 'DOC', 'BOLETO', 'CARD', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface Installment {
  number: number;
  total: number;
}

export interface Transaction {
  externalId: string;
  accountExternalId: string;
  date: IsoDate;
  description: string;
  /** Na moeda da conta. Negativo = dinheiro saindo; positivo = entrando. */
  amount: Cents;
  status: TransactionStatus;
  category: string | null;
  paymentMethod: PaymentMethod | null;
  counterpartyName: string | null;
  installment: Installment | null;
  invoiceExternalId: string | null;
}

/** Fatura de cartão de crédito. */
export interface Invoice {
  externalId: string;
  accountExternalId: string;
  dueDate: IsoDate;
  closingDate: IsoDate | null;
  total: Cents;
  minimumPayment: Cents | null;
  currency: string;
}

/** Periodicidade das parcelas de um empréstimo (`IRREGULAR` = sem periodicidade regular). */
export const LOAN_PERIODICITIES = [
  'WEEKLY',
  'FORTNIGHTLY',
  'MONTHLY',
  'BIMONTHLY',
  'QUARTERLY',
  'SEMIANNUAL',
  'YEARLY',
  'IRREGULAR',
  'OTHER',
] as const;
export type LoanPeriodicity = (typeof LOAN_PERIODICITIES)[number];

/** Parcela com data e valor informados explicitamente pela instituição. */
export interface ScheduledInstallment {
  dueDate: IsoDate;
  amount: Cents | null;
}

/**
 * Empréstimo ou financiamento (Open Finance: empréstimos, financiamentos,
 * antecipação de recebíveis e adiantamento a depositante). Campos que o banco
 * não informa ficam `null`: nada aqui é estimado pelo adapter, exceto o que
 * está documentado em cada campo.
 */
export interface Loan {
  externalId: string;
  connectionExternalId: string;
  /** Nome amigável em pt-BR (o do banco ou, sem ele, o da modalidade). */
  productName: string;
  /** Modalidade bruta do Open Finance (ex.: CREDITO_PESSOAL_SEM_CONSIGNACAO). */
  type: string | null;
  contractNumber: string | null;
  contractedAmount: Cents | null;
  /** Saldo devedor: quanto falta para quitar. */
  outstandingBalance: Cents | null;
  currency: string;
  contractDate: IsoDate | null;
  /** Vencimento da última parcela (fim do contrato). */
  finalDueDate: IsoDate | null;
  firstInstallmentDueDate: IsoDate | null;
  periodicity: LoanPeriodicity | null;
  /** Periodicidade em pt-BR (ex.: "Mensal"). */
  periodicityLabel: string | null;
  installments: {
    total: number | null;
    paid: number | null;
    /** A vencer. */
    remaining: number | null;
    /** Vencidas e não pagas. */
    overdue: number | null;
  };
  /** Valor da parcela regular, quando conhecido (parcelas fixas). */
  installmentAmount: Cents | null;
  /** Parcelas não regulares com data própria (ex.: parcelas intermediárias). */
  scheduledInstallments: ScheduledInstallment[];
  /** Taxa de juros em % ao ano. */
  interestRateAnnual: number | null;
  /** Custo Efetivo Total em % ao ano. */
  cetAnnual: number | null;
  /** Payload original do provedor, guardado para uso futuro. */
  raw?: unknown;
}
