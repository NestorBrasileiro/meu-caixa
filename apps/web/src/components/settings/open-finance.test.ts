import { describe, expect, it } from "vitest"
import { ClientApiError } from "@/lib/api/client"
import type { OpenFinanceItem, OpenFinanceSettings } from "@/lib/api/settings"
import {
  CREDENTIALS_ENV_HINT,
  ITEMS_ENV_HINT,
  ITEMS_NEED_CREDENTIALS_HINT,
  MODE_ENV_HINT,
  itemStatusView,
  itemTitle,
  itemUpdatedLabel,
  modeSwitchCopy,
  openFinanceView,
  parseItemId,
  settingsError,
  validateCredentials,
} from "./open-finance"

const HINT = "somente leitura"
const NOW = "2026-10-17T12:00:00.000Z"
const ID_A = "0b7c2f4e-5a1d-4c3b-9e8f-000000000001"
const ID_B = "0b7c2f4e-5a1d-4c3b-9e8f-000000000002"
const CLIENT_ID = "1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d"

const item = (patch: Partial<OpenFinanceItem> = {}): OpenFinanceItem => ({
  id: ID_A,
  institutionName: "Nubank",
  status: "UPDATED",
  lastUpdatedAt: "2026-10-17T09:00:00.000Z",
  error: null,
  ...patch,
})

/** Nada configurado: o estado de uma instalação nova. */
const empty: OpenFinanceSettings = {
  mode: { value: "none", source: "default" },
  credentials: { configured: false, source: null, clientIdHint: null, updatedAt: null },
  items: { source: "app", list: [] },
  connectUrl: "https://meu.pluggy.ai",
}

const configured: OpenFinanceSettings = {
  mode: { value: "pluggy", source: "app" },
  credentials: { configured: true, source: "app", clientIdHint: "1a2b3c4d…", updatedAt: "2026-10-01T13:00:00.000Z" },
  items: {
    source: "app",
    list: [item(), item({ id: ID_B, institutionName: "Itaú", status: "LOGIN_ERROR", error: "Senha mudou" })],
  },
  connectUrl: "https://meu.pluggy.ai",
}

const envManaged: OpenFinanceSettings = {
  mode: { value: "pluggy", source: "env" },
  credentials: { configured: true, source: "env", clientIdHint: null, updatedAt: null },
  items: { source: "env", list: [item()] },
  connectUrl: "https://meu.pluggy.ai",
}

const view = (settings: OpenFinanceSettings, canWrite = true) =>
  openFinanceView(settings, { canWrite, readOnlyHint: HINT })

