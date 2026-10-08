import type {
  Account,
  Connection,
  DateRange,
  Invoice,
  Profile,
  Transaction,
} from '../domain/finance.js';

/**
 * Porta de entrada dos dados financeiros. O resto do sistema depende só desta
 * interface; a implementação concreta (Pluggy, fake, outro agregador) é
 * escolhida por configuração em `IntegrationsModule`.
 *
 * Os ids recebidos e devolvidos aqui são os do provedor (`externalId`).
 */
export interface FinanceProvider {
  /** Nome estável do provedor, gravado junto de cada registro sincronizado. */
  readonly name: string;
  getProfile(): Promise<Profile>;
  getConnections(): Promise<Connection[]>;
  getAccounts(): Promise<Account[]>;
  getTransactions(accountId: string, range: DateRange): Promise<Transaction[]>;
  getInvoices(accountId: string): Promise<Invoice[]>;
}

export const FINANCE_PROVIDER = Symbol('FINANCE_PROVIDER');

/** Falha ao falar com o provedor, já traduzida para um erro nosso. */
export class FinanceProviderError extends Error {
  constructor(
    message: string,
    readonly options: { retryable: boolean; status?: number; cause?: unknown },
  ) {
    super(message, { cause: options.cause });
    this.name = 'FinanceProviderError';
  }

  get retryable(): boolean {
    return this.options.retryable;
  }

  get status(): number | undefined {
    return this.options.status;
  }
}
