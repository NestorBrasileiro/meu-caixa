import type { OpenFinanceCredentialsInput, OpenFinanceItem, OpenFinanceMode, OpenFinanceSettings } from "@/lib/api/settings"
import type { IsoDateTime } from "@/lib/api/types"
import { formatDateTime, formatRelative } from "@/lib/format/date"

/**
 * Regras da seção "Open Finance (Meu Pluggy)" das configurações. Módulo puro (sem React, sem
 * relógio): o que cada parte mostra, o que pode ser editado, validação dos campos e mensagens.
 */

/** A tela de configurações; as outras telas mandam o usuário para cá para conectar bancos. */
export const SETTINGS_HREF = "/configuracoes"
/** Onde ficam o Client ID e o Client Secret da aplicação. */
export const PLUGGY_DASHBOARD_URL = "https://dashboard.pluggy.ai"

/** Tom de um status: define o ícone (a cor nunca vai sozinha, sempre com texto). */
export type Tone = "good" | "neutral" | "warning" | "critical" | "running"

export interface StatusView {
  tone: Tone
  label: string
}

export const MODE_LABEL: Record<OpenFinanceMode, string> = {
  pluggy: "Meu Pluggy (seus bancos)",
  fake: "Dados de exemplo",
}

// ------------------------------------------------------------------ status dos bancos

/** Status do item na Pluggy → rótulo em pt-BR. Desconhecido não vira alarme: fica neutro. */
export function itemStatusView(status: string | null): StatusView {
  switch (status) {
    case "UPDATED":
      return { tone: "good", label: "Atualizado" }
    case "UPDATING":
    case "CREATED":
      return { tone: "running", label: "Atualizando…" }
    case "LOGIN_ERROR":
    case "WAITING_USER_INPUT":
    case "WAITING_USER_ACTION":
      return { tone: "warning", label: "Precisa de login" }
    case "OUTDATED":
    case "ERROR":
      return { tone: "critical", label: "Erro" }
    default:
      return { tone: "neutral", label: "Sem status" }
  }
}

/** O banco pede alguma ação do usuário (reconectar no Meu Pluggy) ou falhou. */
export function itemNeedsAttention(item: Pick<OpenFinanceItem, "status">): boolean {
  const { tone } = itemStatusView(item.status)
  return tone === "warning" || tone === "critical"
}

/** Nome do banco para a tela; sem nome (a Pluggy ainda não respondeu), o começo do id. */
export function itemTitle(item: Pick<OpenFinanceItem, "id" | "institutionName">): string {
  return item.institutionName?.trim() || `Item ${item.id.slice(0, 8)}…`
}

/** "Atualizado pela Pluggy há 3 h" / "Ainda sem atualização da Pluggy". */
export function itemUpdatedLabel(item: Pick<OpenFinanceItem, "lastUpdatedAt">, now: IsoDateTime): string {
  return item.lastUpdatedAt
    ? `Última atualização ${formatRelative(item.lastUpdatedAt, now)}`
    : "Ainda sem atualização da Pluggy"
}

// ------------------------------------------------------------------ estado da seção

export interface OpenFinanceView {
  /** Resumo no topo do cartão. */
  overall: StatusView
  /** Nada configurado: a sincronização não faz nada até escolher a fonte. */
  notConfigured: boolean
  /** Dados de exemplo (DATA_SOURCE=mock): tudo desabilitado. */
  readOnly: boolean
  mode: {
    value: OpenFinanceMode | "none"
    /** Definido pela variável FINANCE_PROVIDER: não dá para trocar aqui. */
    locked: boolean
    /** Por que não dá para trocar (variável de ambiente ou modo de exemplo). */
    hint: string | null
    /** Meu Pluggy escolhido, mas ainda falta algo para sincronizar. */
    missing: string | null
  }
  credentials: {
    configured: boolean
    /** Definidas por variáveis de ambiente: só leitura aqui. */
    fromEnv: boolean
    status: StatusView & { detail: string | null }
    /** Formulário de salvar/trocar. */
    editable: boolean
    removable: boolean
    hint: string | null
  }
  items: {
    list: OpenFinanceItem[]
    /** Lista definida por PLUGGY_ITEM_IDS: só leitura aqui. */
    fromEnv: boolean
    canAdd: boolean
    canRemove: boolean
    /** Por que não dá para adicionar (ou remover). */
    hint: string | null
    /** Bancos só sincronizam com a fonte Meu Pluggy. */
    inactiveNote: string | null
    attention: number
  }
  /** Passos concluídos: fonte escolhida → credenciais salvas → ao menos um banco. */
  steps: { mode: boolean; credentials: boolean; items: boolean }
}