describe("settings/open-finance — estado da seção", () => {
  it("instalação nova: não configurado, credenciais para salvar, bancos esperando as credenciais", () => {
    const v = view(empty)
    expect(v.notConfigured).toBe(true)
    expect(v.overall).toEqual({ tone: "neutral", label: "Não configurado" })
    expect(v.mode).toMatchObject({ value: "none", locked: false, hint: null, missing: null })
    expect(v.credentials).toMatchObject({
      configured: false,
      editable: true,
      removable: false,
      status: { tone: "neutral", label: "Não configuradas" },
    })
    expect(v.items).toMatchObject({ canAdd: false, canRemove: true, hint: ITEMS_NEED_CREDENTIALS_HINT })
    // Sem bancos na lista, não há "estes bancos" para explicar.
    expect(v.items.inactiveNote).toBeNull()
    const noneWithItems = { ...configured, mode: { value: "none" as const, source: "default" as const } }
    expect(view(noneWithItems).items.inactiveNote).toMatch(/passo 1/)
    expect(v.steps).toEqual({ mode: false, credentials: false, items: false })
  })

  it("credenciais salvas e dois bancos, um pedindo login", () => {
    const v = view(configured)
    expect(v.notConfigured).toBe(false)
    expect(v.overall).toEqual({ tone: "warning", label: "1 banco pede atenção" })
    expect(v.credentials.status).toEqual({
      tone: "good",
      label: "Conectado à Pluggy — Client ID 1a2b3c4d…",
      detail: "Salvas em 01 out, 10:00",
    })
    expect(v.credentials).toMatchObject({ editable: true, removable: true, hint: null })
    expect(v.items).toMatchObject({ canAdd: true, canRemove: true, hint: null, inactiveNote: null, attention: 1 })
    expect(v.steps).toEqual({ mode: true, credentials: true, items: true })
  })

  it("banco com erro deixa o resumo crítico; tudo atualizado, conectado", () => {
    const withError = { ...configured, items: { source: "app" as const, list: [item({ status: "OUTDATED" })] } }
    expect(view(withError).overall).toEqual({ tone: "critical", label: "1 banco pede atenção" })
    const ok = { ...configured, items: { source: "app" as const, list: [item()] } }
    expect(view(ok).overall).toEqual({ tone: "good", label: "Conectado" })
  })

  it("Meu Pluggy sem credenciais ou sem bancos: diz o que falta", () => {
    const noCredentials = { ...empty, mode: { value: "pluggy" as const, source: "app" as const } }
    expect(view(noCredentials).overall.label).toBe("Faltam as credenciais")
    expect(view(noCredentials).mode.missing).toMatch(/credenciais/)
    const noItems = { ...configured, items: { source: "app" as const, list: [] } }
    expect(view(noItems).overall.label).toBe("Nenhum banco adicionado")
    expect(view(noItems).mode.missing).toMatch(/banco/)
  })

  it("dados de exemplo: os bancos ficam guardados, mas não sincronizam", () => {
    const fake = { ...configured, mode: { value: "fake" as const, source: "app" as const } }
    const v = view(fake)
    expect(v.overall).toEqual({ tone: "neutral", label: "Usando dados de exemplo" })
    expect(v.items.inactiveNote).toMatch(/Dados de exemplo/)
    expect(v.steps.mode).toBe(true)
  })

  it("tudo pelo servidor (variáveis de ambiente): só leitura, com o porquê", () => {
    const v = view(envManaged)
    expect(v.mode).toMatchObject({ locked: true, hint: MODE_ENV_HINT })
    expect(v.credentials).toMatchObject({
      fromEnv: true,
      editable: false,
      removable: false,
      hint: CREDENTIALS_ENV_HINT,
      status: { tone: "good", label: "Definidas pelo servidor (variáveis de ambiente)" },
    })
    expect(v.items).toMatchObject({ fromEnv: true, canAdd: false, canRemove: false, hint: ITEMS_ENV_HINT })
  })

  it("credenciais pelo servidor, bancos pelo app: dá para adicionar bancos", () => {
    const mixed = { ...envManaged, items: { source: "app" as const, list: [] } }
    expect(view(mixed).items).toMatchObject({ canAdd: true, canRemove: true, hint: null })
  })

  it("modo mock (sem API): tudo desabilitado com a dica de somente leitura", () => {
    const v = view(configured, false)
    expect(v.readOnly).toBe(true)
    expect(v.mode.hint).toBe(HINT)
    expect(v.credentials).toMatchObject({ editable: false, removable: false, hint: HINT })
    expect(v.items).toMatchObject({ canAdd: false, canRemove: false, hint: HINT })
  })
})

describe("settings/open-finance — status dos bancos", () => {
  it.each([
    ["UPDATED", "good", "Atualizado"],
    ["UPDATING", "running", "Atualizando…"],
    ["CREATED", "running", "Atualizando…"],
    ["LOGIN_ERROR", "warning", "Precisa de login"],
    ["WAITING_USER_INPUT", "warning", "Precisa de login"],
    ["OUTDATED", "critical", "Erro"],
    [null, "neutral", "Sem status"],
    ["ALGO_NOVO", "neutral", "Sem status"],
  ])("%s → %s / %s", (status, tone, label) => {
    expect(itemStatusView(status)).toEqual({ tone, label })
  })

  it("nome do banco, ou o começo do id enquanto a Pluggy não deu o nome", () => {
    expect(itemTitle(item())).toBe("Nubank")
    expect(itemTitle(item({ institutionName: null }))).toBe("Item 0b7c2f4e…")
    expect(itemTitle(item({ institutionName: "  " }))).toBe("Item 0b7c2f4e…")
  })

  it("última atualização relativa ao agora", () => {
    expect(itemUpdatedLabel(item(), NOW)).toBe("Última atualização há 3 h")
    expect(itemUpdatedLabel(item({ lastUpdatedAt: null }), NOW)).toBe("Ainda sem atualização da Pluggy")
  })
})

describe("settings/open-finance — troca de fonte", () => {
  it("sem fonte ainda, ou a mesma: sem diálogo", () => {
    expect(modeSwitchCopy("none", "pluggy")).toBeNull()
    expect(modeSwitchCopy("pluggy", "pluggy")).toBeNull()
  })

  it("trocar avisa o que é apagado e que o planejamento fica", () => {
    const toFake = modeSwitchCopy("pluggy", "fake")!
    expect(toFake.description).toMatch(/seus bancos.*apagados/)
    expect(toFake.description).toMatch(/planejamento.*continua/)
    const toPluggy = modeSwitchCopy("fake", "pluggy")!
    expect(toPluggy.description).toMatch(/dados de exemplo.*apagados/)
    expect(toPluggy.description).toMatch(/planejamento.*continua/)
  })
})

