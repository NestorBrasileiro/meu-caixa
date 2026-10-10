import { randomBytes } from 'node:crypto';
import { z } from 'zod';

const booleanFlag = z.enum(['true', 'false']).transform((value) => value === 'true');

const commaSeparatedList = z.string().transform((value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),

    DATABASE_URL: z.string().min(1),
    DATABASE_MIGRATE_ON_START: booleanFlag.default(false),

    /**
     * URL pública por onde o browser chega nesta API. Com a interface fazendo
     * proxy de `/auth` e `/api`, é a URL da interface; o callback do login é
     * `${APP_URL}/auth/callback`.
     */
    APP_URL: z.url().default('http://localhost:3001'),
    /** Para onde o usuário volta depois do login/logout; também é a origem liberada no CORS. */
    FRONTEND_URL: z.url().default('http://localhost:3001'),

    // Default aleatório por boot: seguro em dev, mas derruba as sessões a cada
    // restart — em produção é obrigatório definir (validado em validateEnv).
    SESSION_SECRET: z
      .string()
      .min(32)
      .default(() => randomBytes(32).toString('hex')),

    KEYCLOAK_URL: z.url().default('http://localhost:8080'),
    KEYCLOAK_REALM: z.string().default('meu-caixa'),
    KEYCLOAK_CLIENT_ID: z.string().default('web'),
    KEYCLOAK_CLIENT_SECRET: z.string().min(1),
    /** Role (de realm ou do client) exigida para acessar os dados financeiros. */
    KEYCLOAK_REQUIRED_ROLE: z.string().default('owner'),

    /**
     * Segredo opcional para clientes MCP sem OAuth (Claude Code/Desktop via
     * header `Authorization: Bearer ...`). Gere com: openssl rand -hex 32
     */
    MCP_ACCESS_TOKEN: z.string().min(32, 'use ao menos 32 caracteres aleatórios').optional(),
    /**
     * Clients do Keycloak (`azp`) cujos tokens valem no /mcp mesmo sem a
     * audiência `${APP_URL}/mcp`. Vazio (padrão): só tokens com essa audiência.
     */
    MCP_ALLOWED_CLIENTS: commaSeparatedList.default([]),

    /**
     * Análise pela interface ("Gerar análise" e "Pergunte ao Claude"), paga
     * por uso na API da Anthropic. Sem a chave, o app sobe normalmente e só
     * esses recursos ficam desligados (503).
     */
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    ANTHROPIC_MODEL: z.string().min(1).default('claude-opus-5-5'),
    /** Opcional: outro endpoint da API (ex.: um mock local). O SDK também lê do ambiente. */
    ANTHROPIC_BASE_URL: z.url().optional(),

    TIMEZONE: z.string().default('America/Sao_Paulo'),

    FINANCE_PROVIDER: z.enum(['pluggy', 'fake']).default('pluggy'),
    PROVIDER_CACHE_TTL_SECONDS: z.coerce.number().int().min(0).default(300),

    PLUGGY_BASE_URL: z.url().default('https://api.pluggy.ai'),
    PLUGGY_CLIENT_ID: z.string().optional(),
    PLUGGY_CLIENT_SECRET: z.string().optional(),
    PLUGGY_ITEM_IDS: commaSeparatedList.default([]),
    PLUGGY_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
    PLUGGY_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),

    SYNC_ENABLED: booleanFlag.default(true),
    SYNC_INTERVAL_HOURS: z.coerce.number().positive().default(6),
    SYNC_LOOKBACK_DAYS: z.coerce.number().int().positive().default(365),
    SYNC_OVERLAP_DAYS: z.coerce.number().int().min(0).default(7),
  })
  .superRefine((env, ctx) => {
    if (env.FINANCE_PROVIDER === 'pluggy') {
      const required = ['PLUGGY_CLIENT_ID', 'PLUGGY_CLIENT_SECRET'] as const;
      for (const key of required) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `obrigatório quando FINANCE_PROVIDER=pluggy`,
          });
        }
      }
      if (env.PLUGGY_ITEM_IDS.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['PLUGGY_ITEM_IDS'],
          message: 'informe ao menos um item (conexão) do Meu Pluggy',
        });
      }
    }
  });

export type Env = z.output<typeof envSchema>;

/**
 * Valida as variáveis de ambiente na subida da aplicação. Strings vazias
 * (`FOO=` no .env) são tratadas como ausentes para valerem os defaults.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const input = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== ''));
  const result = envSchema.safeParse(input);
  if (!result.success) {
    throw new Error(`Configuração inválida:\n${z.prettifyError(result.error)}`);
  }
  if (result.data.NODE_ENV === 'production' && !input.SESSION_SECRET) {
    throw new Error(
      'Configuração inválida:\n✖ SESSION_SECRET é obrigatório em produção (mín. 32 caracteres)',
    );
  }
  return result.data;
}
