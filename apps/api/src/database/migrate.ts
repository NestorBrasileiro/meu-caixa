import { fileURLToPath } from 'node:url';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

/** Pasta `drizzle/` na raiz do app — mesma posição relativa em `src/` e `dist/`. */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

export async function runMigrations(db: NodePgDatabase<Record<string, unknown>>): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
