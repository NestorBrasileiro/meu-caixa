import { describe, expect, it } from "vitest"
import { dueDate, firstDueDate, installmentDueDate, installmentsPaid } from "./schedule"

describe("planning/schedule: vencimentos", () => {
  it("limita o dia ao fim do mês", () => {
    expect(dueDate("2026-02", 31)).toBe("2026-02-28")
    expect(dueDate("2028-02", 30)).toBe("2028-02-29")
    expect(dueDate("2026-04", 31)).toBe("2026-04-30")
    expect(dueDate("2026-10", 5)).toBe("2026-10-05")
  })

  it("1ª parcela no mês do início se o dia ainda não passou, senão no seguinte", () => {
    expect(firstDueDate("2026-10-08", 10)).toBe("2026-10-10")
    expect(firstDueDate("2026-10-08", 8)).toBe("2026-10-08")
    expect(firstDueDate("2026-10-08", 5)).toBe("2026-11-05")
    expect(firstDueDate("2026-01-31", 31)).toBe("2026-01-31")
    expect(firstDueDate("2026-01-31", 30)).toBe("2026-02-28")
  })

  it("parcela n vence n − 1 meses depois da 1ª, com o dia limitado ao mês", () => {
    expect(installmentDueDate("2023-09-10", 10, 120)).toBe("2033-08-10")
    expect(installmentDueDate("2026-01-31", 31, 2)).toBe("2026-02-28")
    expect(installmentDueDate("2026-01-31", 31, 3)).toBe("2026-03-31")
    expect(installmentDueDate("2026-10-20", 5, 1)).toBe("2026-11-05")
  })
})

describe("planning/schedule: parcelas pagas", () => {
  it("conta só os vencimentos estritamente antes de hoje", () => {
    // Set/2023 a set/2026; a de 10/out ainda não venceu em 07/out.
    expect(installmentsPaid("2023-09-10", 10, 120, "2026-10-07")).toBe(37)
    // No dia do vencimento a parcela ainda é a próxima.
    expect(installmentsPaid("2023-09-10", 10, 120, "2026-10-10")).toBe(37)
    expect(installmentsPaid("2023-09-10", 10, 120, "2026-10-11")).toBe(38)
  })

  it("usa o dia do compromisso, não o dia do início", () => {
    // Começa em 20/09 e vence dia 5: a 1ª é 05/10.
    expect(installmentsPaid("2026-09-20", 5, 10, "2026-10-05")).toBe(0)
    expect(installmentsPaid("2026-09-20", 5, 10, "2026-10-06")).toBe(1)
    // Começa em 01/09 e vence dia 20: a de setembro já conta em 21/09.
    expect(installmentsPaid("2026-09-01", 20, 10, "2026-09-21")).toBe(1)
  })

  it("dia 31 em mês curto vence no último dia", () => {
    // 31/01, 28/02: em 01/03 já são 2.
    expect(installmentsPaid("2026-01-31", 31, 12, "2026-03-01")).toBe(2)
    expect(installmentsPaid("2026-01-31", 31, 12, "2026-02-28")).toBe(1)
  })

  it("não começou = 0; acabou = total", () => {
    expect(installmentsPaid("2026-11-01", 10, 12, "2026-10-09")).toBe(0)
    expect(installmentsPaid("2020-01-10", 10, 12, "2026-10-09")).toBe(12)
    expect(installmentsPaid("2020-01-10", 10, null, "2020-03-11")).toBe(3)
  })
})
