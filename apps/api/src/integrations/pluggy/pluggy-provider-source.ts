import {
  ProviderNotConfiguredError,
  type FinanceProvider,
  type FinanceProviderSource,
} from '../finance-provider.js';
import type { PluggyCredentials, PluggySettingsStore } from './pluggy-settings.store.js';

/**
 * Monta o provedor da Pluggy de cada usuário a partir das credenciais que ele
 * salvou e o reaproveita (com o cache e a API key dentro) até a configuração
 * dele mudar.
 */
export class PluggyProviderSource implements FinanceProviderSource {
  private readonly memo = new Map<string, { version: number; provider: FinanceProvider }>();

  constructor(
    private readonly store: PluggySettingsStore,
    private readonly build: (credentials: PluggyCredentials) => FinanceProvider,
  ) {}

  async get(userId: string): Promise<FinanceProvider> {
    const row = await this.store.find(userId);
    if (!row) {
      this.memo.delete(userId);
      throw new ProviderNotConfiguredError();
    }
    const version = row.updatedAt.getTime();
    let memo = this.memo.get(userId);
    if (memo?.version !== version) {
      memo = { version, provider: this.build(this.store.decrypt(row)) };
      this.memo.set(userId, memo);
    }
    return memo.provider;
  }

  configuredUserIds(): Promise<string[]> {
    return this.store.configuredUserIds();
  }
}
