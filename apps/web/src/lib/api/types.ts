/**
 * Contratos da API (`apps/api`), no formato JSON em que chegam ao frontend.
 * Valores monetários em centavos (inteiros); datas de calendário `YYYY-MM-DD`
 * no fuso do usuário; instantes em ISO 8601.
 */

export type Cents = number
export type IsoDate = string
export type IsoDateTime = string

export type ConnectionStatus = "ACTIVE" | "UPDATING" | "ACTION_REQUIRED" | "ERROR"

/** GET /connections */
export interface Connection {
  id: string
  institutionName: string
  institutionLogoUrl: string | null
  status: ConnectionStatus
  lastRefreshedAt: IsoDateTime | null
  updatedAt: IsoDateTime
}

export type AccountType = "CHECKING" | "SAVINGS" | "CREDIT_CARD" | "OTHER"

/** GET /accounts */
export interface Account {
  id: string
  connectionId: string
  institutionName: string
  connectionStatus: ConnectionStatus
  type: AccountType
  name: string
  number: string | null
  currency: string
  /** Conta: saldo disponível. Cartão: valor em aberto (quanto se deve). */
  balance: Cents
  creditLimit: Cents | null
  availableCredit: Cents | null
  transactionsSyncedThrough: IsoDate | null
  updatedAt: IsoDateTime
}

export type TransactionStatus = "POSTED" | "PENDING"
export type PaymentMethod = "PIX" | "TED" | "DOC" | "BOLETO" | "CARD" | "OTHER"

/** Item de GET /transactions */
export interface Transaction {
  id: string
  accountId: string
  date: IsoDate
  description: string
  /** Negativo = dinheiro saindo; positivo = entrando. */
  amount: Cents
  status: TransactionStatus
  /** Categoria do agregador (nomes em inglês da Pluggy). */
  category: string | null
  paymentMethod: PaymentMethod | null
  counterpartyName: string | null
  installment: { number: number; total: number } | null
  invoiceExternalId: string | null
}

export interface Page<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

export interface TransactionQuery {
  accountId?: string
  from?: IsoDate
  to?: IsoDate
  status?: TransactionStatus
  search?: string
  limit?: number
  offset?: number
}

/** GET /invoices */
export interface Invoice {
  id: string
  accountId: string
  dueDate: IsoDate
  closingDate: IsoDate | null
  total: Cents
  minimumPayment: Cents | null
  currency: string
}

export type SyncRunStatus = "RUNNING" | "SUCCEEDED" | "PARTIAL" | "FAILED"
export type SyncTrigger = "SCHEDULED" | "STARTUP" | "MANUAL"

/** GET /sync/runs */
export interface SyncRun {
  id: string
  provider: string
  trigger: SyncTrigger
  status: SyncRunStatus
  startedAt: IsoDateTime
  finishedAt: IsoDateTime | null
  stats: {
    connections: number
    accounts: number
    transactions: number
    removedPendingTransactions: number
    invoices: number
  } | null
  errors: string[]
}

/** GET /auth/me */
export interface AuthUser {
  id: string
  username: string | null
  name: string | null
  email: string | null
  roles: string[]
}
