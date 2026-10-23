import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, gte, inArray, lte, notInArray } from 'drizzle-orm';
import type { Pool, PoolClient } from 'pg';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DATABASE, PG_POOL, type Database } from '../database/database.module.js';
import {
  accounts,
  connections,
  invoices,
  loans,
  syncRuns,
  transactions,
  type AccountRow,
  type SyncRunRow,
  type SyncStats,
  type SyncStatus,
  type SyncTrigger,
} from '../database/schema.js';
import { chunk, conflictUpdateSet } from '../database/upsert.js';
import { addDays, today } from '../domain/dates.js';
import {
  FINANCE_PROVIDER_SOURCE,
  type FinanceProvider,
  type FinanceProviderSource,
} from '../integrations/finance-provider.js';

/** Chave do advisory lock que garante uma sincronização por vez. */
const SYNC_LOCK_KEY = 7_206_845_215_331_841;
const UPSERT_BATCH_SIZE = 500;
export const INTERRUPTED_RUN_ERROR = 'Interrompida: a sincronização anterior não terminou';

export class SyncInProgressError extends Error {
  constructor() {
    super('Já existe uma sincronização em andamento');
    this.name = 'SyncInProgressError';
  }
}

export interface StartedSync {
  run: SyncRunRow;
  /** Resolve com o registro final da execução. */
  completion: Promise<SyncRunRow>;
}

