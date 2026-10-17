import { describe, expect, it } from "vitest"
import type { Insight } from "@/lib/api/analysis"
import {
  groupInsights,
  modelLabel,
  periodLabel,
  reportDescription,
  reportFootnote,
  savingsRows,
  splitPercent,
} from "./model"

const report = { generatedAt: "2026-10-07T12:05:00Z", period: { from: "2026-07-01", to: "2026-09-30" } }

const insight = (id: string, kind: Insight["kind"], monthlySavings: number | null): Insight => ({
  id,
  kind,
  title: id,
  explanation: "Explicação.",
  monthlySavings,
  evidence: null,
  confidence: "HIGH",
})

describe("analysis/model — origem do relatório", () => {
  const origin = { ...report, source: "MCP" as const, model: null, sample: false }

  it("o exemplo não diz que foi gerado nem por quem", () => {
    const parts = reportDescription({ ...origin, sample: true })
    expect(parts).toEqual(["Exemplo do relatório do Claude", "período 01 jul a 30 set"])
    expect(parts.join(" ")).not.toMatch(/Gerada|MCP|app/)
  })

  it("relatório salvo pelo Claude do usuário: quando, via MCP e o período", () => {
    const parts = reportDescription(origin)
    expect(parts[0]).toMatch(/^Gerada em 07 out, 09:05$/)
    expect(parts.slice(1)).toEqual(["pelo seu Claude (MCP)", "período 01 jul a 30 set"])
  })

  it("relatório gerado pelo app: diz o modelo quando a API informa", () => {
    expect(reportDescription({ ...origin, source: "APP", model: "claude-sonnet-4-5-20250929" }).slice(1)).toEqual([
      "pelo app",
      "Claude Sonnet 4.5",
      "período 01 jul a 30 set",
    ])
    expect(reportDescription({ ...origin, source: "APP" }).slice(1)).toEqual(["pelo app", "período 01 jul a 30 set"])
  })

  it("nome do modelo legível, sem inventar nome para formatos desconhecidos", () => {
    expect(modelLabel("claude-opus-4-1")).toBe("Claude Opus 4.1")
    expect(modelLabel("claude-haiku-4-5-20251001")).toBe("Claude Haiku 4.5")
    expect(modelLabel("claude-sonnet-5")).toBe("Claude Sonnet 5")
    expect(modelLabel("claude-3-5-haiku-20241022")).toBe("claude-3-5-haiku-20241022")
    expect(modelLabel("gpt-qualquer")).toBe("gpt-qualquer")
  })

  it("a nota de rodapé só afirma ter lido as transações quando a análise é real", () => {
    expect(reportFootnote(true)).not.toMatch(/gerada pelo Claude a partir das suas transações/)
    expect(reportFootnote(false)).toMatch(/gerada pelo Claude a partir das suas transações/)
  })
})

describe("analysis/model", () => {
  it("agrupa na ordem do relatório, maior economia primeiro e sem grupos vazios", () => {
    const groups = groupInsights([insight("a", "LEAK", 10), insight("b", "SIN", null), insight("c", "LEAK", 30)])
    expect(groups.map((group) => [group.kind, group.insights.map((i) => i.id)])).toEqual([
      ["SIN", ["b"]],
      ["LEAK", ["c", "a"]],
    ])
  })

  it("lista só o que tem economia estimada", () => {
    expect(
      savingsRows([insight("a", "CUT", 0), insight("b", "CUT", 5), insight("c", "SUGGESTION", null)]),
    ).toHaveLength(1)
  })

  it("percentuais somam 100 e zeram sem gasto", () => {
    expect(splitPercent(1, 2)).toEqual([33, 67])
    expect(splitPercent(0, 0)).toEqual([0, 0])
  })

  it("rotula o período por meses inteiros", () => {
    expect(periodLabel(report.period)).toBe("jul a set")
  })
})
