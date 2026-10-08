import { addDays } from '../../domain/dates.js';
import type {
  Account,
  Connection,
  DateRange,
  Invoice,
  Profile,
  Transaction,
} from '../../domain/finance.js';
import type { FinanceProvider } from '../finance-provider.js';
import type { PluggyClient } from './pluggy.client.js';
import { mapAccount, mapBill, mapIdentity, mapItem, mapTransaction } from './pluggy.mapper.js';

export interface PluggyProviderOptions {
  /** Ids dos items (bancos conectados) no Meu Pluggy. */
  itemIds: string[];
  timeZone: string;
}

const EMPTY_PROFILE: Profile = { fullName: null, document: null, email: null };

export class PluggyProvider implements FinanceProvider {
  readonly name = 'pluggy';

  constructor(
    private readonly client: PluggyClient,
    private readonly options: PluggyProviderOptions,
  ) {}

  async getProfile(): Promise<Profile> {
    // Meu Pluggy só conecta contas do mesmo titular: o primeiro cadastro basta.
    for (const itemId of this.options.itemIds) {
      const identity = await this.client.getIdentity(itemId);
      if (identity) return mapIdentity(identity);
    }
    return EMPTY_PROFILE;
  }

  async getConnections(): Promise<Connection[]> {
    const items = await Promise.all(this.options.itemIds.map((id) => this.client.getItem(id)));
    return items.map(mapItem);
  }

  async getAccounts(): Promise<Account[]> {
    const accounts: Account[] = [];
    for (const itemId of this.options.itemIds) {
      const raw = await this.client.listAccounts(itemId);
      accounts.push(...raw.map(mapAccount));
    }
    return accounts;
  }

  async getTransactions(accountId: string, range: DateRange): Promise<Transaction[]> {
    // A Pluggy filtra por instante UTC; a janela vai 1 dia além para cada lado
    // e o recorte exato acontece depois, já na data local.
    const raw = await this.client.listTransactions(accountId, {
      dateFrom: addDays(range.from, -1),
      dateTo: addDays(range.to, 1),
    });
    return raw
      .map((transaction) => mapTransaction(transaction, this.options.timeZone))
      .filter((transaction) => transaction.date >= range.from && transaction.date <= range.to);
  }

  async getInvoices(accountId: string): Promise<Invoice[]> {
    const bills = await this.client.listBills(accountId);
    return bills.map((bill) => mapBill(bill, accountId, this.options.timeZone));
  }
}
