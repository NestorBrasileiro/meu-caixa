import type {
  Account,
  Connection,
  DateRange,
  Invoice,
  Profile,
  Transaction,
} from '../../domain/finance.js';
import { FinanceProviderError, type FinanceProvider } from '../finance-provider.js';

const EMPTY_PROFILE: Profile = { fullName: null, document: null, email: null };

/**
 * Modo `none`: nada configurado ainda (sem `FINANCE_PROVIDER`, sem escolha no
 * app e sem credenciais). Não tem bancos, então a sincronização termina
 * `SUCCEEDED` sem dados e as telas convidam a configurar o Open Finance.
 */
export class NoneFinanceProvider implements FinanceProvider {
  readonly name = 'none';

  async getProfile(): Promise<Profile> {
    return EMPTY_PROFILE;
  }

  async getConnections(): Promise<Connection[]> {
    return [];
  }

  async getAccounts(): Promise<Account[]> {
    return [];
  }

  async getTransactions(_accountId: string, _range: DateRange): Promise<Transaction[]> {
    return [];
  }

  async getInvoices(_accountId: string): Promise<Invoice[]> {
    return [];
  }
}

export const OPEN_FINANCE_NOT_CONFIGURED =
  'Open Finance não configurado: cadastre o Client ID e o Client Secret da Pluggy em Configurações → Open Finance';

/**
 * Modo escolhido explicitamente (`pluggy`) mas sem credenciais: a
 * sincronização falha (`FAILED`) com uma mensagem que diz o que fazer.
 */
export class UnconfiguredFinanceProvider implements FinanceProvider {
  constructor(
    readonly name: string,
    private readonly reason: string = OPEN_FINANCE_NOT_CONFIGURED,
  ) {}

  getProfile(): Promise<Profile> {
    return this.fail();
  }

  getConnections(): Promise<Connection[]> {
    return this.fail();
  }

  getAccounts(): Promise<Account[]> {
    return this.fail();
  }

  getTransactions(_accountId: string, _range: DateRange): Promise<Transaction[]> {
    return this.fail();
  }

  getInvoices(_accountId: string): Promise<Invoice[]> {
    return this.fail();
  }

  private async fail(): Promise<never> {
    throw new FinanceProviderError(this.reason, { retryable: false });
  }
}
