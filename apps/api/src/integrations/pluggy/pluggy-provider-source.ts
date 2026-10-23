import {
  ProviderNotConfiguredError,
  type FinanceProvider,
  type FinanceProviderSource,
} from '../finance-provider.js';
import type { PluggyCredentials, PluggySettingsStore } from './pluggy-settings.store.js';

/**
 * Monta o provedor da Pluggy a partir das credenciais salvas no banco e o
 * reaproveita (com o cache e a API key dentro) até a configuração mudar.
 */
export class PluggyProviderSource implements FinanceProviderSource {
  private memo: { version: number; provider: FinanceProvider } | null = null;

  constructor(
    private readonly store: PluggySettingsStore,
    private readonly build: (credentials: PluggyCredentials) => FinanceProvider,
  ) {}

  async get(): Promise<FinanceProvider> {
    const row = await this.store.find();
    if (!row) throw new ProviderNotConfiguredError();
    const version = row.updatedAt.getTime();
    if (this.memo?.version !== version) {
      this.memo = { version, provider: this.build(this.store.decrypt(row)) };
    }
    return this.memo.provider;
  }
}
