import { Logger } from '@nestjs/common';
import type { z } from 'zod';
import { FinanceProviderError } from '../finance-provider.js';
import {
  cursorPageResponseSchema,
  pageResponseSchema,
  pluggyAccountSchema,
  pluggyAuthSchema,
  pluggyBillSchema,
  pluggyIdentitySchema,
  pluggyItemSchema,
  pluggyTransactionSchema,
  type PluggyAccount,
  type PluggyBill,
  type PluggyIdentity,
  type PluggyItem,
  type PluggyTransaction,
} from './pluggy.schemas.js';

export interface PluggyClientOptions {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  timeoutMs: number;
  /** Tentativas extras em falhas transitórias (rede, timeout, 429, 5xx). */
  maxRetries: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

type Query = Record<string, string | number | undefined>;

const PAGE_SIZE = 500;
const MAX_PAGES = 1_000;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 30_000;
/** Renova a API key um pouco antes de expirar. */
const API_KEY_EXPIRY_MARGIN_MS = 5 * 60_000;
/** A API key da Pluggy vale 2h; usado se não der para ler o `exp` do JWT. */
const API_KEY_FALLBACK_TTL_MS = 2 * 60 * 60_000;
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export class PluggyApiError extends FinanceProviderError {
  constructor(
    message: string,
    options: { retryable: boolean; status?: number; cause?: unknown },
    readonly body?: unknown,
  ) {
    super(message, options);
    this.name = 'PluggyApiError';
  }
}

/**
 * Cliente HTTP fino da API da Pluggy. Cuida de autenticação, timeout, retry
 * com backoff, paginação e validação do formato das respostas. Não conhece o
 * modelo de domínio — a tradução fica em `pluggy.mapper.ts`.
 */
export class PluggyClient {
  private readonly logger = new Logger(PluggyClient.name);
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private apiKey: { value: string; expiresAt: number } | null = null;
  private pendingApiKey: Promise<string> | null = null;

  constructor(private readonly options: PluggyClientOptions) {
    this.fetchFn = options.fetch ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.now ?? Date.now;
  }

  async getItem(itemId: string): Promise<PluggyItem> {
    return this.get(`/items/${encodeURIComponent(itemId)}`, {}, pluggyItemSchema);
  }

  /** Dados cadastrais do titular. `null` quando o banco não fornece. */
  async getIdentity(itemId: string): Promise<PluggyIdentity | null> {
    try {
      return await this.get('/identity', { itemId }, pluggyIdentitySchema);
    } catch (error) {
      if (error instanceof PluggyApiError && error.status === 404) return null;
      throw error;
    }
  }

  async listAccounts(itemId: string): Promise<PluggyAccount[]> {
    return this.getAllPages('/accounts', { itemId }, pluggyAccountSchema);
  }

  async listBills(accountId: string): Promise<PluggyBill[]> {
    return this.getAllPages('/bills', { accountId }, pluggyBillSchema);
  }

  /** Transações via `/v2/transactions` (paginação por cursor). */
  async listTransactions(
    accountId: string,
    range: { dateFrom: string; dateTo: string },
  ): Promise<PluggyTransaction[]> {
    const schema = cursorPageResponseSchema(pluggyTransactionSchema);
    const results: PluggyTransaction[] = [];
    let after: string | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      const response = await this.get(
        '/v2/transactions',
        { accountId, dateFrom: range.dateFrom, dateTo: range.dateTo, after },
        schema,
      );
      results.push(...response.results);
      if (!response.next) return results;

      const nextAfter = new URL(response.next, this.options.baseUrl).searchParams.get('after');
      if (!nextAfter || nextAfter === after) return results;
      after = nextAfter;
    }
    throw new PluggyApiError(`Paginação de transações excedeu ${MAX_PAGES} páginas`, {
      retryable: false,
    });
  }

