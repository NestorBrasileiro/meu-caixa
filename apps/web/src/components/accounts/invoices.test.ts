import { describe, expect, it } from "vitest"
import type { Invoice } from "@/lib/api/types"
import { buildInvoiceHistory, findOpenInvoice, hasClosed, niceAxis, periodLabel } from "./invoices"

const CARD = { id: "card", name: "Cartão Exemplo Platinum" }

const invoice = (dueDate: string, closingDate: string | null, total: number): Invoice =>
  ({ id: `inv-${dueDate}`, accountId: CARD.id, dueDate, closingDate, total }) as Invoice

const INVOICES = [
  invoice("2026-08-15", "2026-08-08", 300_00),
  invoice("2026-09-15", "2026-09-08", 500_00),
  invoice("2026-10-15", "2026-10-08", 400_00),
  // Parcelas futuras: ainda não são uma fatura de verdade.
  invoice("2026-11-15", "2026-11-08", 100_00),
]

describe("accounts/invoices", () => {
  it("fatura em aberto: a de vencimento mais próximo a partir de hoje", () => {
    expect(findOpenInvoice(INVOICES, CARD.id, "2026-10-02")?.dueDate).toBe("2026-10-15")
    expect(findOpenInvoice(INVOICES, CARD.id, "2026-10-15")?.dueDate).toBe("2026-10-15")
    expect(findOpenInvoice(INVOICES, CARD.id, "2026-10-16")?.dueDate).toBe("2026-11-15")
    expect(findOpenInvoice([], CARD.id, "2026-10-02")).toBeNull()
  })

  it("fechou só depois do dia do fechamento", () => {
    expect(hasClosed({ closingDate: "2026-10-08" }, "2026-10-08")).toBe(false)
    expect(hasClosed({ closingDate: "2026-10-08" }, "2026-10-09")).toBe(true)
    expect(hasClosed({ closingDate: null }, "2026-10-09")).toBe(false)
  })

  it("histórico: sem as futuras, com a aberta marcada e a média das fechadas", () => {
    const history = buildInvoiceHistory(CARD, INVOICES, "2026-10-08")
    expect(history.points.map((point) => point.month)).toEqual(["2026-08", "2026-09", "2026-10"])
    expect(history.open?.month).toBe("2026-10")
    expect(history.openHasClosed).toBe(false)
    expect(history.averageClosed).toBe(400_00)
    expect(history.closedCount).toBe(2)
    // Fechou ontem, vence dia 15: ainda é a fatura em aberto, mas não recebe mais compras.
    expect(buildInvoiceHistory(CARD, INVOICES, "2026-10-09").openHasClosed).toBe(true)
  })

  it("cartão sem faturas", () => {
    const history = buildInvoiceHistory(CARD, [], "2026-10-08")
    expect(history).toMatchObject({ points: [], open: null, openHasClosed: false, averageClosed: null, closedCount: 0 })
  })

  it("eixo redondo a partir do zero e período", () => {
    expect(niceAxis(3_600_00)).toEqual({ domain: [0, 4_000_00], ticks: [0, 1_000_00, 2_000_00, 3_000_00, 4_000_00] })
    expect(niceAxis(0).domain).toEqual([0, 100_00])
    expect(periodLabel([{ month: "2026-05" }, { month: "2026-10" }], (m) => m)).toBe("2026-05 a 2026-10")
    expect(periodLabel([], (m) => m)).toBeNull()
  })
})
