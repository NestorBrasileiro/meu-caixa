import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { AppModule } from '../src/app.module.js';
import { ENV } from '../src/config/config.module.js';
import { validateEnv } from '../src/config/env.js';
import { DATABASE, type Database } from '../src/database/database.module.js';
import { FINANCE_PROVIDER, type FinanceProvider } from '../src/integrations/finance-provider.js';

/**
 * Variável própria (e não DATABASE_URL) porque os testes apagam as tabelas:
 * assim nunca apontam para o banco de desenvolvimento por acidente.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/meu_caixa_test';

export async function createTestApp(
  provider: FinanceProvider,
  env: Record<string, string> = {},
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue(
      validateEnv({
        NODE_ENV: 'test',
        DATABASE_URL: TEST_DATABASE_URL,
        DATABASE_MIGRATE_ON_START: 'true',
        FINANCE_PROVIDER: 'fake',
        SYNC_ENABLED: 'false',
        ...env,
      }),
    )
    .overrideProvider(FINANCE_PROVIDER)
    .useValue(provider)
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  return app;
}

export async function resetDatabase(app: INestApplication): Promise<void> {
  const db = app.get<Database>(DATABASE);
  await db.execute(
    sql`truncate table sync_runs, invoices, transactions, accounts, connections cascade`,
  );
}
