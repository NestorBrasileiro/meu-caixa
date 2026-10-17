import type { IsoDateTime } from "./types"

/** Configurações: contratos de `/api/settings/*` (módulo `settings` da API). */

/** De onde vêm os dados dos bancos: Meu Pluggy (Open Finance) ou o provedor de exemplo da API. */
export type OpenFinanceMode = "pluggy" | "fake"

/**
 * Quem definiu o valor: `env` = variável de ambiente da API (não dá para mudar pelo app);
 * `app` = salvo nesta tela; `default` = nada escolhido ainda.
 */
export type SettingSource = "env" | "app" | "default"

/** Um item da Pluggy = um banco conectado no Meu Pluggy. */
export interface OpenFinanceItem {
  id: string
  institutionName: string | null
  /** Status do item na Pluggy (ex.: UPDATED, UPDATING, LOGIN_ERROR, OUTDATED). */
  status: string | null
  lastUpdatedAt: IsoDateTime | null
  error: string | null
}

/** GET /api/settings/open-finance (e a resposta das ações que devolvem o estado novo). */
export interface OpenFinanceSettings {
  /** `none` = nada configurado ainda (sem variável nem escolha no app): a sincronização não faz nada. */
  mode: { value: OpenFinanceMode | "none"; source: SettingSource }
  credentials: {
    configured: boolean
    source: "env" | "app" | null
    /** Começo do Client ID ("1a2b3c4d…"); o secret nunca sai da API. */
    clientIdHint: string | null
    updatedAt: IsoDateTime | null
  }
  items: { source: "env" | "app"; list: OpenFinanceItem[] }
  /** Onde o usuário conecta os bancos ("https://meu.pluggy.ai"). */
  connectUrl: string
}

/** Corpo de `PUT /api/settings/open-finance/credentials`. */
export interface OpenFinanceCredentialsInput {
  clientId: string
  clientSecret: string
}
