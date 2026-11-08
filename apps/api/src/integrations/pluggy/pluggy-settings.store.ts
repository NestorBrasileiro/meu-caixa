import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { decryptSecret, encryptSecret } from '../../common/secret-box.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { DATABASE, type Database } from '../../database/database.module.js';
import { pluggySettings, type PluggySettingsRow } from '../../database/schema.js';
import { ProviderNotConfiguredError } from '../finance-provider.js';

export interface PluggyCredentials {
  clientId: string;
  clientSecret: string;
  itemIds: string[];
}

/** Credenciais da Pluggy de cada usuário no banco, com o Client Secret cifrado. */
@Injectable()
export class PluggySettingsStore {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Linha como está no banco (segredo ainda cifrado). */
  async find(userId: string): Promise<PluggySettingsRow | null> {
    const [row] = await this.db
      .select()
      .from(pluggySettings)
      .where(eq(pluggySettings.userId, userId));
    return row ?? null;
  }

  /** Usuários com a Pluggy cadastrada (o agendador sincroniza só estes). */
  async configuredUserIds(): Promise<string[]> {
    const rows = await this.db.select({ userId: pluggySettings.userId }).from(pluggySettings);
    return rows.map((row) => row.userId);
  }

  decrypt(row: PluggySettingsRow): PluggyCredentials {
    let clientSecret: string;
    try {
      clientSecret = decryptSecret(row.clientSecret, this.key());
    } catch (error) {
      if (error instanceof ProviderNotConfiguredError) throw error;
      throw new ProviderNotConfiguredError(
        'Não foi possível ler o Client Secret salvo (SETTINGS_ENCRYPTION_KEY mudou?). Cadastre de novo em Configurações.',
      );
    }
    return { clientId: row.clientId, clientSecret, itemIds: row.itemIds };
  }

  async save(userId: string, credentials: PluggyCredentials): Promise<PluggySettingsRow> {
    const values = {
      clientId: credentials.clientId,
      clientSecret: encryptSecret(credentials.clientSecret, this.key()),
      itemIds: credentials.itemIds,
    };
    const [row] = await this.db
      .insert(pluggySettings)
      .values({ userId, ...values })
      .onConflictDoUpdate({
        target: pluggySettings.userId,
        set: { ...values, updatedAt: new Date() },
      })
      .returning();
    return row!;
  }

  /** Falha antes de qualquer trabalho se não houver chave para cifrar. */
  assertCanEncrypt(): void {
    this.key();
  }

  private key(): string {
    if (!this.env.SETTINGS_ENCRYPTION_KEY) {
      throw new ProviderNotConfiguredError(
        'Defina SETTINGS_ENCRYPTION_KEY no .env da API para salvar as credenciais da Pluggy',
      );
    }
    return this.env.SETTINGS_ENCRYPTION_KEY;
  }
}
