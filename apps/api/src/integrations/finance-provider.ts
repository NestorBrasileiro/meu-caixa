import type {
  Account,
  Connection,
  DateRange,
  Invoice,
  Loan,
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
  /**
   * Empréstimos e financiamentos de uma conexão. `null` quando a instituição
   * não compartilha esse produto (fora do consentimento do Open Finance ou
   * indisponível no agregador): o sync segue sem empréstimos para a conexão e
   * mantém o que já tinha gravado. `[]` significa que não há nenhum.
   */
  getLoans(connectionId: string): Promise<Loan[] | null>;
}

/**
 * Entrega o provedor atual. Com a Pluggy, as credenciais vêm do banco e podem
 * mudar com o app no ar: quem sincroniza pede o provedor a cada execução.
 */
export interface FinanceProviderSource {
  /** Falha com `ProviderNotConfiguredError` enquanto não houver configuração. */
  get(): Promise<FinanceProvider>;
}

export const FINANCE_PROVIDER_SOURCE = Symbol('FINANCE_PROVIDER_SOURCE');

/** Fonte que sempre entrega o mesmo provedor (fake e testes). */
export function staticProviderSource(provider: FinanceProvider): FinanceProviderSource {
  return { get: async () => provider };
}

export class ProviderNotConfiguredError extends Error {
  constructor(message = 'Configure as credenciais da Pluggy em Configurações') {
    super(message);
    this.name = 'ProviderNotConfiguredError';
  }
}

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
