import { describe, expect, it } from "vitest"
import type { BudgetCategory, Commitment } from "@/lib/api/planning"
import type { Transaction } from "@/lib/api/types"
import {
  activeCommitments,
  budgetRows,
  budgetSummary,
  commitmentStatus,
  commitmentsTotal,
  goalContributions,
  goalProgress,
  groupBudget,
  headerSummary,
  historyState,
  partialHistoryNote,
  projectionCallout,
  sortCommitments,
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

describe("planning/model: compromissos ativos no mês", () => {
  const today = "2026-10-09"
  const commitment = (id: string, amount: number, startsOn: string, endsOn: string | null): Commitment => ({
    id,
    name: id,
    amount,
    dayOfMonth: 10,
    paymentMethod: "PIX",
    categoryId: null,
    startsOn,
    endsOn,
    installments: null,
    notes: null,
  })
  const all = [
    commitment("encerrado", 900_00, "2025-01-10", "2026-09-10"),
    commitment("acaba-este-mes", 300_00, "2025-01-10", "2026-10-01"),
    commitment("ativo", 100_00, "2024-01-10", null),
    commitment("comeca-este-mes", 50_00, "2026-10-31", null),
    commitment("futuro", 1_000_00, "2026-11-01", null),
  ]

  it("ativo = começa até o fim do mês e não acabou antes do início dele", () => {
    expect(all.map((c) => commitmentStatus(c, today))).toEqual(["ended", "active", "active", "active", "upcoming"])
  })

  it("o total soma só os ativos", () => {
    const active = activeCommitments(all, today)
    expect(active.map((c) => c.id)).toEqual(["acaba-este-mes", "ativo", "comeca-este-mes"])
    expect(commitmentsTotal(active)).toBe(450_00)
  })

  it("lista os ativos primeiro (do maior para o menor), depois os futuros e os encerrados", () => {
    expect(sortCommitments(all, today).map((c) => [c.id, c.status])).toEqual([
      ["acaba-este-mes", "active"],
      ["ativo", "active"],
      ["comeca-este-mes", "active"],
      ["futuro", "upcoming"],
      ["encerrado", "ended"],
    ])
  })
})

describe("planning/model: aportes em metas", () => {
  it("soma e conta só as metas que ainda não foram alcançadas", () => {
    const goals = [
      { done: false, monthlyContribution: 1_500_00 },
      { done: true, monthlyContribution: 800_00 },
      { done: false, monthlyContribution: 500_00 },
    ]
    expect(goalContributions(goals)).toEqual({ total: 2_000_00, count: 2 })
    expect(goalContributions([{ done: true, monthlyContribution: 800_00 }])).toEqual({ total: 0, count: 0 })
  })

  it("meta com o valor já guardado conta como alcançada", () => {
    const goal = goalProgress(
      {
        id: "g",
        name: "Viagem",
        target: 5_000_00,
        saved: 5_000_00,
        targetDate: "2027-01-01",
        monthlyContribution: 500_00,
        accountId: null,
      },
      "2026-10-09",
      [],
    )
    expect(goalContributions([goal])).toEqual({ total: 0, count: 0 })
  })
})

describe("planning/model: totais do orçamento", () => {
  const category = (id: string, kind: BudgetCategory["kind"], source: string, monthlyBudget: number | null) => ({
    id,
    name: id,
    kind,
    sourceCategories: [source],
    monthlyBudget,
  })
  const categories: BudgetCategory[] = [
    category("Mercado", "ESSENTIAL", "Groceries", 1_000_00),
    category("Transporte", "ESSENTIAL", "Taxi", 500_00),
    category("Farmácia", "ESSENTIAL", "Pharmacy", null),
    category("Lazer", "DISCRETIONARY", "Restaurants", null),
  ]
  const spending = [
    { category: "Groceries", label: "Mercado", total: 1_200_00, count: 4 },
    { category: "Taxi", label: "Táxi", total: 300_00, count: 2 },
    { category: "Pharmacy", label: "Farmácia", total: 400_00, count: 1 },
    { category: "Restaurants", label: "Restaurantes", total: 250_00, count: 3 },
  ]

  it("estouro do grupo = soma dos estouros das categorias com teto; gasto sem teto fica à parte", () => {
    const [essential, discretionary] = groupBudget(budgetRows(categories, spending))
    expect(essential).toMatchObject({
      kind: "ESSENTIAL",
      actual: 1_500_00,
      budget: 1_500_00,
      over: 200_00,
      unlimited: 400_00,
      unlimitedNames: ["Farmácia"],
    })
    // Só categorias sem teto: nenhum estouro, nada de "R$ 250,00 acima de R$ 0,00".
    expect(discretionary).toMatchObject({
      kind: "DISCRETIONARY",
      actual: 0,
      budget: 0,
      over: 0,
      unlimited: 250_00,
      unlimitedNames: ["Lazer"],
    })
  })

  it("rodapé: compara só as categorias com teto", () => {
    expect(budgetSummary(budgetRows(categories, spending))).toEqual({
      actual: 1_500_00,
      budget: 1_500_00,
      over: 200_00,
      unlimited: 650_00,
      unlimitedNames: ["Farmácia", "Lazer"],
    })
  })

  it("categoria sem teto e sem gasto não aparece entre as sem teto", () => {
    expect(budgetSummary(budgetRows(categories, spending.slice(0, 2))).unlimitedNames).toEqual([])
  })
})
