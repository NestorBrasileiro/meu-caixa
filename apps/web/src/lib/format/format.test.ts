import { describe, expect, it } from "vitest"
import { formatDateShort, formatMonth, formatMonthShort, formatRelative } from "./date"
import { formatAxisMoney, formatMoney, formatPercent } from "./money"

const nbsp = (value: string) => value.replace(/ /g, " ")

describe("format", () => {
  it("formata dinheiro em reais a partir de centavos", () => {
    expect(nbsp(formatMoney(123456))).toBe("R$ 1.234,56")
    expect(nbsp(formatMoney(-4590))).toBe("−R$ 45,90")
    expect(nbsp(formatMoney(900000, { signed: true }))).toBe("+R$ 9.000,00")
    expect(nbsp(formatMoney(0, { signed: true }))).toBe("R$ 0,00")
  })

  it("formata eixos de forma compacta", () => {
    expect(formatAxisMoney(1_250_000)).toBe("12,5 mil")
    expect(formatAxisMoney(-80_000)).toBe("−800")
  })

  it("formata percentuais", () => {
    expect(formatPercent(0.4231)).toBe("42%")
  })

  it("formata datas de calendário sem voltar um dia", () => {
    expect(formatDateShort("2026-10-01")).toBe("01 out")
    expect(formatMonth("2026-10")).toBe("outubro de 2026")
    expect(formatMonthShort("2026-10", true)).toBe("out/26")
  })

  it("formata tempo relativo a um instante de referência", () => {
    expect(formatRelative("2026-10-07T12:00:00Z", "2026-10-07T15:00:00Z")).toBe("há 3 h")
    expect(formatRelative("2026-09-28T10:00:00Z", "2026-10-07T15:00:00Z")).toBe("há 9 dias")
  })
})
