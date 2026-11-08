import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { MIGRATIONS_FOLDER } from '../src/database/migrate.js';
import * as schema from '../src/database/schema.js';
import { UsersService } from '../src/users/users.service.js';
import { TEST_DATABASE_URL } from './app.js';

/** Última migration antes do multiusuário. */
const BEFORE_MULTI_USER = '0006_anthropic_settings';
const DATABASE_NAME = 'meu_caixa_test_migration';

const DATA_TABLES = [
  'connections',
  'accounts',
  'transactions',
  'invoices',
  'sync_runs',
  'budget_categories',
  'commitments',
  'goals',
  'analysis_reports',
  'analysis_runs',
];

/** Banco próprio (a migration é destrutiva para o schema): recriado a cada caso. */
async function freshDatabase(): Promise<Pool> {
  const admin = new Pool({ connectionString: TEST_DATABASE_URL });
  try {
    await admin.query(`drop database if exists ${DATABASE_NAME} with (force)`);
    await admin.query(`create database ${DATABASE_NAME}`);
  } finally {
    await admin.end();
  }
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${DATABASE_NAME}`;
  return new Pool({ connectionString: url.href });
}

/** Cópia da pasta de migrations só até `lastTag` (o journal define o que roda). */
async function migrationsUntil(lastTag: string): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'meu-caixa-migrations-'));
  await cp(MIGRATIONS_FOLDER, folder, { recursive: true });
  const journalPath = join(folder, 'meta', '_journal.json');
  const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
    entries: { idx: number; tag: string }[];
  };
  const last = journal.entries.findIndex((entry) => entry.tag === lastTag);
  journal.entries = journal.entries.slice(0, last + 1);
  await writeFile(journalPath, JSON.stringify(journal));
  return folder;
}

/** Dados no formato de antes da 0007 (sem dono). */
async function insertLegacyData(pool: Pool, savedBy: string | null): Promise<void> {
  await pool.query(`
    insert into connections (id, provider, external_id, institution_name, status)
      values ('00000000-0000-4000-8000-000000000001', 'pluggy', 'item-1', 'Banco', 'ACTIVE');
    insert into accounts (id, connection_id, provider, external_id, type, name, currency, balance)
      values ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001',
              'pluggy', 'acc-1', 'CREDIT_CARD', 'Cartão', 'BRL', 100);
    insert into transactions (account_id, provider, external_id, date, description, amount, status)
      values ('00000000-0000-4000-8000-000000000002', 'pluggy', 'tx-1', '2026-10-01', 'Compra', -100, 'POSTED');
    insert into invoices (account_id, provider, external_id, due_date, total, currency)
      values ('00000000-0000-4000-8000-000000000002', 'pluggy', 'bill-1', '2026-10-10', 100, 'BRL');
    insert into sync_runs (provider, trigger, status) values ('pluggy', 'MANUAL', 'SUCCEEDED');
    insert into budget_categories (id, name, kind)
      values ('00000000-0000-4000-8000-000000000003', 'Mercado', 'ESSENTIAL');
    insert into commitments (name, amount, day_of_month, payment_method, category_id, starts_on)
      values ('Terreno', 230000, 10, 'BOLETO', '00000000-0000-4000-8000-000000000003', '2023-09-10');
    insert into goals (name, target, target_date, monthly_contribution, account_id)
      values ('Carro', 100, '2027-12-01', 10, '00000000-0000-4000-8000-000000000002');
    insert into analysis_reports (id, source, period_from, period_to, report)
      values ('00000000-0000-4000-8000-000000000004', 'MCP', '2026-09-01', '2026-09-30', '{}');
    insert into analysis_runs (status, report_id)
      values ('SUCCEEDED', '00000000-0000-4000-8000-000000000004');
  `);
  if (savedBy) {
    await pool.query(
      `insert into pluggy_settings (user_id, client_id, client_secret, item_ids)
         values ($1, 'client', 'v1:x:y:z', '["item"]')`,
      [savedBy],
    );
  }
}

describe('Migration 0007: dados de antes do multiusuário (e2e)', () => {
  let pool: Pool;
  let db: NodePgDatabase<typeof schema>;
  let folder: string;

  beforeAll(async () => {
    folder = await migrationsUntil(BEFORE_MULTI_USER);
  });

  beforeEach(async () => {
    pool = await freshDatabase();
    db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: folder });
  });

  afterEach(async () => {
    await pool.end();
  });

  afterAll(async () => {
    await rm(folder, { recursive: true, force: true });
    const admin = new Pool({ connectionString: TEST_DATABASE_URL });
    await admin.query(`drop database if exists ${DATABASE_NAME} with (force)`);
    await admin.end();
  });

  async function ownersOf(table: string): Promise<(string | null)[]> {
    const { rows } = await pool.query<{ user_id: string | null }>(`select user_id from ${table}`);
    return rows.map((row) => row.user_id);
  }

  it('tudo vai para quem salvou as configurações', async () => {
    await insertLegacyData(pool, 'kc-dono');
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    const { rows: users } = await pool.query<{ id: string; keycloak_id: string | null }>(
      'select id, keycloak_id from users',
    );
    expect(users).toEqual([{ id: expect.any(String), keycloak_id: 'kc-dono' }]);
    for (const table of [...DATA_TABLES, 'pluggy_settings']) {
      expect(await ownersOf(table), table).toEqual([users[0]!.id]);
    }

    // O dono continua sendo ele no próximo login.
    const service = new UsersService(db);
    expect(await service.resolve({ ...identity, sub: 'kc-dono' })).toBe(users[0]!.id);
  });

  it('sem configuração salva, o primeiro login assume os dados; o seguinte começa do zero', async () => {
    await insertLegacyData(pool, null);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    const { rows: users } = await pool.query<{ id: string; keycloak_id: string | null }>(
      'select id, keycloak_id from users',
    );
    expect(users).toEqual([{ id: users[0]!.id, keycloak_id: null }]);
    expect(await ownersOf('transactions')).toEqual([users[0]!.id]);

    const service = new UsersService(db);
    vi.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
    expect(await service.resolve({ ...identity, sub: 'kc-primeiro' })).toBe(users[0]!.id);
    const second = await service.resolve({ ...identity, sub: 'kc-segundo' });
    expect(second).not.toBe(users[0]!.id);
    expect(await service.resolve({ ...identity, sub: 'kc-primeiro' })).toBe(users[0]!.id);
  });

  it('banco vazio não ganha usuário nenhum', async () => {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    const { rows } = await pool.query('select id from users');
    expect(rows).toEqual([]);
  });
});

const identity = { sub: '', username: 'dono', name: 'Dono', email: null, roles: ['owner'] };
