import { Module } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { CachedFinanceProvider } from './cache/cached-finance-provider.js';
import { FakeFinanceProvider } from './fake/fake-finance-provider.js';
import {
  FINANCE_PROVIDER_SOURCE,
  staticProviderSource,
  type FinanceProvider,
  type FinanceProviderSource,
} from './finance-provider.js';
import { PluggyProviderSource } from './pluggy/pluggy-provider-source.js';
import { PluggySettingsStore, type PluggyCredentials } from './pluggy/pluggy-settings.store.js';
import { PluggyClient } from './pluggy/pluggy.client.js';
import { PluggyProvider } from './pluggy/pluggy.provider.js';

export function createPluggyClient(
  env: Env,
  credentials: Pick<PluggyCredentials, 'clientId' | 'clientSecret'>,
  maxRetries = env.PLUGGY_MAX_RETRIES,
): PluggyClient {
  return new PluggyClient({
    baseUrl: env.PLUGGY_BASE_URL,
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    timeoutMs: env.PLUGGY_TIMEOUT_MS,
    maxRetries,
  });
}

function withCache(provider: FinanceProvider, env: Env): FinanceProvider {
  const ttlMs = env.PROVIDER_CACHE_TTL_SECONDS * 1000;
  return ttlMs > 0 ? new CachedFinanceProvider(provider, ttlMs) : provider;
}

/**
 * Escolhe a implementação de `FinanceProvider` conforme `FINANCE_PROVIDER`.
 * Trocar de agregador = escrever um novo adapter e registrar aqui.
 */
export function createProviderSource(env: Env, store: PluggySettingsStore): FinanceProviderSource {
  switch (env.FINANCE_PROVIDER) {
    case 'pluggy':
      return new PluggyProviderSource(store, (credentials) =>
        withCache(
          new PluggyProvider(createPluggyClient(env, credentials), {
            itemIds: credentials.itemIds,
            timeZone: env.TIMEZONE,
          }),
          env,
        ),
      );
    case 'fake':
      return staticProviderSource(
        withCache(new FakeFinanceProvider({ timeZone: env.TIMEZONE }), env),
      );
  }
}

@Module({
  providers: [
    PluggySettingsStore,
    {
      provide: FINANCE_PROVIDER_SOURCE,
      inject: [ENV, PluggySettingsStore],
      useFactory: createProviderSource,
    },
  ],
  exports: [FINANCE_PROVIDER_SOURCE, PluggySettingsStore],
})
export class IntegrationsModule {}
