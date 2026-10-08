import { Module } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { CachedFinanceProvider } from './cache/cached-finance-provider.js';
import { FakeFinanceProvider } from './fake/fake-finance-provider.js';
import { FINANCE_PROVIDER, type FinanceProvider } from './finance-provider.js';
import { PluggyClient } from './pluggy/pluggy.client.js';
import { PluggyProvider } from './pluggy/pluggy.provider.js';

/**
 * Escolhe a implementação de `FinanceProvider` conforme `FINANCE_PROVIDER`.
 * Trocar de agregador = escrever um novo adapter e registrar aqui.
 */
export function createFinanceProvider(env: Env): FinanceProvider {
  const provider = createBaseProvider(env);
  const ttlMs = env.PROVIDER_CACHE_TTL_SECONDS * 1000;
  return ttlMs > 0 ? new CachedFinanceProvider(provider, ttlMs) : provider;
}

function createBaseProvider(env: Env): FinanceProvider {
  switch (env.FINANCE_PROVIDER) {
    case 'pluggy':
      return new PluggyProvider(
        new PluggyClient({
          baseUrl: env.PLUGGY_BASE_URL,
          // Presença garantida pela validação do env quando FINANCE_PROVIDER=pluggy.
          clientId: env.PLUGGY_CLIENT_ID!,
          clientSecret: env.PLUGGY_CLIENT_SECRET!,
          timeoutMs: env.PLUGGY_TIMEOUT_MS,
          maxRetries: env.PLUGGY_MAX_RETRIES,
        }),
        { itemIds: env.PLUGGY_ITEM_IDS, timeZone: env.TIMEZONE },
      );
    case 'fake':
      return new FakeFinanceProvider({ timeZone: env.TIMEZONE });
  }
}

@Module({
  providers: [{ provide: FINANCE_PROVIDER, inject: [ENV], useFactory: createFinanceProvider }],
  exports: [FINANCE_PROVIDER],
})
export class IntegrationsModule {}