describe("settings/open-finance — validação", () => {
  it("credenciais válidas, limpando espaços e aspas coladas junto", () => {
    expect(validateCredentials({ clientId: `  "${CLIENT_ID}" `, clientSecret: " 'segredo-123' " })).toEqual({
      ok: true,
      value: { clientId: CLIENT_ID, clientSecret: "segredo-123" },
    })
  })

  it("campos vazios", () => {
    const result = validateCredentials({ clientId: " ", clientSecret: "" })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.clientId).toMatch(/Cole o Client ID/)
      expect(result.errors.clientSecret).toMatch(/Cole o Client Secret/)
    }
  })

  it("Client ID fora do formato, secret com espaço ou igual ao Client ID", () => {
    const short = validateCredentials({ clientId: "1a2b3c4d", clientSecret: "abc def" })
    expect(short.ok || short.errors).toMatchObject({
      clientId: expect.stringMatching(/36 caracteres/),
      clientSecret: expect.stringMatching(/não tem espaços/),
    })
    const same = validateCredentials({ clientId: CLIENT_ID, clientSecret: CLIENT_ID.toUpperCase() })
    expect(same.ok || same.errors).toEqual({ clientSecret: expect.stringMatching(/Client ID de novo/) })
  })

  it("id do item: puro, dentro de um link ou em maiúsculas", () => {
    expect(parseItemId(ID_A, [])).toEqual({ ok: true, value: ID_A })
    expect(parseItemId(`https://dashboard.pluggy.ai/items/${ID_A}?tab=x`, [])).toEqual({ ok: true, value: ID_A })
    expect(parseItemId(ID_A.toUpperCase(), [])).toEqual({ ok: true, value: ID_A })
  })

  it("id do item: vazio, inválido, dois ids ou já adicionado", () => {
    expect(parseItemId("  ", [])).toEqual({ ok: false, errors: "Cole o id do item do banco." })
    expect(parseItemId("abc", [])).toMatchObject({ ok: false, errors: expect.stringMatching(/36 caracteres/) })
    expect(parseItemId(`${ID_A} ${ID_B}`, [])).toMatchObject({ ok: false, errors: expect.stringMatching(/um banco por vez/) })
    expect(parseItemId(ID_A, [ID_A.toUpperCase()])).toEqual({ ok: false, errors: "Esse banco já está na lista." })
  })
})

describe("settings/open-finance — erros da API", () => {
  it("400 nas credenciais: a Pluggy recusou, com a mensagem do servidor", () => {
    expect(settingsError(new ClientApiError(400, "Client ID ou Client Secret inválidos"), "credentials")).toEqual({
      title: "A Pluggy não aceitou as credenciais",
      description: "Client ID ou Client Secret inválidos",
    })
  })

  it("sem mensagem do servidor (o 'Erro 400' genérico do cliente): explicação própria", () => {
    expect(settingsError(new ClientApiError(400, "Erro 400"), "item")).toEqual({
      title: "A Pluggy não confirmou esse item",
      description: expect.stringMatching(/mesma conta das credenciais/),
    })
    expect(settingsError(new ClientApiError(502, "Erro 502"), "credentials")).toEqual({
      title: "Não deu para falar com a Pluggy",
      description: "A Pluggy não respondeu agora. Tente de novo em instantes.",
    })
  })

  it("409 usa a explicação do servidor (env, sem credenciais, já adicionado)", () => {
    expect(settingsError(new ClientApiError(409, "Esse item já foi adicionado."), "item")).toEqual({
      title: "Não foi possível adicionar o banco",
      description: "Esse item já foi adicionado.",
    })
  })

  it("rede, sessão, permissão, 404 e 5xx", () => {
    expect(settingsError(new TypeError("Failed to fetch"), "mode").description).toMatch(/Sem resposta do servidor/)
    expect(settingsError(new ClientApiError(401, "x"), "mode").description).toMatch(/sessão expirou/)
    expect(settingsError(new ClientApiError(403, "x"), "mode").description).toMatch(/permissão/)
    expect(settingsError(new ClientApiError(404, "x"), "removeItem")).toMatchObject({
      title: "Não foi possível remover o banco",
      description: expect.stringMatching(/não está mais na lista/),
    })
    expect(settingsError(new ClientApiError(500, "boom"), "removeCredentials").description).toMatch(/servidor não conseguiu/)
  })
})
