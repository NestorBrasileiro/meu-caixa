import { describe, expect, it } from "vitest"
import { getAnalysis, getAnalysisStatus } from "./mock-source"

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
