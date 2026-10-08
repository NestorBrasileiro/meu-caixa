import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { runMigrations } from './migrate.js';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

export const PG_POOL = Symbol('PG_POOL');
export const DATABASE = Symbol('DATABASE');

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ENV],
      useFactory: (env: Env) => new Pool({ connectionString: env.DATABASE_URL, max: 10 }),
    },
    {
      provide: DATABASE,
      inject: [PG_POOL],
      useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
    },
  ],
  exports: [PG_POOL, DATABASE],
})
export class DatabaseModule implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.env.DATABASE_MIGRATE_ON_START) {
      await runMigrations(this.db);
      this.logger.log('Migrations aplicadas');
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
