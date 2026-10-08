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
