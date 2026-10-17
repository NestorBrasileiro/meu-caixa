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
import type { FinanceProvider } from '../integrations/finance-provider.js';
import { FinanceProviderRegistry } from '../integrations/open-finance/finance-provider.registry.js';

/** Chave do advisory lock que garante uma sincronização por vez. */
const SYNC_LOCK_KEY = 7_206_845_215_331_841;
const UPSERT_BATCH_SIZE = 500;
/** Quanto `runExclusive` espera uma sincronização em andamento terminar. */
const EXCLUSIVE_WAIT_MS = 30_000;
/** Provedores (`FinanceProvider.name`) dos dados reais e dos fictícios. */
const REAL_PROVIDER = 'pluggy';
const DEMO_PROVIDER = 'fake';
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
    private readonly providers: FinanceProviderRegistry,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Inicia uma sincronização em background. */
  async start(trigger: SyncTrigger): Promise<StartedSync> {
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

      // Resolvido com o lock em mãos: a configuração (ex.: troca de modo, que
      // também pega o lock) não muda no meio da execução.
      const provider = await this.providers.resolve();
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

  /**
   * Roda `work` com o lock da sincronização, para mudanças que apagam dados
   * sincronizados (troca de modo, remoção de banco) não se misturarem com uma
   * sincronização em andamento. Espera até `waitMs` uma que já esteja rodando
   * terminar; depois disso, `SyncInProgressError`.
   */
  async runExclusive<T>(work: () => Promise<T>, waitMs = EXCLUSIVE_WAIT_MS): Promise<T> {
    const deadline = Date.now() + waitMs;
    for (;;) {
      const lockClient = await this.pool.connect();
      let locked = false;
      try {
        const { rows } = await lockClient.query<{ locked: boolean }>(
          'select pg_try_advisory_lock($1) as locked',
          [SYNC_LOCK_KEY],
        );
        locked = rows[0]?.locked === true;
      } catch (error) {
        lockClient.release();
        throw error;
      }
      if (locked) {
        try {
          return await work();
        } finally {
          await releaseLock(lockClient);
        }
      }
      lockClient.release();

      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new SyncInProgressError();
      // A sincronização deste processo avisa quando acaba; a de outro
      // processo só dá para descobrir tentando de novo.
      await (this.current
        ? Promise.race([this.waitForIdle(), delay(remaining)])
        : delay(Math.min(remaining, 500)));
    }
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
    };
    const errors: string[] = [];
    let status: SyncStatus;
    this.logger.log(`Sincronização ${run.id} iniciada (${run.trigger}, ${run.provider})`);

    try {
      const connectionIds = await this.syncConnections(provider, stats);
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
      status = errors.length > 0 ? 'PARTIAL' : 'SUCCEEDED';
      if (provider.name === REAL_PROVIDER && stats.connections > 0) await this.dropDemoData();
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

  /**
   * Dados fictícios não se misturam com os reais: somem quando os bancos de
   * verdade chegam (ex.: a origem era `FINANCE_PROVIDER=fake` e passou a ser
   * a Pluggy sem uma troca explícita na tela, que já apagaria). O caminho
   * contrário não apaga nada sozinho: dados reais só saem por uma troca
   * explícita de modo.
   */
  private async dropDemoData(): Promise<void> {
    const removed = await this.db
      .delete(connections)
      .where(eq(connections.provider, DEMO_PROVIDER))
      .returning({ id: connections.id });
    if (removed.length > 0) {
      this.logger.log(`Dados fictícios apagados: ${removed.length} conexão(ões) do provedor fake`);
    }
  }

  private async syncConnections(
    provider: FinanceProvider,
    stats: SyncStats,
  ): Promise<Map<string, string>> {
    const fetched = await provider.getConnections();
    if (fetched.length === 0) return new Map();

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
      .returning({ id: connections.id, externalId: connections.externalId });

    stats.connections = rows.length;
    return new Map(rows.map((row) => [row.externalId, row.id]));
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

  /** Uma conta com problema não impede as outras de sincronizarem. */
  private async collect(errors: string[], context: string, work: () => Promise<void>) {
    try {
      await work();
    } catch (error) {
      errors.push(`${context}: ${describe(error)}`);
    }
  }
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
