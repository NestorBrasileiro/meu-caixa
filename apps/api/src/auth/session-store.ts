import { eq, lt } from 'drizzle-orm';
import session from 'express-session';
import type { Database } from '../database/database.module.js';
import { sessions } from '../database/schema.js';

const DAY_MS = 86_400_000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

type Callback = (error?: unknown) => void;

const expiryOf = (data: session.SessionData): Date =>
  data.cookie?.expires ? new Date(data.cookie.expires) : new Date(Date.now() + DAY_MS);

/**
 * Store do express-session no Postgres: logins sobrevivem a restart/deploy e
 * a memória não cresce com o número de sessões.
 */
export class PostgresSessionStore extends session.Store {
  private readonly cleanup: NodeJS.Timeout;

  constructor(private readonly db: Database) {
    super();
    this.cleanup = setInterval(() => void this.deleteExpired(), CLEANUP_INTERVAL_MS);
    this.cleanup.unref();
  }

  override get(sid: string, callback: (error: unknown, data?: session.SessionData | null) => void) {
    this.db
      .select()
      .from(sessions)
      .where(eq(sessions.sid, sid))
      .then(([row]) => {
        if (!row || row.expiresAt < new Date()) return callback(null, null);
        callback(null, row.data as session.SessionData);
      })
      .catch((error: unknown) => callback(error));
  }

  override set(sid: string, data: session.SessionData, callback?: Callback) {
    const expiresAt = expiryOf(data);
    this.db
      .insert(sessions)
      .values({ sid, data, expiresAt })
      .onConflictDoUpdate({ target: sessions.sid, set: { data, expiresAt } })
      .then(() => callback?.())
      .catch((error: unknown) => callback?.(error));
  }

  override destroy(sid: string, callback?: Callback) {
    this.db
      .delete(sessions)
      .where(eq(sessions.sid, sid))
      .then(() => callback?.())
      .catch((error: unknown) => callback?.(error));
  }

  override touch(sid: string, data: session.SessionData, callback?: Callback) {
    this.db
      .update(sessions)
      .set({ expiresAt: expiryOf(data) })
      .where(eq(sessions.sid, sid))
      .then(() => callback?.())
      .catch((error: unknown) => callback?.(error));
  }

  close(): void {
    clearInterval(this.cleanup);
  }

  private async deleteExpired(): Promise<void> {
    await this.db
      .delete(sessions)
      .where(lt(sessions.expiresAt, new Date()))
      .catch(() => undefined);
  }
}