export const MODE_ENV_HINT =
  "Definido pelo servidor (FINANCE_PROVIDER no .env da API). Para escolher aqui, remova essa variável e reinicie a API."
export const CREDENTIALS_ENV_HINT =
  "Para trocar pelo app, remova PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET do .env da API e reinicie."
export const ITEMS_ENV_HINT =
  "Lista definida pelo servidor (PLUGGY_ITEM_IDS no .env da API). Para gerenciar aqui, remova essa variável e reinicie a API."
export const ITEMS_NEED_CREDENTIALS_HINT =
  "Salve as credenciais da Pluggy primeiro: é com elas que o Meu Caixa confere cada banco."

export function openFinanceView(
  settings: OpenFinanceSettings,
  options: { canWrite: boolean; readOnlyHint: string },
): OpenFinanceView {
  const { mode, credentials, items } = settings
  const readOnly = !options.canWrite
  const attention = items.list.filter(itemNeedsAttention).length

  const modeLocked = mode.source === "env"
  const credentialsFromEnv = credentials.source === "env"
  const itemsFromEnv = items.source === "env"

  let missing: string | null = null
  if (mode.value === "pluggy" && !credentials.configured) missing = "Falta salvar as credenciais da Pluggy (passo 2)."
  else if (mode.value === "pluggy" && items.list.length === 0) missing = "Falta adicionar ao menos um banco (passo 3)."

  let credentialsStatus: OpenFinanceView["credentials"]["status"]
  if (credentials.configured && credentialsFromEnv) {
    credentialsStatus = { tone: "good", label: "Definidas pelo servidor (variáveis de ambiente)", detail: null }
  } else if (credentials.configured) {
    credentialsStatus = {
      tone: "good",
      label: credentials.clientIdHint
        ? `Conectado à Pluggy — Client ID ${credentials.clientIdHint}`
        : "Conectado à Pluggy",
      detail: credentials.updatedAt ? `Salvas em ${formatDateTime(credentials.updatedAt)}` : null,
    }
  } else {
    credentialsStatus = { tone: "neutral", label: "Não configuradas", detail: null }
  }

  let itemsHint: string | null = null
  if (readOnly) itemsHint = options.readOnlyHint
  else if (itemsFromEnv) itemsHint = ITEMS_ENV_HINT
  else if (!credentials.configured) itemsHint = ITEMS_NEED_CREDENTIALS_HINT

  return {
    overall: overallStatus(settings, attention),
    notConfigured: mode.value === "none",
    readOnly,
    mode: {
      value: mode.value,
      locked: modeLocked,
      hint: readOnly ? options.readOnlyHint : modeLocked ? MODE_ENV_HINT : null,
      missing,
    },
    credentials: {
      configured: credentials.configured,
      fromEnv: credentialsFromEnv,
      status: credentialsStatus,
      editable: !readOnly && !credentialsFromEnv,
      removable: !readOnly && !credentialsFromEnv && credentials.configured,
      hint: readOnly ? options.readOnlyHint : credentialsFromEnv ? CREDENTIALS_ENV_HINT : null,
    },
    items: {
      list: items.list,
      fromEnv: itemsFromEnv,
      canAdd: !readOnly && !itemsFromEnv && credentials.configured,
      canRemove: !readOnly && !itemsFromEnv,
      hint: itemsHint,
      inactiveNote:
        mode.value === "pluggy" || items.list.length === 0
          ? null
          : mode.value === "fake"
            ? "A fonte atual é “Dados de exemplo”: estes bancos só são sincronizados com a fonte Meu Pluggy."
            : "Escolha a fonte Meu Pluggy (passo 1) para estes bancos serem sincronizados.",
      attention,
    },
    steps: {
      mode: mode.value !== "none",
      credentials: credentials.configured,
      items: items.list.length > 0,
    },
  }
}

