import Anthropic from '@anthropic-ai/sdk';
import type { Provider } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';

/**
 * Token do cliente da API da Anthropic. Vale `null` quando `ANTHROPIC_API_KEY`
 * não está configurada: o app sobe e só a análise pela interface fica
 * desligada. Os testes substituem o provider por um cliente com `fetch` falso.
 */
export const ANTHROPIC_CLIENT = Symbol('ANTHROPIC_CLIENT');

export type AnthropicClient = Anthropic;

export const anthropicClientProvider: Provider = {
  provide: ANTHROPIC_CLIENT,
  inject: [ENV],
  useFactory: (env: Env): AnthropicClient | null => {
    if (!env.ANTHROPIC_API_KEY) return null;
    return new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      // Só a API key: não herda um ANTHROPIC_AUTH_TOKEN que esteja no ambiente.
      authToken: null,
      // Sem valor, o SDK lê ANTHROPIC_BASE_URL do ambiente (ou usa a API oficial).
      baseURL: env.ANTHROPIC_BASE_URL,
      // Rate limit (429), sobrecarga (529) e erros 5xx: o SDK repete com backoff.
      maxRetries: 2,
    });
  },
};
