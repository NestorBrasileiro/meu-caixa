import { getTableColumns, sql, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

/**
 * Monta o `set` de um `ON CONFLICT DO UPDATE` copiando as colunas indicadas
 * da linha que tentou ser inserida (`excluded`) e atualizando `updated_at`.
 */
export function conflictUpdateSet<T extends PgTable>(
  table: T,
  keys: (keyof T['$inferInsert'] & string)[],
): Record<string, SQL> {
  const columns = getTableColumns(table) as Record<string, { name: string }>;
  const set: Record<string, SQL> = { updatedAt: sql`now()` };
  for (const key of keys) {
    const column = columns[key];
    if (!column) throw new Error(`Coluna desconhecida: ${key}`);
    set[key] = sql.raw(`excluded."${column.name}"`);
  }
  return set;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}
