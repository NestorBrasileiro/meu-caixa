import type { Env } from '../../config/env.js';

/**
 * Configuração efetiva do Open Finance: o que está no ambiente (`.env`)
 * combinado com o que foi cadastrado na tela Configurações → Open Finance.
 *
 * Precedência: o ambiente sempre vence. `FINANCE_PROVIDER` definido força o
 * modo; `PLUGGY_CLIENT_ID`/`PLUGGY_CLIENT_SECRET` definem as credenciais;
 * `PLUGGY_ITEM_IDS` não vazio define os bancos. O que não vem do ambiente sai
 * do app; sem escolha nenhuma, o modo é `pluggy` se há credenciais, senão
 * `none` (nada configurado: a sincronização não faz nada).
 */

export const OPEN_FINANCE_MODES = ['pluggy', 'fake'] as const;
export type StoredOpenFinanceMode = (typeof OPEN_FINANCE_MODES)[number];
export type OpenFinanceMode = StoredOpenFinanceMode | 'none';
export type SettingSource = 'env' | 'app';

/** Chaves em `app_settings`. */
export const OPEN_FINANCE_KEYS = {
  mode: 'open_finance.mode',
  credentials: 'open_finance.credentials',
  items: 'open_finance.items',
  /** Último estado conhecido de cada item na Pluggy (instituição, status, erro). */
  itemSnapshots: 'open_finance.item_snapshots',
} as const;

/** Página do Meu Pluggy, onde o usuário conecta os bancos e vê os ids dos items. */
export const MEU_PLUGGY_URL = 'https://meu.pluggy.ai';

export interface PluggyCredentials {
  clientId: string;
  clientSecret: string;
}

/** O que está gravado no app (segredo já decifrado). */
export interface StoredOpenFinance {
  mode: StoredOpenFinanceMode | null;
  credentials: (PluggyCredentials & { updatedAt: Date }) | null;
  /** `null` quando o app nunca guardou a lista. */
  itemIds: string[] | null;
}

export interface OpenFinanceConfig {
  mode: { value: OpenFinanceMode; source: SettingSource | 'default' };
  credentials: (PluggyCredentials & { source: SettingSource; updatedAt: Date | null }) | null;
  items: { ids: string[]; source: SettingSource };
}

export type OpenFinanceEnv = Pick<
  Env,
  'FINANCE_PROVIDER' | 'PLUGGY_CLIENT_ID' | 'PLUGGY_CLIENT_SECRET' | 'PLUGGY_ITEM_IDS'
>;

export function resolveOpenFinanceConfig(
  env: OpenFinanceEnv,
  stored: StoredOpenFinance,
): OpenFinanceConfig {
  const credentials: OpenFinanceConfig['credentials'] =
    env.PLUGGY_CLIENT_ID && env.PLUGGY_CLIENT_SECRET
      ? {
          clientId: env.PLUGGY_CLIENT_ID,
          clientSecret: env.PLUGGY_CLIENT_SECRET,
          source: 'env',
          updatedAt: null,
        }
      : stored.credentials
        ? { ...stored.credentials, source: 'app' }
        : null;

  const items: OpenFinanceConfig['items'] =
    env.PLUGGY_ITEM_IDS.length > 0
      ? { ids: [...env.PLUGGY_ITEM_IDS], source: 'env' }
      : { ids: stored.itemIds ?? [], source: 'app' };

  const mode: OpenFinanceConfig['mode'] = env.FINANCE_PROVIDER
    ? { value: env.FINANCE_PROVIDER, source: 'env' }
    : stored.mode
      ? { value: stored.mode, source: 'app' }
      : { value: credentials ? 'pluggy' : 'none', source: 'default' };

  return { mode, credentials, items };
}

/** Início do Client ID para a interface reconhecer qual está cadastrado. */
export function clientIdHint(clientId: string): string {
  return `${clientId.slice(0, 8)}…`;
}

/** Nome do provedor gravado nas linhas sincronizadas (`FinanceProvider.name`) de cada modo. */
export function providerNameOf(mode: StoredOpenFinanceMode): string {
  return mode;
}