function overallStatus(settings: OpenFinanceSettings, attention: number): StatusView {
  const { mode, credentials, items } = settings
  if (mode.value === "none") return { tone: "neutral", label: "Não configurado" }
  if (mode.value === "fake") return { tone: "neutral", label: "Usando dados de exemplo" }
  if (!credentials.configured) return { tone: "warning", label: "Faltam as credenciais" }
  if (items.list.length === 0) return { tone: "warning", label: "Nenhum banco adicionado" }
  if (attention > 0) {
    const critical = items.list.some((item) => itemStatusView(item.status).tone === "critical")
    return {
      tone: critical ? "critical" : "warning",
      label: attention === 1 ? "1 banco pede atenção" : `${attention} bancos pedem atenção`,
    }
  }
  return { tone: "good", label: "Conectado" }
}

// ------------------------------------------------------------------ troca de fonte

export interface ModeSwitchCopy {
  title: string
  description: string
  confirm: string
}

/**
 * Confirmação da troca de fonte. Sem fonte escolhida ainda (`none`) não há dados do outro modo
 * para apagar: troca direto, sem diálogo (null).
 */
export function modeSwitchCopy(from: OpenFinanceMode | "none", to: OpenFinanceMode): ModeSwitchCopy | null {
  if (from === "none" || from === to) return null
  if (to === "fake") {
    return {
      title: "Usar dados de exemplo?",
      description:
        "Os dados sincronizados dos seus bancos (contas, transações, faturas e as categorias que você ajustou nelas) serão apagados do Meu Caixa. O planejamento — compromissos, metas e categorias de orçamento — continua. As credenciais e a lista de bancos ficam salvas para quando você voltar.",
      confirm: "Apagar e usar exemplo",
    }
  }
  return {
    title: "Usar seus bancos (Meu Pluggy)?",
    description:
      "Os dados de exemplo (contas, transações, faturas e as categorias ajustadas nelas) serão apagados. O planejamento — compromissos, metas e categorias de orçamento — continua. Em seguida o Meu Caixa sincroniza os bancos adicionados aqui.",
    confirm: "Apagar exemplo e trocar",
  }
}

export function modeSuccessToast(to: OpenFinanceMode): { title: string; description: string } {
  return to === "pluggy"
    ? { title: "Fonte: Meu Pluggy", description: "A sincronização dos seus bancos começou. Acompanhe em Contas." }
    : { title: "Fonte: dados de exemplo", description: "A sincronização dos dados de exemplo começou. Acompanhe em Contas." }
}

// ------------------------------------------------------------------ validação

const UUID_SOURCE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
const UUID = new RegExp(`^${UUID_SOURCE}$`, "i")
const UUID_ANYWHERE = new RegExp(UUID_SOURCE, "gi")
const UUID_EXAMPLE = "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d"

export type CredentialsErrors = Partial<Record<keyof OpenFinanceCredentialsInput, string>>

export type Validation<T, E> = { ok: true; value: T } | { ok: false; errors: E }

