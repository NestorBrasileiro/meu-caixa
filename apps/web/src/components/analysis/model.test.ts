import { describe, expect, it } from "vitest"
import type { Insight } from "@/lib/api/analysis"
import { groupInsights, periodLabel, reportDescription, reportFootnote, savingsRows, splitPercent } from "./model"

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

describe("analysis/model — relatório de exemplo", () => {
  it("o exemplo não diz que foi gerado nem que veio via MCP", () => {
    const parts = reportDescription(report, true)
    expect(parts).toEqual(["Exemplo do relatório do Claude", "período 01 jul a 30 set"])
    expect(parts.join(" ")).not.toMatch(/Gerada|MCP/)
  })

  it("o relatório real diz quando foi gerado e de onde veio", () => {
    const parts = reportDescription(report, false)
    expect(parts[0]).toMatch(/^Gerada em /)
    expect(parts.slice(1)).toEqual(["período 01 jul a 30 set", "via MCP"])
  })

  it("a nota de rodapé só afirma ter lido as transações quando a análise é real", () => {
    expect(reportFootnote(true)).not.toMatch(/gerada automaticamente a partir das suas transações/)
    expect(reportFootnote(false)).toMatch(/gerada automaticamente a partir das suas transações/)
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
