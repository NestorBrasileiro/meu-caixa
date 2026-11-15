import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, gte, inArray, lt, lte, min, notInArray, or } from 'drizzle-orm';
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
  users,
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
import { carryUserCategories } from './reissued.js';

/**
 * Advisory lock de duas chaves: esta (o "espaço" das sincronizações) e o hash
 * do usuário, para uma sincronização por vez por usuário.
 */
const SYNC_LOCK_NAMESPACE = 720_684_521;
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
  private readonly running = new Set<Promise<unknown>>();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(FINANCE_PROVIDER_SOURCE) private readonly providers: FinanceProviderSource,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Inicia uma sincronização do usuário em background. Sem provedor
   * configurado, falha com `ProviderNotConfiguredError` antes de registrar a
   * execução. `full`: "Ressincronizar tudo" — busca o histórico inteiro e
   * espelha o que o banco devolve (limpa duplicatas e pendentes antigas).
   */
  async start(
    userId: string,
    trigger: SyncTrigger,
    options: { full?: boolean } = {},
  ): Promise<StartedSync> {
    const provider = await this.providers.get(userId);
    const lockClient = await this.pool.connect();
    let locked = false;
    try {
      const { rows } = await lockClient.query<{ locked: boolean }>(
        'select pg_try_advisory_lock($1, hashtext($2)) as locked',
        [SYNC_LOCK_NAMESPACE, userId],
      );
      locked = rows[0]?.locked === true;
      if (!locked) throw new SyncInProgressError();
      await this.failInterruptedRuns(userId);

      const [run] = await this.db
        .insert(syncRuns)
        .values({ userId, provider: provider.name, trigger, status: 'RUNNING' })
        .returning();
      const completion = this.execute(run!, provider, options.full === true).finally(() =>
        releaseLock(lockClient, userId),
      );
      // Marca a rejeição como tratada; quem aguarda `completion` ainda a recebe.
      const tracked = completion.catch((error: unknown) =>
        this.logger.error(`Sincronização ${run!.id} não pôde ser finalizada`, error),
      );
      this.running.add(tracked);
      void tracked.finally(() => this.running.delete(tracked));
      return { run: run!, completion };
    } catch (error) {
      if (locked) await releaseLock(lockClient, userId);
      else lockClient.release();
      throw error;
    }
  }

  /** Executa uma sincronização do usuário e aguarda o fim. */
  async run(
    userId: string,
    trigger: SyncTrigger,
    options: { full?: boolean } = {},
  ): Promise<SyncRunRow> {
    const { completion } = await this.start(userId, trigger, options);
    return completion;
  }

  async waitForIdle(): Promise<void> {
    await Promise.all(this.running);
  }

  /**
   * Usuários que o agendador sincroniza: os que cadastraram a Pluggy ou, com
   * o provedor fake, todos.
   */
  async scheduledUserIds(): Promise<string[]> {
    const configured = await this.providers.configuredUserIds();
    if (configured) return configured;
    const rows = await this.db.select({ id: users.id }).from(users);
    return rows.map((row) => row.id);
  }

  async listRuns(userId: string, limit: number): Promise<SyncRunRow[]> {
    return this.db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.userId, userId))
      .orderBy(desc(syncRuns.startedAt))
      .limit(limit);
  }

  async lastFinishedRun(userId: string): Promise<SyncRunRow | undefined> {
    const [run] = await this.db
      .select()
      .from(syncRuns)
      .where(and(eq(syncRuns.userId, userId), inArray(syncRuns.status, ['SUCCEEDED', 'PARTIAL'])))
      .orderBy(desc(syncRuns.startedAt))
      .limit(1);
    return run;
  }

  /**
   * Execuções do usuário que ficaram RUNNING (o processo caiu no meio). Só é
   * chamado com o lock do usuário em mãos, o que prova que nenhuma está viva.
   */
  private async failInterruptedRuns(userId: string): Promise<void> {
    const interrupted = await this.db
      .update(syncRuns)
      .set({ status: 'FAILED', finishedAt: new Date(), errors: [INTERRUPTED_RUN_ERROR] })
      .where(and(eq(syncRuns.userId, userId), eq(syncRuns.status, 'RUNNING')))
      .returning({ id: syncRuns.id });
    for (const { id } of interrupted) {
      this.logger.warn(`Sincronização ${id} marcada como falha: não terminou`);
    }
  }

  private async execute(
    run: SyncRunRow,
    provider: FinanceProvider,
    full: boolean,
  ): Promise<SyncRunRow> {
    const stats: SyncStats = {
      connections: 0,
      accounts: 0,
      transactions: 0,
      removedPendingTransactions: 0,
      removedPostedTransactions: 0,
      invoices: 0,
      loans: 0,
      ...(full ? { full: true } : {}),
    };
    const errors: string[] = [];
    let status: SyncStatus;
    this.logger.log(`Sincronização ${run.id} iniciada (${run.trigger}, ${run.provider})`);

    try {
      const connectionRows = await this.syncConnections(run.userId, provider, stats);
      const connectionIds = new Map(connectionRows.map((row) => [row.externalId, row.id]));
      const accountRows = await this.syncAccounts(
        run.userId,
        provider,
        connectionIds,
        stats,
        errors,
      );
      for (const account of accountRows) {
        await this.collect(errors, `Transações de "${account.name}"`, () =>
          this.syncTransactions(provider, account, stats, full),
        );
        if (account.type === 'CREDIT_CARD') {
          await this.collect(errors, `Faturas de "${account.name}"`, () =>
            this.syncInvoices(provider, account, stats),
          );
        }
      }
      for (const connection of connectionRows) {
        await this.collect(errors, `Empréstimos de "${connection.institutionName}"`, () =>
          this.syncLoans(run.userId, provider, connection, stats),
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
    userId: string,
    provider: FinanceProvider,
    stats: SyncStats,
  ): Promise<SyncedConnection[]> {
    const fetched = await provider.getConnections();
    if (fetched.length === 0) return [];

    const rows = await this.db
      .insert(connections)
      .values(fetched.map((connection) => ({ ...connection, userId, provider: provider.name })))
      .onConflictDoUpdate({
        target: [connections.userId, connections.provider, connections.externalId],
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
    userId: string,
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
      return [{ ...account, userId, connectionId, provider: provider.name }];
    });
    if (values.length === 0) return [];

    const rows = await this.db
      .insert(accounts)
      .values(values)
      .onConflictDoUpdate({
        target: [accounts.userId, accounts.provider, accounts.externalId],
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
    full: boolean,
  ): Promise<void> {
    const to = today(this.env.TIMEZONE);
    const lookbackFrom = addDays(to, -this.env.SYNC_LOOKBACK_DAYS);
    // Incremental: volta alguns dias para pegar pendentes que viraram efetivadas.
    let from =
      full || !account.transactionsSyncedThrough
        ? lookbackFrom
        : addDays(account.transactionsSyncedThrough, -this.env.SYNC_OVERLAP_DAYS);
    // Pendente de cartão pode levar mais que a sobreposição para virar efetivada, que às
    // vezes chega com outro id e com data anterior: a janela vai até a pendente mais antiga
    // gravada, com a mesma folga da sobreposição antes dela.
    const [oldest] = await this.db
      .select({ date: min(transactions.date) })
      .from(transactions)
      .where(and(eq(transactions.accountId, account.id), eq(transactions.status, 'PENDING')));
    if (oldest?.date) {
      const reach = addDays(oldest.date, -this.env.SYNC_OVERLAP_DAYS);
      if (reach < from) from = reach;
    }
    if (from < lookbackFrom) from = lookbackFrom;
    if (from > to) from = to;

    const fetched = await provider.getTransactions(account.externalId, { from, to });
    const values = fetched.map(({ accountExternalId: _account, installment, ...transaction }) => ({
      ...transaction,
      userId: account.userId,
      accountId: account.id,
      provider: provider.name,
      installmentNumber: installment?.number ?? null,
      installmentTotal: installment?.total ?? null,
    }));

    await this.db.transaction(async (tx) => {
      const stored = await tx
        .select({
          id: transactions.id,
          externalId: transactions.externalId,
          status: transactions.status,
          date: transactions.date,
          amount: transactions.amount,
          description: transactions.description,
          userCategory: transactions.userCategory,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.accountId, account.id),
            or(
              and(gte(transactions.date, from), lte(transactions.date, to)),
              // Pendente de antes da janela de busca inteira nunca vai voltar.
              and(eq(transactions.status, 'PENDING'), lt(transactions.date, from)),
            ),
          ),
        );

      for (const batch of chunk(values, UPSERT_BATCH_SIZE)) {
        await tx
          .insert(transactions)
          .values(batch)
          .onConflictDoUpdate({
            target: [transactions.userId, transactions.provider, transactions.externalId],
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

      // Espelho da janela buscada: o que está gravado nela e o banco não devolveu foi
      // cancelado (pendente) ou reemitido com outro id (pendente que virou efetivada,
      // efetivada duplicada). Só depois de a busca inteira dar certo.
      const seen = new Set(values.map((value) => value.externalId));
      const gone = stored.filter((row) => !seen.has(row.externalId));
      const known = new Set(stored.map((row) => row.externalId));
      // Quem pode herdar a categoria editada: as que chegaram agora e, para a cópia
      // duplicada que some, a gêmea que fica (se ainda não tiver categoria própria).
      const heirs = [
        ...values.filter((value) => !known.has(value.externalId)),
        ...stored.filter((row) => seen.has(row.externalId) && row.userCategory === null),
      ];
      for (const { from: old, to: replacement } of carryUserCategories(gone, heirs)) {
        await tx
          .update(transactions)
          .set({ userCategory: old.userCategory, updatedAt: new Date() })
          .where(
            and(
              eq(transactions.userId, account.userId),
              eq(transactions.provider, provider.name),
              eq(transactions.externalId, replacement.externalId),
            ),
          );
      }
      if (gone.length > 0) {
        await tx.delete(transactions).where(
          inArray(
            transactions.id,
            gone.map((row) => row.id),
          ),
        );
      }

      await tx
        .update(accounts)
        .set({ transactionsSyncedThrough: to })
        .where(eq(accounts.id, account.id));

      stats.transactions += values.length;
      stats.removedPendingTransactions += gone.filter((row) => row.status === 'PENDING').length;
      stats.removedPostedTransactions =
        (stats.removedPostedTransactions ?? 0) +
        gone.filter((row) => row.status === 'POSTED').length;
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
          userId: account.userId,
          accountId: account.id,
          provider: provider.name,
        })),
      )
      .onConflictDoUpdate({
        target: [invoices.userId, invoices.provider, invoices.externalId],
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
    userId: string,
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
        userId,
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
            target: [loans.userId, loans.provider, loans.externalId],
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

async function releaseLock(client: PoolClient, userId: string): Promise<void> {
  try {
    await client.query('select pg_advisory_unlock($1, hashtext($2))', [
      SYNC_LOCK_NAMESPACE,
      userId,
    ]);
    client.release();
  } catch (error) {
    // Descarta a conexão: devolvê-la ao pool manteria o lock preso.
    client.release(error as Error);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