/**
 * Copia os dados do provedor para o Postgres. O app sempre lê do banco, então
 * a disponibilidade do agregador só afeta o frescor dos dados, não as telas.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private current: Promise<SyncRunRow> | null = null;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(FINANCE_PROVIDER_SOURCE) private readonly providers: FinanceProviderSource,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Inicia uma sincronização em background. Sem provedor configurado, falha
   * com `ProviderNotConfiguredError` antes de registrar a execução.
   */
  async start(trigger: SyncTrigger): Promise<StartedSync> {
    const provider = await this.providers.get();
    const lockClient = await this.pool.connect();
    let locked = false;
    try {
      const { rows } = await lockClient.query<{ locked: boolean }>(
        'select pg_try_advisory_lock($1) as locked',
        [SYNC_LOCK_KEY],
      );
      locked = rows[0]?.locked === true;
      if (!locked) throw new SyncInProgressError();
      await this.failInterruptedRuns();

      const [run] = await this.db
        .insert(syncRuns)
        .values({ provider: provider.name, trigger, status: 'RUNNING' })
        .returning();
      const completion = this.execute(run!, provider).finally(() => {
        this.current = null;
        return releaseLock(lockClient);
      });
      // Marca a rejeição como tratada; quem aguarda `completion` ainda a recebe.
      completion.catch((error: unknown) =>
        this.logger.error(`Sincronização ${run!.id} não pôde ser finalizada`, error),
      );
      this.current = completion;
      return { run: run!, completion };
    } catch (error) {
      if (locked) await releaseLock(lockClient);
      else lockClient.release();
      throw error;
    }
  }

  /** Executa uma sincronização e aguarda o fim. */
  async run(trigger: SyncTrigger): Promise<SyncRunRow> {
    const { completion } = await this.start(trigger);
    return completion;
  }

  async waitForIdle(): Promise<void> {
    await this.current?.catch(() => undefined);
  }

  async listRuns(limit: number): Promise<SyncRunRow[]> {
    return this.db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(limit);
  }

  async lastFinishedRun(): Promise<SyncRunRow | undefined> {
    const [run] = await this.db
      .select()
      .from(syncRuns)
      .where(inArray(syncRuns.status, ['SUCCEEDED', 'PARTIAL']))
      .orderBy(desc(syncRuns.startedAt))
      .limit(1);
    return run;
  }

  /**
   * Execuções que ficaram RUNNING (o processo caiu no meio). Só é chamado com o
   * lock em mãos, o que prova que nenhuma delas está viva.
   */
  private async failInterruptedRuns(): Promise<void> {
    const interrupted = await this.db
      .update(syncRuns)
      .set({ status: 'FAILED', finishedAt: new Date(), errors: [INTERRUPTED_RUN_ERROR] })
      .where(eq(syncRuns.status, 'RUNNING'))
      .returning({ id: syncRuns.id });
    for (const { id } of interrupted) {
      this.logger.warn(`Sincronização ${id} marcada como falha: não terminou`);
    }
  }

  private async execute(run: SyncRunRow, provider: FinanceProvider): Promise<SyncRunRow> {
    const stats: SyncStats = {
      connections: 0,
      accounts: 0,
      transactions: 0,
      removedPendingTransactions: 0,
      invoices: 0,
      loans: 0,
    };
    const errors: string[] = [];
    let status: SyncStatus;
    this.logger.log(`Sincronização ${run.id} iniciada (${run.trigger}, ${run.provider})`);

    try {
      const connectionRows = await this.syncConnections(provider, stats);
      const connectionIds = new Map(connectionRows.map((row) => [row.externalId, row.id]));
      const accountRows = await this.syncAccounts(provider, connectionIds, stats, errors);
      for (const account of accountRows) {
        await this.collect(errors, `Transações de "${account.name}"`, () =>
          this.syncTransactions(provider, account, stats),
        );
        if (account.type === 'CREDIT_CARD') {
          await this.collect(errors, `Faturas de "${account.name}"`, () =>
            this.syncInvoices(provider, account, stats),
          );
        }
      }
      for (const connection of connectionRows) {
        await this.collect(errors, `Empréstimos de "${connection.institutionName}"`, () =>
          this.syncLoans(provider, connection, stats),
        );
      }
      status = errors.length > 0 ? 'PARTIAL' : 'SUCCEEDED';
    } catch (error) {
      errors.push(describe(error));
      status = 'FAILED';
    }

    const [finished] = await this.db
      .update(syncRuns)
      .set({ status, finishedAt: new Date(), stats, errors })
      .where(eq(syncRuns.id, run.id))
      .returning();

    const summary = `Sincronização ${run.id} terminou: ${status} ${JSON.stringify(stats)}`;
    if (status === 'SUCCEEDED') this.logger.log(summary);
    else this.logger.warn(`${summary}\n${errors.join('\n')}`);
    return finished!;
  }

  private async syncConnections(
    provider: FinanceProvider,
    stats: SyncStats,
  ): Promise<SyncedConnection[]> {
    const fetched = await provider.getConnections();
    if (fetched.length === 0) return [];

    const rows = await this.db
      .insert(connections)
      .values(fetched.map((connection) => ({ ...connection, provider: provider.name })))
      .onConflictDoUpdate({
        target: [connections.provider, connections.externalId],
        set: conflictUpdateSet(connections, [
          'institutionName',
          'institutionLogoUrl',
          'status',
          'lastRefreshedAt',
        ]),
      })
      .returning({
        id: connections.id,
        externalId: connections.externalId,
        institutionName: connections.institutionName,
      });

    stats.connections = rows.length;
    return rows;
  }

  private async syncAccounts(
    provider: FinanceProvider,
    connectionIds: Map<string, string>,
    stats: SyncStats,
    errors: string[],
  ): Promise<AccountRow[]> {
    const fetched = await provider.getAccounts();
    const values = fetched.flatMap(({ connectionExternalId, ...account }) => {
      const connectionId = connectionIds.get(connectionExternalId);
      if (!connectionId) {
        errors.push(`Conta "${account.name}" pertence a uma conexão desconhecida`);
        return [];
      }
      return [{ ...account, connectionId, provider: provider.name }];
    });
    if (values.length === 0) return [];

    const rows = await this.db
      .insert(accounts)
      .values(values)
      .onConflictDoUpdate({
        target: [accounts.provider, accounts.externalId],
        set: conflictUpdateSet(accounts, [
          'connectionId',
          'type',
          'name',
          'number',
          'currency',
          'balance',
          'creditLimit',
          'availableCredit',
        ]),
      })
      .returning();

    stats.accounts = rows.length;
    return rows;
  }

  private async syncTransactions(
    provider: FinanceProvider,
    account: AccountRow,
    stats: SyncStats,
  ): Promise<void> {
    const to = today(this.env.TIMEZONE);
    // Incremental: volta alguns dias para pegar pendentes que viraram efetivadas.
    const incrementalFrom = account.transactionsSyncedThrough
      ? addDays(account.transactionsSyncedThrough, -this.env.SYNC_OVERLAP_DAYS)
      : addDays(to, -this.env.SYNC_LOOKBACK_DAYS);
    const from = incrementalFrom < to ? incrementalFrom : to;

    const fetched = await provider.getTransactions(account.externalId, { from, to });
    const values = fetched.map(({ accountExternalId: _account, installment, ...transaction }) => ({
      ...transaction,
      accountId: account.id,
      provider: provider.name,
      installmentNumber: installment?.number ?? null,
      installmentTotal: installment?.total ?? null,
    }));

    await this.db.transaction(async (tx) => {
      for (const batch of chunk(values, UPSERT_BATCH_SIZE)) {
        await tx
          .insert(transactions)
          .values(batch)
          .onConflictDoUpdate({
            target: [transactions.provider, transactions.externalId],
            set: conflictUpdateSet(transactions, [
              'accountId',
              'date',
              'description',
              'amount',
              'status',
              'category',
              'paymentMethod',
              'counterpartyName',
              'installmentNumber',
              'installmentTotal',
              'invoiceExternalId',
            ]),
          });
      }

      // Pendentes que sumiram da janela foram canceladas ou substituídas.
      const seen = values.map((value) => value.externalId);
      const removed = await tx
        .delete(transactions)
        .where(
          and(
            eq(transactions.accountId, account.id),
            eq(transactions.status, 'PENDING'),
            gte(transactions.date, from),
            lte(transactions.date, to),
            seen.length > 0 ? notInArray(transactions.externalId, seen) : undefined,
          ),
        )
        .returning({ id: transactions.id });

      await tx
        .update(accounts)
        .set({ transactionsSyncedThrough: to })
        .where(eq(accounts.id, account.id));

      stats.transactions += values.length;
      stats.removedPendingTransactions += removed.length;
    });
  }

  private async syncInvoices(
    provider: FinanceProvider,
    account: AccountRow,
    stats: SyncStats,
  ): Promise<void> {
    const fetched = await provider.getInvoices(account.externalId);
    if (fetched.length === 0) return;

    await this.db
      .insert(invoices)
      .values(
        fetched.map(({ accountExternalId: _account, ...invoice }) => ({
          ...invoice,
          accountId: account.id,
          provider: provider.name,
        })),
      )
      .onConflictDoUpdate({
        target: [invoices.provider, invoices.externalId],
        set: conflictUpdateSet(invoices, [
          'accountId',
          'dueDate',
          'closingDate',
          'total',
          'minimumPayment',
          'currency',
        ]),
      });
    stats.invoices += fetched.length;
  }

  /**
   * Espelha os empréstimos da conexão: grava os que vieram e apaga os que
   * sumiram (quitados). Se o banco não compartilha empréstimos (`null`), não
   * mexe no que já estava gravado.
   */
  private async syncLoans(
    provider: FinanceProvider,
    connection: SyncedConnection,
    stats: SyncStats,
  ): Promise<void> {
    const fetched = await provider.getLoans(connection.externalId);
    if (fetched === null) {
      this.logger.warn(
        `"${connection.institutionName}" não compartilha empréstimos; seguindo sem eles`,
      );
      return;
    }

    const values = fetched.map(
      ({ connectionExternalId: _connection, installments, raw, ...loan }) => ({
        ...loan,
        connectionId: connection.id,
        provider: provider.name,
        installmentsTotal: installments.total,
        installmentsPaid: installments.paid,
        installmentsRemaining: installments.remaining,
        installmentsOverdue: installments.overdue,
        raw: raw ?? null,
      }),
    );

    await this.db.transaction(async (tx) => {
      for (const batch of chunk(values, UPSERT_BATCH_SIZE)) {
        await tx
          .insert(loans)
          .values(batch)
          .onConflictDoUpdate({
            target: [loans.provider, loans.externalId],
            set: conflictUpdateSet(loans, [
              'connectionId',
              'productName',
              'type',
              'contractNumber',
              'contractedAmount',
              'outstandingBalance',
              'currency',
              'contractDate',
              'finalDueDate',
              'firstInstallmentDueDate',
              'periodicity',
              'periodicityLabel',
              'installmentsTotal',
              'installmentsPaid',
              'installmentsRemaining',
              'installmentsOverdue',
              'installmentAmount',
              'scheduledInstallments',
              'interestRateAnnual',
              'cetAnnual',
              'raw',
            ]),
          });
      }

      const seen = values.map((value) => value.externalId);
      await tx
        .delete(loans)
        .where(
          and(
            eq(loans.connectionId, connection.id),
            seen.length > 0 ? notInArray(loans.externalId, seen) : undefined,
          ),
        );
    });
    stats.loans = (stats.loans ?? 0) + values.length;
  }

  /** Uma conta com problema não impede as outras de sincronizarem. */
  private async collect(errors: string[], context: string, work: () => Promise<void>) {
    try {
      await work();
    } catch (error) {
      errors.push(`${context}: ${describe(error)}`);
    }
  }
}

interface SyncedConnection {
  id: string;
  externalId: string;
  institutionName: string;
}

async function releaseLock(client: PoolClient): Promise<void> {
  try {
    await client.query('select pg_advisory_unlock($1)', [SYNC_LOCK_KEY]);
    client.release();
  } catch (error) {
    // Descarta a conexão: devolvê-la ao pool manteria o lock preso.
    client.release(error as Error);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
