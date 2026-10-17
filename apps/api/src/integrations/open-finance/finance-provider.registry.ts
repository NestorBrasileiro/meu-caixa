import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { CachedFinanceProvider } from '../cache/cached-finance-provider.js';
import { FakeFinanceProvider } from '../fake/fake-finance-provider.js';
import { FINANCE_PROVIDER, type FinanceProvider } from '../finance-provider.js';
import { PluggyClient } from '../pluggy/pluggy.client.js';
import { PluggyProvider } from '../pluggy/pluggy.provider.js';
import type { OpenFinanceConfig, PluggyCredentials } from './open-finance-config.js';
import { OpenFinanceConfigStore } from './open-finance-config.store.js';
import {
  NoneFinanceProvider,
  UnconfiguredFinanceProvider,
} from './unconfigured-finance-provider.js';

/** Validações da tela de configurações: respondem rápido, sem retry. */
const VALIDATION_TIMEOUT_MS = 10_000;

/**
 * Monta o `FinanceProvider` efetivo na hora do uso, a partir da configuração
 * atual (ambiente + tela Configurações → Open Finance): Pluggy com as
 * credenciais e items atuais, o fake ou o `none` (nada configurado).
 *
 * O provedor montado é reaproveitado (com o cache em memória e a API key da
 * Pluggy) enquanto a configuração não muda; qualquer mudança gera um novo.
 *
 * `FINANCE_PROVIDER`, quando registrado com um valor (testes), fixa o
 * provedor e ignora a configuração.
 */
@Injectable()
export class FinanceProviderRegistry {
  private readonly logger = new Logger(FinanceProviderRegistry.name);
  private built: { key: string; provider: FinanceProvider } | null = null;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly config: OpenFinanceConfigStore,
    @Optional() @Inject(FINANCE_PROVIDER) private readonly fixed: FinanceProvider | null = null,
  ) {}

  /** Provedor a usar agora (uma sincronização deve chamar uma vez e usar o mesmo até o fim). */
  async resolve(): Promise<FinanceProvider> {
    if (this.fixed) return this.fixed;
    return this.providerFor(await this.config.load());
  }

  /** Provedor para uma configuração já carregada. */
  providerFor(config: OpenFinanceConfig): FinanceProvider {
    const key = fingerprint(config, this.env.PLUGGY_BASE_URL);
    if (this.built?.key !== key) {
      this.built = { key, provider: this.build(config) };
      this.logger.log(`Origem dos dados bancários: ${describe(config)}`);
    }
    return this.built.provider;
  }

  /** Cliente da Pluggy com estas credenciais. `validation`: timeout curto e sem retry. */
  createPluggyClient(
    credentials: PluggyCredentials,
    options: { validation?: boolean } = {},
  ): PluggyClient {
    return new PluggyClient({
      baseUrl: this.env.PLUGGY_BASE_URL,
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      timeoutMs: options.validation
        ? Math.min(this.env.PLUGGY_TIMEOUT_MS, VALIDATION_TIMEOUT_MS)
        : this.env.PLUGGY_TIMEOUT_MS,
      maxRetries: options.validation ? 0 : this.env.PLUGGY_MAX_RETRIES,
    });
  }

  private build(config: OpenFinanceConfig): FinanceProvider {
    switch (config.mode.value) {
      case 'none':
        return new NoneFinanceProvider();
      case 'fake':
        return this.withCache(new FakeFinanceProvider({ timeZone: this.env.TIMEZONE }));
      case 'pluggy':
        if (!config.credentials) return new UnconfiguredFinanceProvider('pluggy');
        return this.withCache(
          new PluggyProvider(this.createPluggyClient(config.credentials), {
            itemIds: config.items.ids,
            timeZone: this.env.TIMEZONE,
            onItems: (items) => {
              this.config
                .saveSnapshots(items)
                .catch((error: unknown) =>
                  this.logger.warn(`Não foi possível guardar o status dos bancos: ${error}`),
                );
            },
          }),
        );
    }
  }

  private withCache(provider: FinanceProvider): FinanceProvider {
    const ttlMs = this.env.PROVIDER_CACHE_TTL_SECONDS * 1000;
    return ttlMs > 0 ? new CachedFinanceProvider(provider, ttlMs) : provider;
  }
}

/** Identifica a configuração sem guardar o segredo em claro na chave. */
function fingerprint(config: OpenFinanceConfig, baseUrl: string): string {
  if (config.mode.value !== 'pluggy') return config.mode.value;
  const credentials = config.credentials;
  return createHash('sha256')
    .update(
      JSON.stringify([
        baseUrl,
        credentials?.clientId ?? null,
        credentials?.clientSecret ?? null,
        config.items.ids,
      ]),
    )
    .digest('hex');
}

function describe(config: OpenFinanceConfig): string {
  const source = `origem: ${config.mode.source}`;
  switch (config.mode.value) {
    case 'none':
      return `nenhuma — Open Finance não configurado (${source})`;
    case 'fake':
      return `dados fictícios (${source})`;
    case 'pluggy':
      return config.credentials
        ? `Pluggy, ${config.items.ids.length} banco(s) (${source}; credenciais: ${config.credentials.source}; bancos: ${config.items.source})`
        : `Pluggy sem credenciais (${source})`;
  }
}
