import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import { appSettings } from '../database/schema.js';

/** Banco ou uma transação já aberta (`db.transaction(async (tx) => ...)`). */
export type DbExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export interface StoredSetting<T> {
  value: T;
  updatedAt: Date;
}

/**
 * Configurações editáveis pela interface (`app_settings`), uma linha por
 * chave com um valor JSON. Não sabe o que é segredo: quem grava cifra antes
 * (`SettingsCipher`).
 */
@Injectable()
export class AppSettingsStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getMany(keys: string[], executor: DbExecutor = this.db) {
    const rows = await executor.select().from(appSettings).where(inArray(appSettings.key, keys));
    return new Map<string, StoredSetting<unknown>>(
      rows.map((row) => [row.key, { value: row.value, updatedAt: row.updatedAt }]),
    );
  }

  async set(key: string, value: unknown, executor: DbExecutor = this.db): Promise<void> {
    await executor
      .insert(appSettings)
      .values({ key, value })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: sql`excluded.value`, updatedAt: sql`now()` },
      });
  }

  async delete(key: string, executor: DbExecutor = this.db): Promise<boolean> {
    const deleted = await executor
      .delete(appSettings)
      .where(eq(appSettings.key, key))
      .returning({ key: appSettings.key });
    return deleted.length > 0;
  }

  /**
   * Lê e regrava uma chave atomicamente (`SELECT ... FOR UPDATE` numa
   * transação), para duas requisições ao mesmo tempo não perderem a escrita
   * uma da outra. `update` recebe o valor atual (`undefined` se não existe) e
   * devolve o novo; o resultado de `update` é repassado.
   */
  async update<T, R>(
    key: string,
    update: (current: unknown, tx: DbExecutor) => Promise<{ value: T; result: R }>,
    executor?: DbExecutor,
  ): Promise<R> {
    const run = async (tx: DbExecutor) => {
      // Garante a linha para o FOR UPDATE ter o que travar.
      await tx
        .insert(appSettings)
        .values({ key, value: sql`'null'::jsonb` })
        .onConflictDoNothing();
      const [row] = await tx
        .select()
        .from(appSettings)
        .where(eq(appSettings.key, key))
        .for('update');
      const { value, result } = await update(row?.value ?? undefined, tx);
      await this.set(key, value, tx);
      return result;
    };
    return executor ? run(executor) : this.db.transaction(run);
  }

  /** Mescla campos num objeto JSON (`value || patch`), sem ler antes. */
  async merge(key: string, patch: Record<string, unknown>, executor: DbExecutor = this.db) {
    await executor
      .insert(appSettings)
      .values({ key, value: patch })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: {
          value: sql`coalesce(nullif(${appSettings.value}, 'null'::jsonb), '{}'::jsonb) || excluded.value`,
          updatedAt: sql`now()`,
        },
      });
  }

  /** Remove um campo de um objeto JSON (`value - campo`). */
  async removeField(key: string, field: string, executor: DbExecutor = this.db): Promise<void> {
    await executor
      .update(appSettings)
      .set({ value: sql`${appSettings.value} - ${field}::text`, updatedAt: sql`now()` })
      .where(eq(appSettings.key, key));
  }
}
