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

    // Protege a API com `Authorization: Bearer <token>`. Obrigatório em produção.
    API_TOKEN: z.string().min(32).optional(),

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
    if (env.NODE_ENV === 'production' && !env.API_TOKEN) {
      ctx.addIssue({
        code: 'custom',
        path: ['API_TOKEN'],
        message: 'obrigatório em produção',
      });
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
  return result.data;
}
