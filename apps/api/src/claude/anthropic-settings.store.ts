import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { decryptSecret, encryptSecret } from '../common/secret-box.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { anthropicSettings, type AnthropicSettingsRow } from '../database/schema.js';
import { ClaudeDisabledError } from './claude-disabled.error.js';

const SINGLETON_ID = 1;

export interface AnthropicCredentials {
  apiKey: string;
  model: string;
}

/** Chave da Anthropic no banco, cifrada, e o modelo escolhido. */
@Injectable()
export class AnthropicSettingsStore {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Linha como está no banco (chave ainda cifrada). */
  async find(): Promise<AnthropicSettingsRow | null> {
    const [row] = await this.db
      .select()
      .from(anthropicSettings)
      .where(eq(anthropicSettings.id, SINGLETON_ID));
    return row ?? null;
  }

  decrypt(row: AnthropicSettingsRow): AnthropicCredentials {
    let apiKey: string;
    try {
      apiKey = decryptSecret(row.apiKey, this.key());
    } catch (error) {
      if (error instanceof ClaudeDisabledError) throw error;
      throw new ClaudeDisabledError(
        'Não foi possível ler a chave da Anthropic salva (SETTINGS_ENCRYPTION_KEY mudou?). Cadastre de novo em Configurações.',
      );
    }
    return { apiKey, model: row.model };
  }

  async save(userId: string, credentials: AnthropicCredentials): Promise<AnthropicSettingsRow> {
    const values = {
      userId,
      apiKey: encryptSecret(credentials.apiKey, this.key()),
      model: credentials.model,
    };
    const [row] = await this.db
      .insert(anthropicSettings)
      .values({ id: SINGLETON_ID, ...values })
      .onConflictDoUpdate({
        target: anthropicSettings.id,
        set: { ...values, updatedAt: new Date() },
      })
      .returning();
    return row!;
  }

  async remove(): Promise<void> {
    await this.db.delete(anthropicSettings).where(eq(anthropicSettings.id, SINGLETON_ID));
  }

  /** Falha antes de qualquer trabalho se não houver chave para cifrar. */
  assertCanEncrypt(): void {
    this.key();
  }

  private key(): string {
    if (!this.env.SETTINGS_ENCRYPTION_KEY) {
      throw new ClaudeDisabledError(
        'Defina SETTINGS_ENCRYPTION_KEY no .env da API para salvar a chave da Anthropic',
      );
    }
    return this.env.SETTINGS_ENCRYPTION_KEY;
  }
}
