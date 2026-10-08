import type {
  Account,
  Connection,
  DateRange,
  Invoice,
  Profile,
  Transaction,
} from '../../domain/finance.js';
import type { FinanceProvider } from '../finance-provider.js';

interface Entry {
  expiresAt: number;
  value: Promise<unknown>;
}

/**
 * Decorator de cache em memória para qualquer `FinanceProvider`. Chamadas
 * idênticas dentro do TTL reaproveitam a mesma resposta (inclusive enquanto
 * ainda está em voo), poupando o rate limit do agregador. Falhas não ficam
 * em cache.
 */
export class CachedFinanceProvider implements FinanceProvider {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly inner: FinanceProvider,
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get name(): string {
    return this.inner.name;
  }

  getProfile(): Promise<Profile> {
    return this.cached('profile', () => this.inner.getProfile());
  }

  getConnections(): Promise<Connection[]> {
    return this.cached('connections', () => this.inner.getConnections());
  }

  getAccounts(): Promise<Account[]> {
    return this.cached('accounts', () => this.inner.getAccounts());
  }

  getTransactions(accountId: string, range: DateRange): Promise<Transaction[]> {
    return this.cached(`transactions:${accountId}:${range.from}:${range.to}`, () =>
      this.inner.getTransactions(accountId, range),
    );
  }

  getInvoices(accountId: string): Promise<Invoice[]> {
    return this.cached(`invoices:${accountId}`, () => this.inner.getInvoices(accountId));
  }

  private cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const now = this.now();
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > now) return hit.value as Promise<T>;

    this.evictExpired(now);
    const value = load();
    const entry: Entry = { expiresAt: now + this.ttlMs, value };
    this.entries.set(key, entry);
    value.catch(() => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
    });
    return value;
  }

  private evictExpired(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }
}
