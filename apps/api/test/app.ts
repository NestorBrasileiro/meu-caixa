import type { CanActivate, ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import type { Request } from 'express';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AuthGuard } from '../src/auth/auth.guard.js';
import type { AuthUser } from '../src/auth/auth.types.js';
import { ANTHROPIC_CLIENT } from '../src/claude/anthropic.client.js';
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

export const FRONTEND_URL = 'http://frontend.test';

export const TEST_USER: AuthUser = {
  id: 'test-user',
  username: 'teste',
  name: 'Teste',
  email: 'teste@example.com',
  roles: ['owner'],
};

/** Substitui o login do Keycloak nos testes que não são sobre autenticação. */
class AuthenticatedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest<Request>().user = TEST_USER;
    return true;
  }
}

export interface TestAppOptions {
  env?: Record<string, string>;
  /** Usa o `AuthGuard` de verdade (precisa de um Keycloak, ex.: `FakeKeycloak`). */
  realAuth?: boolean;
  /** Cliente da Anthropic no lugar do real (ex.: `FakeClaude.client`). */
  anthropic?: unknown;
}

export async function createTestApp(
  provider: FinanceProvider,
  options: TestAppOptions = {},
): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ENV)
    .useValue(
      validateEnv({
        NODE_ENV: 'test',
        DATABASE_URL: TEST_DATABASE_URL,
        DATABASE_MIGRATE_ON_START: 'true',
        FINANCE_PROVIDER: 'fake',
        SYNC_ENABLED: 'false',
        APP_URL: 'http://api.test',
        FRONTEND_URL,
        SESSION_SECRET: 'segredo-de-sessao-dos-testes-com-32-caracteres',
        KEYCLOAK_CLIENT_SECRET: 'segredo-de-teste',
        ...options.env,
      }),
    )
    .overrideProvider(FINANCE_PROVIDER)
    .useValue(provider);
  if (options.anthropic) {
    builder = builder.overrideProvider(ANTHROPIC_CLIENT).useValue(options.anthropic);
  }
  if (!options.realAuth) {
    builder = builder.overrideProvider(AuthGuard).useValue(new AuthenticatedGuard());
  }

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  return app;
}

export async function resetDatabase(app: INestApplication): Promise<void> {
  const db = app.get<Database>(DATABASE);
  await db.execute(
    sql`truncate table sync_runs, invoices, transactions, accounts, connections, sessions, commitments, goals, budget_categories, analysis_runs, analysis_reports cascade`,
  );
}
