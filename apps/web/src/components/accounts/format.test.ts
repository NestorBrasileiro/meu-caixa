import { describe, expect, it } from "vitest"
import { daysBetween, durationSeconds, formatDayMonth, formatDuration, institutionInitials, plural } from "./format"

describe("accounts/format", () => {
  it("duração da execução: menos de 1 s não vira \"0 s\"", () => {
    expect(durationSeconds("2026-10-08T22:10:31.684Z", "2026-10-08T22:10:31.773Z")).toBe(0)
    expect(formatDuration(0)).toBe("< 1 s")
    expect(formatDuration(41)).toBe("41 s")
    expect(formatDuration(125)).toBe("2 min 05 s")
    expect(durationSeconds("2026-10-08T22:10:31Z", null)).toBeNull()
  })

  it("iniciais, datas e plural", () => {
    expect(institutionInitials("Banco Digital Exemplo")).toBe("BD")
    expect(institutionInitials("Nubank")).toBe("NU")
    expect(formatDayMonth("2026-09-28")).toBe("28/09")
    expect(daysBetween("2026-09-28", "2026-10-02")).toBe(4)
    expect(plural(1, "conta", "contas")).toBe("1 conta")
    expect(plural(0, "conta", "contas")).toBe("0 contas")
  })
})
