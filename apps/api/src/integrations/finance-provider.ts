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

/**
 * Entrega o provedor atual. Com a Pluggy, as credenciais vêm do banco e podem
 * mudar com o app no ar: quem sincroniza pede o provedor a cada execução.
 */
/** Provedor de cada usuário (cada um cadastra a própria Pluggy). */
export interface FinanceProviderSource {
  /** Falha com `ProviderNotConfiguredError` enquanto o usuário não configurar. */
  get(userId: string): Promise<FinanceProvider>;
  /**
   * Usuários que o agendador deve sincronizar; `null` = todos (o provedor
   * fake e os testes não dependem de configuração).
   */
  configuredUserIds(): Promise<string[] | null>;
}

export const FINANCE_PROVIDER_SOURCE = Symbol('FINANCE_PROVIDER_SOURCE');

/** Fonte que entrega o mesmo provedor para todos os usuários (fake e testes). */
export function staticProviderSource(provider: FinanceProvider): FinanceProviderSource {
  return { get: async () => provider, configuredUserIds: async () => null };
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
