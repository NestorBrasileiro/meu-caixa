import { describe, expect, it } from "vitest"
import type { Loan } from "@/lib/api/loans"
import { buildLoans } from "@/lib/mock/loans"
import {
  formatAnnualRate,
  installmentCounts,
  loanView,
  overdueLabel,
  ratesLabel,
  sortLoans,
  totalOutstanding,
} from "./loans"

const BASE: Loan = {
  id: "l1",
  connectionId: "c1",
  institutionName: "Banco",
  productName: "Crédito pessoal",
  type: null,
  contractNumber: null,
  contractedAmount: null,
  outstandingBalance: 1_000_00,
  currency: "BRL",
  contractDate: null,
  finalDueDate: null,
  installments: { total: null, paid: null, remaining: null, overdue: null },
  nextInstallment: null,
  installmentAmount: null,
  interestRateAnnual: null,
  cetAnnual: null,
  periodicity: null,
  updatedAt: "2026-10-07T12:00:00.000Z",
}

const loan = (patch: Partial<Loan>): Loan => ({ ...BASE, ...patch })

describe("installmentCounts", () => {
  it("usa pagas e total quando vêm", () => {
    expect(installmentCounts({ total: 36, paid: 14, remaining: 22, overdue: 0 })).toEqual({ paid: 14, total: 36 })
  })

  it("completa o que falta com as restantes", () => {
    expect(installmentCounts({ total: 36, paid: null, remaining: 22, overdue: null })).toEqual({ paid: 14, total: 36 })
    expect(installmentCounts({ total: null, paid: 9, remaining: 3, overdue: null })).toEqual({ paid: 9, total: 12 })
  })

  it("sem dados suficientes (ou total zero): null", () => {
    expect(installmentCounts({ total: 12, paid: null, remaining: null, overdue: null })).toBeNull()
    expect(installmentCounts({ total: 0, paid: 0, remaining: 0, overdue: null })).toBeNull()
  })

  it("pagas nunca passam do total", () => {
    expect(installmentCounts({ total: 10, paid: 12, remaining: null, overdue: null })).toEqual({ paid: 10, total: 10 })
  })
})

describe("loanView", () => {
  it("progresso, atrasadas e próxima parcela (valor de reserva = valor da parcela)", () => {
    const view = loanView(
      loan({
        installments: { total: 12, paid: 9, remaining: 3, overdue: 1 },
        nextInstallment: { dueDate: "2026-11-05", amount: null },
        installmentAmount: 341_90,
      }),
    )
    expect(view.progress).toBe(0.75)
    expect(view.overdue).toBe(1)
    expect(view.remaining).toBe(3)
    expect(view.next).toEqual({ dueDate: "2026-11-05", amount: 341_90 })
  })

  it("sem parcelas informadas", () => {
    const view = loanView(loan({}))
    expect(view.installments).toBeNull()
    expect(view.progress).toBeNull()
    expect(view.overdue).toBe(0)
    expect(view.next).toBeNull()
  })
})

describe("totais e ordem", () => {
  it("soma só os saldos informados e conta os que faltaram", () => {
    const views = [loan({ outstandingBalance: 500_00 }), loan({ outstandingBalance: null }), loan({})].map(loanView)
    expect(totalOutstanding(views)).toEqual({ total: 1_500_00, missing: 1 })
    expect(totalOutstanding([])).toEqual({ total: 0, missing: 0 })
  })

  it("maior saldo primeiro, sem saldo por último", () => {
    const views = [
      loan({ id: "a", outstandingBalance: null }),
      loan({ id: "b", outstandingBalance: 100 }),
      loan({ id: "c", outstandingBalance: 900 }),
    ].map(loanView)
    expect(sortLoans(views).map((view) => view.id)).toEqual(["c", "b", "a"])
  })
})

describe("textos", () => {
  it("taxas em % ao ano", () => {
    expect(formatAnnualRate(27.6)).toBe("27,6% a.a.")
    expect(formatAnnualRate(30.125)).toBe("30,13% a.a.")
    expect(ratesLabel({ interestRateAnnual: 27.6, cetAnnual: 30.12 })).toBe("Juros 27,6% a.a. · CET 30,12% a.a.")
    expect(ratesLabel({ interestRateAnnual: null, cetAnnual: 30 })).toBe("CET 30% a.a.")
    expect(ratesLabel({ interestRateAnnual: null, cetAnnual: null })).toBeNull()
  })

  it("parcelas atrasadas", () => {
    expect(overdueLabel(1)).toBe("1 parcela atrasada")
    expect(overdueLabel(3)).toBe("3 parcelas atrasadas")
  })
})

describe("empréstimos do modo mock", () => {
  it("são coerentes: pagas + restantes = total e saldo menor que o contratado", () => {
    for (const mock of buildLoans()) {
      const { total, paid, remaining } = mock.installments
      expect(paid! + remaining!).toBe(total)
      expect(mock.outstandingBalance!).toBeLessThan(mock.contractedAmount!)
    }
  })
})