  private async getAllPages<T extends z.ZodType>(
    path: string,
    query: Query,
    itemSchema: T,
  ): Promise<z.infer<T>[]> {
    const schema = pageResponseSchema(itemSchema);
    const results: z.infer<T>[] = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const response = await this.get(path, { ...query, page, pageSize: PAGE_SIZE }, schema);
      results.push(...(response.results as z.infer<T>[]));
      if (page >= response.totalPages) return results;
    }
    throw new PluggyApiError(`Paginação de ${path} excedeu ${MAX_PAGES} páginas`, {
      retryable: false,
    });
  }

  private async get<T extends z.ZodType>(
    path: string,
    query: Query,
    schema: T,
  ): Promise<z.infer<T>> {
    const body = await this.requestWithApiKey(this.buildUrl(path, query));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new PluggyApiError(
        `Resposta inesperada da Pluggy em ${path}: ${parsed.error.issues
          .slice(0, 5)
          .map((issue) => `${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
          .join('; ')}`,
        { retryable: false, cause: parsed.error },
      );
    }
    return parsed.data;
  }

  private async requestWithApiKey(url: string): Promise<unknown> {
    const apiKey = await this.getApiKey();
    try {
      return await this.requestJson(url, { method: 'GET', headers: { 'X-API-KEY': apiKey } });
    } catch (error) {
      // API key revogada ou expirada antes do previsto: renova uma vez.
      if (error instanceof PluggyApiError && error.status === 401) {
        this.apiKey = null;
        const freshKey = await this.getApiKey();
        return this.requestJson(url, { method: 'GET', headers: { 'X-API-KEY': freshKey } });
      }
      throw error;
    }
  }

  private async getApiKey(): Promise<string> {
    if (this.apiKey && this.apiKey.expiresAt > this.now()) {
      return this.apiKey.value;
    }
    // Requisições concorrentes compartilham a mesma autenticação.
    this.pendingApiKey ??= this.authenticate().finally(() => {
      this.pendingApiKey = null;
    });
    return this.pendingApiKey;
  }

  private async authenticate(): Promise<string> {
    const body = await this.requestJson(this.buildUrl('/auth', {}), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: this.options.clientId,
        clientSecret: this.options.clientSecret,
      }),
    });
    const parsed = pluggyAuthSchema.safeParse(body);
    if (!parsed.success) {
      throw new PluggyApiError('Resposta de autenticação da Pluggy sem apiKey', {
        retryable: false,
      });
    }
    const expiresAt = jwtExpiry(parsed.data.apiKey) ?? this.now() + API_KEY_FALLBACK_TTL_MS;
    this.apiKey = { value: parsed.data.apiKey, expiresAt: expiresAt - API_KEY_EXPIRY_MARGIN_MS };
    return parsed.data.apiKey;
  }

  private async requestJson(url: string, init: RequestInit): Promise<unknown> {
    const method = init.method ?? 'GET';
    const path = new URL(url).pathname;

    for (let attempt = 0; ; attempt++) {
      let error: PluggyApiError;
      let retryAfterMs: number | undefined;

      try {
        const response = await this.fetchFn(url, {
          ...init,
          headers: { Accept: 'application/json', ...init.headers },
          signal: AbortSignal.timeout(this.options.timeoutMs),
        });
        const body = await readBody(response);
        if (response.ok) return body;

        retryAfterMs = parseRetryAfter(response.headers.get('retry-after'), this.now());
        error = new PluggyApiError(
          `Pluggy respondeu ${response.status} em ${method} ${path}`,
          { retryable: RETRYABLE_STATUSES.has(response.status), status: response.status },
          body,
        );
      } catch (cause) {
        const timedOut = cause instanceof DOMException && cause.name === 'TimeoutError';
        error = new PluggyApiError(
          timedOut
            ? `Timeout de ${this.options.timeoutMs}ms em ${method} ${path}`
            : `Falha de rede em ${method} ${path}: ${(cause as Error).message}`,
          { retryable: true, cause },
        );
      }

      if (!error.retryable || attempt >= this.options.maxRetries) throw error;

      const delay = retryAfterMs ?? backoff(attempt);
      this.logger.warn(
        `${error.message}; nova tentativa ${attempt + 1}/${this.options.maxRetries} em ${delay}ms`,
      );
      await this.sleep(delay);
    }
  }

  private buildUrl(path: string, query: Query): string {
    const url = new URL(path, this.options.baseUrl);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Backoff exponencial com jitter: ~0.5s, 1s, 2s, 4s… até 30s. */
function backoff(attempt: number): number {
  const exponential = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt);
  return Math.round(exponential / 2 + Math.random() * (exponential / 2));
}

function parseRetryAfter(header: string | null, now: number): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now;
  if (!Number.isFinite(delay) || delay < 0) return undefined;
  return Math.min(delay, MAX_BACKOFF_MS);
}

/** Lê o `exp` (em segundos) do payload de um JWT, sem validar assinatura. */
function jwtExpiry(token: string): number | undefined {
  const payload = token.split('.')[1];
  if (!payload) return undefined;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      exp?: unknown;
    };
    return typeof exp === 'number' ? exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}
