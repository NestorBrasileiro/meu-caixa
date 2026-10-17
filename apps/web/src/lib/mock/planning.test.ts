import { describe, expect, it } from "vitest"
import { MOCK_TODAY } from "./generator"
import { COMMITMENTS, paidSince } from "./planning"

describe("planejamento mocado: parcelas pagas (mesma regra da API)", () => {
  it("usa o dia do vencimento, limitado ao fim do mês, e só conta o que venceu antes de hoje", () => {
    expect(MOCK_TODAY).toBe("2026-10-07")
    // Vence hoje (07/10): ainda não está paga.
    expect(paidSince("2026-08-07", 7, 12)).toBe(2)
    // Começou depois do dia 5 de agosto: a 1ª é 05/09.
    expect(paidSince("2026-08-20", 5, 12)).toBe(2)
    // Dia 31: 31/07, 31/08, 30/09.
    expect(paidSince("2026-07-31", 31, 12)).toBe(3)
    // Limitado ao total.
    expect(paidSince("2020-01-10", 10, 12)).toBe(12)
  })

  it("parcelas do terreno: set/2023 a set/2026", () => {
    expect(COMMITMENTS.find((c) => c.id === "cmt-terreno")?.installments).toEqual({ paid: 37, total: 120 })
  })
})
