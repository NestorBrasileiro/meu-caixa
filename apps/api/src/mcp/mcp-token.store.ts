import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import { mcpTokens } from '../database/schema.js';

/** Prefixo dos tokens pessoais: separa do access token do Keycloak sem consultar nada. */
export const MCP_TOKEN_PREFIX = 'mcx_';
/** `last_used_at` é só informativo: grava no máximo uma vez por minuto. */
const LAST_USED_RESOLUTION_MS = 60_000;

export interface McpTokenView {
  exists: boolean;
  /** Últimos caracteres do token, para reconhecê-lo. */
  hint: string | null;
  createdAt: Date | null;
  lastUsedAt: Date | null;
}

/**
 * Token pessoal do MCP (Claude Code/Desktop sem OAuth), um por usuário. Só o
 * sha256 fica no banco: o token em si aparece uma vez, quando é gerado.
 */
@Injectable()
export class McpTokenStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async view(userId: string): Promise<McpTokenView> {
    const [row] = await this.db.select().from(mcpTokens).where(eq(mcpTokens.userId, userId));
    return {
      exists: row !== undefined,
      hint: row?.hint ?? null,
      createdAt: row?.createdAt ?? null,
      lastUsedAt: row?.lastUsedAt ?? null,
    };
  }

  /** Gera um token novo (o anterior deixa de valer) e o devolve, só desta vez. */
  async issue(userId: string): Promise<string> {
    const token = MCP_TOKEN_PREFIX + randomBytes(32).toString('base64url');
    const values = {
      tokenHash: digest(token),
      hint: token.slice(-4),
      createdAt: new Date(),
      lastUsedAt: null,
    };
    await this.db
      .insert(mcpTokens)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: mcpTokens.userId, set: values });
    return token;
  }

  async revoke(userId: string): Promise<void> {
    await this.db.delete(mcpTokens).where(eq(mcpTokens.userId, userId));
  }

  /** Dono do token, ou `null` se ele não existe (ou foi revogado). */
  async findUser(token: string): Promise<string | null> {
    const hash = digest(token);
    const [row] = await this.db
      .select({ userId: mcpTokens.userId })
      .from(mcpTokens)
      .where(eq(mcpTokens.tokenHash, hash));
    if (!row) return null;
    const now = new Date();
    await this.db
      .update(mcpTokens)
      .set({ lastUsedAt: now })
      .where(
        and(
          eq(mcpTokens.tokenHash, hash),
          or(
            isNull(mcpTokens.lastUsedAt),
            lt(mcpTokens.lastUsedAt, new Date(now.getTime() - LAST_USED_RESOLUTION_MS)),
          ),
        ),
      );
    return row.userId;
  }
}

/** O token tem 256 bits aleatórios: sha256 sem sal basta (não é senha). */
function digest(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
