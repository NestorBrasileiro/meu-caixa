import type {
  Account,
  Connection,
  DateRange,
  Invoice,
  Profile,
  Transaction,
} from '../src/domain/finance.js';
import type { FinanceProvider } from '../src/integrations/finance-provider.js';

/** Provedor controlável pelos testes: dados mutáveis, falhas e pausas sob demanda. */
export class InMemoryProvider implements FinanceProvider {
  readonly name = 'test';
  connections: Connection[] = [];
  accounts: Account[] = [];
  transactions: Transaction[] = [];
  invoices: Invoice[] = [];
  readonly transactionCalls: { accountId: string; range: DateRange }[] = [];
  readonly failingAccounts = new Set<string>();
  /** Enquanto definido, `getConnections` espera a promise resolver. */
  pause: Promise<void> | undefined;

  async getProfile(): Promise<Profile> {
    return { fullName: 'Teste', document: null, email: null };
  }

  async getConnections(): Promise<Connection[]> {
    await this.pause;
    return this.connections;
  }

  async getAccounts(): Promise<Account[]> {
    return this.accounts;
  }

  async getTransactions(accountId: string, range: DateRange): Promise<Transaction[]> {
    this.transactionCalls.push({ accountId, range });
    if (this.failingAccounts.has(accountId)) throw new Error('banco fora do ar');
    return this.transactions.filter(
      (t) => t.accountExternalId === accountId && t.date >= range.from && t.date <= range.to,
    );
  }

  async getInvoices(accountId: string): Promise<Invoice[]> {
    return this.invoices.filter((invoice) => invoice.accountExternalId === accountId);
  }
}
