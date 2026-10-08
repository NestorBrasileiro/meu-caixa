import { describe, expect, it } from "vitest"
import { buildAnalysis } from "./analysis"
import { IDS, MOCK_TODAY, mockDataset } from "./generator"
import { buildPlanning } from "./planning"

describe("dataset mocado", () => {
  const data = mockDataset()

  it("é determinístico", () => {
    expect(mockDataset()).toBe(data)
    expect(data.transactions.length).toBeGreaterThan(400)
  })

  it("não tem transações no futuro nem ids repetidos", () => {
    expect(data.transactions.every((tx) => tx.date <= MOCK_TODAY)).toBe(true)
    expect(new Set(data.transactions.map((tx) => tx.id)).size).toBe(data.transactions.length)
  })

  it("o saldo do cartão é a fatura aberta e cada fatura vencida foi paga no valor exato", () => {
    const card = data.accounts.find((a) => a.id === IDS.creditCard)!
    const open = data.invoices.find((i) => i.dueDate >= MOCK_TODAY)!
    expect(card.balance).toBe(open.total)
    expect(card.availableCredit).toBe(card.creditLimit! - card.balance)

    const payments = data.transactions.filter((tx) => tx.category === "Credit card payment")
    for (const payment of payments) {
      const invoice = data.invoices.find((i) => i.dueDate === payment.date)!
      expect(-payment.amount).toBe(invoice.total)
    }
  })

  it("a conexão que pede login parou de sincronizar", () => {
    const digital = data.accounts.find((a) => a.id === IDS.digitalChecking)!
    expect(digital.connectionStatus).toBe("ACTION_REQUIRED")
    const last = data.transactions.filter((tx) => tx.accountId === digital.id).map((tx) => tx.date).sort().at(-1)!
    expect(last <= digital.transactionsSyncedThrough!).toBe(true)
  })

  it("planejamento e análise saem coerentes com os dados", () => {
    const planning = buildPlanning(data)
    expect(planning.projections).toHaveLength(6)
    expect(planning.projections[0].month).toBe("2026-11")

    const analysis = buildAnalysis(data)
    expect(analysis.potentialMonthlySavings).toBeGreaterThan(0)
    expect(analysis.insights.every((i) => i.evidence === null || i.evidence.total > 0)).toBe(true)
  })
})
