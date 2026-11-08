import { describe, expect, it } from "vitest"
import {
  defaultPeriodFor,
  firstOfMonth,
  isIsoDate,
  monthsSpanned,
  periodSummary,
  presetPeriod,
  validatePeriod,
} from "./period"

const DEFAULT = { from: "2026-08-01", to: "2026-10-23" }

describe("isIsoDate", () => {
  it("aceita só datas que existem", () => {
    expect(isIsoDate("2026-10-23")).toBe(true)
    expect(isIsoDate("2024-02-29")).toBe(true)
    expect(isIsoDate("2026-02-29")).toBe(false)
    expect(isIsoDate("2026-13-01")).toBe(false)
    expect(isIsoDate("23/10/2026")).toBe(false)
    expect(isIsoDate("")).toBe(false)
  })
})

describe("firstOfMonth / monthsSpanned", () => {
  it("anda meses atravessando o ano", () => {
    expect(firstOfMonth("2026-10-23")).toBe("2026-10-01")
    expect(firstOfMonth("2026-02-15", -2)).toBe("2025-12-01")
    expect(firstOfMonth("2026-01-31", -12)).toBe("2025-01-01")
    expect(firstOfMonth("2026-12-31", 1)).toBe("2027-01-01")
  })

  it("conta os meses do calendário que o período toca", () => {
    expect(monthsSpanned({ from: "2026-10-01", to: "2026-10-23" })).toBe(1)
    expect(monthsSpanned({ from: "2026-08-15", to: "2026-10-03" })).toBe(3)
    expect(monthsSpanned({ from: "2024-11-30", to: "2026-10-01" })).toBe(24)
  })
})

describe("presetPeriod", () => {
  it("os últimos 3 meses são exatamente o padrão da API", () => {
    expect(presetPeriod("3m", DEFAULT)).toEqual(DEFAULT)
  })

  it("os outros atalhos terminam no fim do padrão, contando o mês corrente", () => {
    expect(presetPeriod("month", DEFAULT)).toEqual({ from: "2026-10-01", to: "2026-10-23" })
    expect(presetPeriod("6m", DEFAULT)).toEqual({ from: "2026-05-01", to: "2026-10-23" })
    expect(presetPeriod("12m", DEFAULT)).toEqual({ from: "2025-11-01", to: "2026-10-23" })
  })

  it("personalizado não tem período próprio", () => {
    expect(presetPeriod("custom", DEFAULT)).toBeNull()
  })

  it("padrão de reserva: os últimos 3 meses até hoje", () => {
    expect(defaultPeriodFor("2026-01-10")).toEqual({ from: "2025-11-01", to: "2026-01-10" })
  })
})

describe("validatePeriod", () => {
  it("período válido não tem erros", () => {
    expect(validatePeriod(DEFAULT, 24)).toEqual({})
    expect(validatePeriod({ from: "2026-10-23", to: "2026-10-23" }, 24)).toEqual({})
  })

  it("datas vazias ou inválidas", () => {
    expect(validatePeriod({ from: "", to: "" }, 24)).toEqual({
      from: "Informe a data inicial.",
      to: "Informe a data final.",
    })
    expect(validatePeriod({ from: "2026-02-30", to: "2026-10-01" }, 24)).toEqual({ from: "Data inicial inválida." })
  })

  it("fim antes do início", () => {
    expect(validatePeriod({ from: "2026-10-02", to: "2026-10-01" }, 24)).toEqual({
      to: "A data final precisa ser igual ou posterior à inicial.",
    })
  })

  it("no máximo maxMonths meses do calendário", () => {
    expect(validatePeriod({ from: "2024-11-01", to: "2026-10-31" }, 24)).toEqual({})
    expect(validatePeriod({ from: "2024-10-31", to: "2026-10-01" }, 24)).toEqual({
      to: "O período pode ter no máximo 24 meses. Encurte o intervalo.",
    })
  })
})

describe("periodSummary", () => {
  it("descreve o período", () => {
    expect(periodSummary(DEFAULT)).toBe("De 01/08/2026 a 23/10/2026 · 3 meses")
    expect(periodSummary({ from: "2026-10-01", to: "2026-10-23" })).toBe("De 01/10/2026 a 23/10/2026 · 1 mês")
    expect(periodSummary({ from: "2026-10-23", to: "2026-10-23" })).toBe("Só 23/10/2026")
  })
})
