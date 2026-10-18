import type { IsoDateTime } from "./types"

/** Configurações: contratos de `/api/settings` (módulo `settings` da API). */

/** Credenciais da Pluggy como a API mostra: o Client Secret nunca vem. */
export interface PluggySettings {
  /** `FINANCE_PROVIDER` da API. Com "fake", estas credenciais não são usadas. */
  provider: "pluggy" | "fake"
  configured: boolean
  clientId: string | null
  itemIds: string[]
  updatedAt: IsoDateTime | null
}

/** Corpo de `PUT /api/settings/pluggy`. Sem `clientSecret`, a API mantém o salvo. */
export interface PluggySettingsInput {
  clientId: string
  clientSecret?: string
  itemIds: string[]
}

/** Chave da Anthropic (análise pelo app) como a API mostra: a chave nunca vem. */
export interface AnthropicSettings {
  configured: boolean
  /** Modelo salvo; sem configuração, o padrão sugerido. */
  model: string
  /** Modelos que o app aceita, com rótulo e preço. */
  models: { id: string; label: string }[]
  updatedAt: IsoDateTime | null
}

/** Corpo de `PUT /api/settings/anthropic`. Sem `apiKey`, a API mantém a salva. */
export interface AnthropicSettingsInput {
  apiKey?: string
  model: string
}
