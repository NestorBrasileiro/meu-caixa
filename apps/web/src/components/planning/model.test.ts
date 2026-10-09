import { describe, expect, it } from "vitest"
import type { Transaction } from "@/lib/api/types"
import {
  budgetRows,
  goalProgress,
  headerSummary,
  historyState,
  partialHistoryNote,
  projectionCallout,
  sourceCategoryOptions,
} from "./model"

const money = (cents: number) => `R$ ${(cents / 100).toFixed(2)}`

const tx = (date: string, amount: number, category: string | null): Transaction => ({
  id: `${date}-${amount}-${category}`,
  accountId: "a",
  date,
  description: category ?? "",
  amount,
  status: "POSTED",
  category,
  originalCategory: category,
  paymentMethod: null,
  counterpartyName: null,
  installment: null,
  invoiceExternalId: null,
})

const closed = ["2026-07", "2026-08", "2026-09"]

describe("planning/model: histórico da projeção", () => {
  it("sem transações nos 3 meses fechados = sem histórico", () => {
    expect(historyState([], closed)).toEqual({ kind: "none" })
    // Transação do mês corrente não conta: a média é dos meses fechados.
    expect(historyState([tx("2026-10-02", -10_00, "Groceries")], closed)).toEqual({ kind: "none" })
  })

  it("histórico parcial lista os meses que têm dados", () => {
    const state = historyState([tx("2026-09-05", 9_000_00, "Salary")], closed)
    expect(state).toEqual({ kind: "partial", months: ["2026-09"] })
    expect(partialHistoryNote(state, 3)).toBe(
      "Dos 3 últimos meses fechados, só setembro tem transações: renda e gasto médios ficam abaixo do real até completar o histórico.",
    )
  })

  it("histórico completo não gera aviso", () => {
    const state = historyState(
      closed.map((month) => tx(`${month}-10`, -1_00, "Groceries")),
      closed,
    )
    expect(state).toEqual({ kind: "full" })
    expect(partialHistoryNote(state, 3)).toBeNull()
  })
})

describe("planning/model: cabeçalho", () => {
  it("usuário novo ganha um convite em vez de R$ 0,00 comprometidos", () => {
    expect(headerSummary(0, 0, 0, money)).toBe(
      "Cadastre compromissos fixos e metas para ver quanto sobra nos próximos meses.",
    )
  })

  it("resume compromissos e metas", () => {
    expect(headerSummary(2_355_90, 2, 1, money)).toBe("R$ 2355.90/mês já comprometidos · 1 meta em andamento")
    expect(headerSummary(2_355_90, 2, 0, money)).toBe("R$ 2355.90/mês já comprometidos · nenhuma meta em andamento")
    expect(headerSummary(0, 0, 2, money)).toBe("Nenhum compromisso fixo · 2 metas em andamento")
  })
})

describe("planning/model: categorias do banco", () => {
  it("oferece as categorias de gasto vistas mais as já usadas, em pt-BR e em ordem", () => {
    const options = sourceCategoryOptions(
      [
        tx("2026-09-01", -50_00, "Groceries"),
        tx("2026-09-02", -50_00, "Groceries"),
        tx("2026-09-05", 9_000_00, "Salary"),
        tx("2026-09-06", -1_500_00, "Transfer - Savings"),
        tx("2026-09-15", -800_00, "Credit card payment"),
        tx("2026-09-20", -100_00, "Utilities"),
        tx("2026-09-21", -10_00, null),
      ],
      [{ sourceCategories: ["Restaurants"] }],
    )
    expect(options).toEqual([
      { value: "Utilities", label: "Contas de consumo" },
      { value: "Groceries", label: "Mercado" },
      { value: "Restaurants", label: "Restaurantes" },
    ])
  })
})

describe("planning/model: orçamento e metas (regras existentes)", () => {
  it("soma o gasto das categorias do banco de cada categoria do orçamento", () => {
    const [row] = budgetRows(
      [{ id: "b", name: "Mercado", kind: "ESSENTIAL", sourceCategories: ["Groceries"], monthlyBudget: 100_00 }],
      [{ category: "Groceries", label: "Mercado", total: 150_00, count: 2 }],
    )
    expect(row).toMatchObject({ actual: 150_00, ratio: 1.5, over: 50_00 })
  })

  it("prevê a conclusão da meta e o aporte que fecha no prazo", () => {
    const goal = goalProgress(
      {
        id: "g",
        name: "Carro",
        target: 40_000_00,
        saved: 12_500_00,
        targetDate: "2027-12-01",
        monthlyContribution: 1_500_00,
        accountId: null,
      },
      "2026-10-08",
      [],
    )
    expect(goal).toMatchObject({ projectedMonth: "2028-05", delayMonths: 5, requiredMonthly: 1_964_29 })
  })
})

describe("planning/model: frase da projeção", () => {
  const row = (month: string, projectedBalance: number) => ({
    month,
    expectedIncome: 3_000_00,
    commitments: 2_355_90,
    goalContributions: 1_500_00,
    expectedVariableSpending: 3_000_00,
    projectedBalance,
  })
  const name = (month: string) => month

  it("todos os meses iguais no vermelho: sem apontar um 'pior mês'", () => {
    const rows = ["2026-11", "2026-12", "2027-01"].map((month) => row(month, -3_855_90))
    expect(projectionCallout(rows, name, money)).toBe(
      "Os 3 meses fecham no vermelho, com R$ -3855.90 cada: a renda média não cobre compromissos, metas e gasto variável.",
    )
  })

  it("meses diferentes: aponta o pior", () => {
    const rows = [row("2026-11", -100_00), row("2026-12", -300_00), row("2027-01", 50_00)]
    expect(projectionCallout(rows, name, money)).toMatch(/^2 meses fecham no vermelho; o pior é 2026-12/)
  })

  it("nenhum mês no vermelho: sem frase", () => {
    expect(projectionCallout([row("2026-11", 10_00)], name, money)).toBeNull()
  })
})