/** Remove espaços e aspas que vêm junto ao copiar de um JSON ou de um .env. */
function cleanPasted(raw: string): string {
  return raw.trim().replace(/^["']+|["']+$/g, "").trim()
}

/** Confere o formato antes de ir à Pluggy (a API testa as credenciais de verdade). */
export function validateCredentials(input: OpenFinanceCredentialsInput): Validation<OpenFinanceCredentialsInput, CredentialsErrors> {
  const clientId = cleanPasted(input.clientId)
  const clientSecret = cleanPasted(input.clientSecret)
  const errors: CredentialsErrors = {}

  if (!clientId) errors.clientId = "Cole o Client ID da sua aplicação na Pluggy."
  else if (!UUID.test(clientId))
    errors.clientId = `O Client ID tem 36 caracteres, no formato ${UUID_EXAMPLE}. Confira se copiou inteiro.`

  if (!clientSecret) errors.clientSecret = "Cole o Client Secret da sua aplicação na Pluggy."
  else if (/\s/.test(clientSecret)) errors.clientSecret = "O Client Secret não tem espaços. Confira se copiou só ele, inteiro."
  else if (clientSecret.toLowerCase() === clientId.toLowerCase())
    errors.clientSecret = "Este é o Client ID de novo. Copie o outro campo, o Client Secret."

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value: { clientId, clientSecret } }
}

/**
 * Id do item: aceita o id puro ou um texto que o contenha (um link do dashboard da Pluggy, por exemplo),
 * desde que tenha um id só.
 */
export function parseItemId(raw: string, existing: readonly string[]): Validation<string, string> {
  const text = cleanPasted(raw)
  if (!text) return { ok: false, errors: "Cole o id do item do banco." }
  const found = [...new Set((text.match(UUID_ANYWHERE) ?? []).map((id) => id.toLowerCase()))]
  if (found.length === 0)
    return { ok: false, errors: `O id do item tem 36 caracteres, no formato ${UUID_EXAMPLE}. Confira se copiou inteiro.` }
  if (found.length > 1) return { ok: false, errors: "Encontrei mais de um id no texto colado. Adicione um banco por vez." }
  const [itemId] = found
  if (existing.some((id) => id.toLowerCase() === itemId)) return { ok: false, errors: "Esse banco já está na lista." }
  return { ok: true, value: itemId }
}

// ------------------------------------------------------------------ erros da API

export type SettingsAction = "mode" | "credentials" | "removeCredentials" | "item" | "removeItem"

export interface SettingsError {
  title: string
  description: string
}

const TITLE: Record<SettingsAction, string> = {
  mode: "Não foi possível trocar a fonte",
  credentials: "Não foi possível salvar as credenciais",
  removeCredentials: "Não foi possível remover as credenciais",
  item: "Não foi possível adicionar o banco",
  removeItem: "Não foi possível remover o banco",
}

/** Mensagem do servidor, quando ele mandou uma de verdade (não o "Erro 400" genérico do cliente). */
function serverMessage(error: unknown): string | null {
  const message = error instanceof Error ? error.message.trim() : ""
  return message && !/^Erro \d{3}$/.test(message) ? message : null
}

/** Erro de uma ação → título e explicação em pt-BR, com o que fazer. */
export function settingsError(error: unknown, action: SettingsAction): SettingsError {
  const status =
    typeof error === "object" && error !== null && "status" in error ? Number((error as { status: unknown }).status) : null
  const message = serverMessage(error)
  const title = TITLE[action]

  if (status === null)
    return { title, description: "Sem resposta do servidor. Verifique a conexão e tente de novo." }
  if (status === 400 && action === "credentials")
    return {
      title: "A Pluggy não aceitou as credenciais",
      description: message ?? "Confira o Client ID e o Client Secret no dashboard da Pluggy e cole de novo.",
    }
  if (status === 400 && action === "item")
    return {
      title: "A Pluggy não confirmou esse item",
      description:
        message ?? "Confira o id: ele precisa ser de um banco conectado com a mesma conta das credenciais salvas.",
    }
  if (status === 502)
    return {
      title: "Não deu para falar com a Pluggy",
      description: message ?? "A Pluggy não respondeu agora. Tente de novo em instantes.",
    }
  if (status === 409) return { title, description: message ?? "A configuração mudou. Atualize a página e tente de novo." }
  if (status === 400) return { title, description: message ?? "A API não aceitou o pedido. Confira e tente de novo." }
  if (status === 401) return { title, description: "Sua sessão expirou. Entre de novo para continuar." }
  if (status === 403) return { title, description: "Seu usuário não tem permissão para mudar as configurações." }
  if (status === 404)
    return {
      title,
      description: "Esse banco não está mais na lista (talvez tenha sido removido em outra aba). Atualize a página.",
    }
  if (status >= 500) return { title, description: "O servidor não conseguiu concluir agora. Tente de novo em instantes." }
  return { title, description: message ?? "Tente de novo." }
}
