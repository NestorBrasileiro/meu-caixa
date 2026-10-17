import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { AppSettingsStore, type DbExecutor } from '../../settings/app-settings.store.js';
import { SettingsCipher, SettingsDecryptionError } from '../../settings/settings-cipher.js';
import type { PluggyItem } from '../pluggy/pluggy.schemas.js';
import {
  OPEN_FINANCE_KEYS,
  OPEN_FINANCE_MODES,
  resolveOpenFinanceConfig,
  type OpenFinanceConfig,
  type PluggyCredentials,
  type StoredOpenFinance,
  type StoredOpenFinanceMode,
} from './open-finance-config.js';

/** Último estado conhecido de um item (banco conectado) na Pluggy. */
export interface ItemSnapshot {
  institutionName: string | null;
  /** Status do item na Pluggy (ex.: UPDATED, LOGIN_ERROR). */
  status: string | null;
  lastUpdatedAt: string | null;
  error: string | null;
}

const modeValue = z.object({ mode: z.enum(OPEN_FINANCE_MODES) });
const credentialsValue = z.object({ clientId: z.string().min(1), clientSecret: z.string().min(1) });
const itemsValue = z.object({ ids: z.array(z.string()) });
const snapshotsValue = z.record(
  z.string(),
  z.object({
    institutionName: z.string().nullable(),
    status: z.string().nullable(),
    lastUpdatedAt: z.string().nullable(),
    error: z.string().nullable(),
  }),
);

export function toItemSnapshot(item: PluggyItem): ItemSnapshot {
  return {
    institutionName: item.connector.name,
    status: item.status,
    lastUpdatedAt: item.lastUpdatedAt ?? null,
    error: item.error?.message ?? item.error?.code ?? null,
  };
}

/**
 * Lê e grava a configuração do Open Finance em `app_settings`. O Client
 * Secret é gravado cifrado; o Client ID não é segredo e fica em claro (mas a
 * API só devolve o começo dele).
 */
@Injectable()
export class OpenFinanceConfigStore {
  private readonly logger = new Logger(OpenFinanceConfigStore.name);
  /** Evita repetir o mesmo aviso de segredo ilegível a cada leitura. */
  private warnedUnreadableSecret: string | null = null;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly settings: AppSettingsStore,
    private readonly cipher: SettingsCipher,
  ) {}

  /** Configuração efetiva (ambiente + app). */
  async load(executor?: DbExecutor): Promise<OpenFinanceConfig> {
    return resolveOpenFinanceConfig(this.env, await this.loadStored(executor));
  }

  async loadStored(executor?: DbExecutor): Promise<StoredOpenFinance> {
    const rows = await this.settings.getMany(
      [OPEN_FINANCE_KEYS.mode, OPEN_FINANCE_KEYS.credentials, OPEN_FINANCE_KEYS.items],
      executor,
    );
    const mode = modeValue.safeParse(rows.get(OPEN_FINANCE_KEYS.mode)?.value);
    const items = itemsValue.safeParse(rows.get(OPEN_FINANCE_KEYS.items)?.value);
    const credentialsRow = rows.get(OPEN_FINANCE_KEYS.credentials);

    return {
      mode: mode.success ? mode.data.mode : null,
      credentials: credentialsRow
        ? this.readCredentials(credentialsRow.value, credentialsRow.updatedAt)
        : null,
      itemIds: items.success ? items.data.ids : null,
    };
  }

  async loadSnapshots(): Promise<Record<string, ItemSnapshot>> {
    const rows = await this.settings.getMany([OPEN_FINANCE_KEYS.itemSnapshots]);
    const parsed = snapshotsValue.safeParse(rows.get(OPEN_FINANCE_KEYS.itemSnapshots)?.value);
    return parsed.success ? parsed.data : {};
  }

  async saveMode(mode: StoredOpenFinanceMode, executor?: DbExecutor): Promise<void> {
    await this.settings.set(OPEN_FINANCE_KEYS.mode, { mode }, executor);
  }

  async saveCredentials(credentials: PluggyCredentials): Promise<void> {
    await this.settings.set(OPEN_FINANCE_KEYS.credentials, {
      clientId: credentials.clientId,
      clientSecret: this.cipher.encrypt(credentials.clientSecret, OPEN_FINANCE_KEYS.credentials),
    });
  }

  async deleteCredentials(): Promise<boolean> {
    return this.settings.delete(OPEN_FINANCE_KEYS.credentials);
  }

  /**
   * Altera a lista de items gravada no app de forma atômica. `change` recebe
   * a lista atual e devolve a nova (ou lança para desistir).
   */
  async updateItemIds(
    change: (ids: string[], tx: DbExecutor) => Promise<string[]>,
    executor?: DbExecutor,
  ): Promise<string[]> {
    return this.settings.update(
      OPEN_FINANCE_KEYS.items,
      async (current, tx) => {
        const parsed = itemsValue.safeParse(current);
        const ids = await change(parsed.success ? parsed.data.ids : [], tx);
        return { value: { ids }, result: ids };
      },
      executor,
    );
  }

  async saveSnapshots(items: PluggyItem[], executor?: DbExecutor): Promise<void> {
    if (items.length === 0) return;
    await this.settings.merge(
      OPEN_FINANCE_KEYS.itemSnapshots,
      Object.fromEntries(items.map((item) => [item.id, toItemSnapshot(item)])),
      executor,
    );
  }

  async removeSnapshot(itemId: string, executor?: DbExecutor): Promise<void> {
    await this.settings.removeField(OPEN_FINANCE_KEYS.itemSnapshots, itemId, executor);
  }

  /** Credenciais gravadas; ilegíveis (chave trocada, valor corrompido) = não configuradas. */
  private readCredentials(value: unknown, updatedAt: Date): StoredOpenFinance['credentials'] {
    const parsed = credentialsValue.safeParse(value);
    if (!parsed.success) {
      this.warnUnreadable('formato inesperado', 'format');
      return null;
    }
    try {
      const clientSecret = this.cipher.decrypt(
        parsed.data.clientSecret,
        OPEN_FINANCE_KEYS.credentials,
      );
      this.warnedUnreadableSecret = null;
      return { clientId: parsed.data.clientId, clientSecret, updatedAt };
    } catch (error) {
      if (!(error instanceof SettingsDecryptionError)) throw error;
      this.warnUnreadable(error.message, parsed.data.clientSecret);
      return null;
    }
  }

  private warnUnreadable(reason: string, marker: string): void {
    if (this.warnedUnreadableSecret === marker) return;
    this.warnedUnreadableSecret = marker;
    this.logger.warn(
      `Credenciais do Open Finance gravadas no app ignoradas (${reason}). ` +
        'Cadastre o Client ID e o Client Secret de novo em Configurações → Open Finance.',
    );
  }
}
