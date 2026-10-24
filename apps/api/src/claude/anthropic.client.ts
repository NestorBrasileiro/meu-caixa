import Anthropic from '@anthropic-ai/sdk';
import type { Provider } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { AnthropicSettingsStore } from './anthropic-settings.store.js';

export type AnthropicClient = Anthropic;

/** Cliente pronto para uso e o modelo escolhido em Configurações. */
export interface ClaudeConfig {
  client: AnthropicClient;
  model: string;
}

/**
 * Entrega o cliente da Anthropic a partir da chave que o usuário salvou;
 * `null` quando ele não tem chave (só a análise pela interface fica
 * desligada para ele). Os testes substituem por um cliente com `fetch` falso.
 */
export interface AnthropicSource {
  get(userId: string): Promise<ClaudeConfig | null>;
}

export const ANTHROPIC_SOURCE = Symbol('ANTHROPIC_SOURCE');

export function staticAnthropicSource(config: ClaudeConfig | null): AnthropicSource {
  return { get: async () => config };
}

export function createAnthropicClient(env: Env, apiKey: string, maxRetries = 2): AnthropicClient {
  return new Anthropic({
    apiKey,
    // Só a API key: não herda um ANTHROPIC_AUTH_TOKEN que esteja no ambiente.
    authToken: null,
    // Sem valor, o SDK lê ANTHROPIC_BASE_URL do ambiente (ou usa a API oficial).
    baseURL: env.ANTHROPIC_BASE_URL,
    // Rate limit (429), sobrecarga (529) e erros 5xx: o SDK repete com backoff.
    maxRetries,
  });
}

/** Reaproveita o cliente de cada usuário até a configuração dele mudar. */
export class StoredAnthropicSource implements AnthropicSource {
  private readonly memo = new Map<string, { version: number; config: ClaudeConfig }>();

  constructor(
    private readonly store: AnthropicSettingsStore,
    private readonly env: Env,
  ) {}

  async get(userId: string): Promise<ClaudeConfig | null> {
    const row = await this.store.find(userId);
    if (!row) {
      this.memo.delete(userId);
      return null;
    }
    const version = row.updatedAt.getTime();
    let memo = this.memo.get(userId);
    if (memo?.version !== version) {
      const { apiKey, model } = this.store.decrypt(row);
      memo = { version, config: { client: createAnthropicClient(this.env, apiKey), model } };
      this.memo.set(userId, memo);
    }
    return memo.config;
  }
}

export const anthropicSourceProvider: Provider = {
  provide: ANTHROPIC_SOURCE,
  inject: [AnthropicSettingsStore, ENV],
  useFactory: (store: AnthropicSettingsStore, env: Env): AnthropicSource =>
    new StoredAnthropicSource(store, env),
};
