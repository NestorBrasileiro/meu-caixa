import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import { accounts, connections } from '../database/schema.js';

@Injectable()
export class AccountsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  listConnections() {
    return this.db
      .select({
        id: connections.id,
        institutionName: connections.institutionName,
        institutionLogoUrl: connections.institutionLogoUrl,
        status: connections.status,
        lastRefreshedAt: connections.lastRefreshedAt,
        updatedAt: connections.updatedAt,
      })
      .from(connections)
      .orderBy(asc(connections.institutionName));
  }

  listAccounts() {
    return this.db
      .select({
        id: accounts.id,
        connectionId: accounts.connectionId,
        institutionName: connections.institutionName,
        connectionStatus: connections.status,
        type: accounts.type,
        name: accounts.name,
        number: accounts.number,
        currency: accounts.currency,
        balance: accounts.balance,
        creditLimit: accounts.creditLimit,
        availableCredit: accounts.availableCredit,
        transactionsSyncedThrough: accounts.transactionsSyncedThrough,
        updatedAt: accounts.updatedAt,
      })
      .from(accounts)
      .innerJoin(connections, eq(accounts.connectionId, connections.id))
      .orderBy(asc(connections.institutionName), asc(accounts.type), asc(accounts.name));
  }
}
