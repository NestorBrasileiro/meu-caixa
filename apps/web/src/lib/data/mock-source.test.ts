import { describe, expect, it } from "vitest"
import { MOCK_TODAY } from "@/lib/mock/generator"
import { getAnalysis, getAnalysisStatus, getConnections, getExportOptions, getLoans } from "./mock-source"

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

describe("lib/data/mock-source — exportação e empréstimos", () => {
  it("opções da exportação: o catálogo do contrato, com os últimos 3 meses até hoje", async () => {
    const options = await getExportOptions()
    expect(options.formats.map((format) => format.id)).toEqual(["xlsx", "pdf", "csv", "md"])
    expect(options.sections[0].id).toBe("resumo")
    expect(options.sections).toHaveLength(15)
    expect(options.defaultPeriod).toEqual({ from: "2026-08-01", to: MOCK_TODAY })
    expect(options.maxMonths).toBe(24)
  })

  it("empréstimos dos bancos do dataset", async () => {
    const loans = await getLoans()
    const connections = new Set((await getConnections()).map((connection) => connection.id))
    expect(loans).toHaveLength(2)
    for (const loan of loans) expect(connections.has(loan.connectionId)).toBe(true)
  })
})
