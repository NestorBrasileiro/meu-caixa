import { describe, expect, it } from "vitest"
import { getAnalysis, getAnalysisStatus, getConnections, getOpenFinanceSettings } from "./mock-source"

describe("lib/data/mock-source — análise", () => {
  it("o relatório do modo mock é marcado como exemplo", async () => {
    const report = await getAnalysis()
    expect(report).toMatchObject({ sample: true, id: "exemplo" })
    expect(report?.insights.length).toBeGreaterThan(0)
  })

  it("sem API não há chave da Anthropic: gerar e perguntar ficam indisponíveis", async () => {
    expect(await getAnalysisStatus()).toEqual({ app: { enabled: false, model: null }, latestRun: null })
  })
})

describe("lib/data/mock-source — Open Finance", () => {
  it("exemplo: Meu Pluggy pelo app, credenciais salvas e um item por banco do dataset", async () => {
    const settings = await getOpenFinanceSettings()
    const connections = await getConnections()
    expect(settings.mode).toEqual({ value: "pluggy", source: "app" })
    expect(settings.credentials).toMatchObject({ configured: true, source: "app", clientIdHint: "1a2b3c4d…" })
    expect(settings.items.list.map((item) => item.institutionName)).toEqual(connections.map((c) => c.institutionName))
    // O banco que pede login no dataset aparece como LOGIN_ERROR, com a explicação.
    expect(settings.items.list.find((item) => item.status === "LOGIN_ERROR")?.error).toBeTruthy()
  })
})
