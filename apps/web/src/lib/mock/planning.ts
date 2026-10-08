import type { BudgetCategory, Commitment, Goal, MonthProjection, PlanningOverview } from "@/lib/api/planning"
import type { Cents } from "@/lib/api/types"
import { lastMonths, monthRange } from "@/lib/finance/aggregate"
import { isSpending } from "@/lib/finance/classify"
import { IDS, MOCK_TODAY, type MockDataset } from "./generator"

export const BUDGET_CATEGORIES: BudgetCategory[] = [
  {
    id: "cat-moradia",
    name: "Moradia e contas",
    kind: "ESSENTIAL",
    sourceCategories: ["Housing", "Electricity", "Internet", "Telecommunications"],
    monthlyBudget: 2_700_00,
  },
  {
    id: "cat-mercado",
    name: "Mercado",
    kind: "ESSENTIAL",
    sourceCategories: ["Groceries"],
    monthlyBudget: 1_400_00,
  },
  {
    id: "cat-transporte",
    name: "Transporte",
    kind: "ESSENTIAL",
    sourceCategories: ["Gas stations", "Taxi and ride-hailing"],
    monthlyBudget: 1_000_00,
  },
  {
    id: "cat-saude",
    name: "Saúde e bem-estar",
    kind: "ESSENTIAL",
    sourceCategories: ["Pharmacy", "Gyms and fitness centers"],
    monthlyBudget: 300_00,
  },
  {
    id: "cat-delivery",
    name: "Delivery e restaurantes",
    kind: "DISCRETIONARY",
    sourceCategories: ["Food delivery", "Restaurants"],
    monthlyBudget: 600_00,
  },
  {
    id: "cat-assinaturas",
    name: "Assinaturas",
    kind: "DISCRETIONARY",
    sourceCategories: ["Video streaming", "Music streaming"],
    monthlyBudget: 80_00,
  },
  {
    id: "cat-compras",
    name: "Compras",
    kind: "DISCRETIONARY",
    sourceCategories: ["Shopping", "Online shopping"],
    monthlyBudget: 500_00,
  },
  {
    id: "cat-outros",
    name: "Tarifas e outros",
    kind: "DISCRETIONARY",
    sourceCategories: ["Bank fees", "Transfers"],
    monthlyBudget: 150_00,
  },
]

/** Parcelas mensais já vencidas desde `startsOn` (inclusive) até hoje. */
function paidSince(startsOn: string): number {
  const [y0, m0, d0] = startsOn.split("-").map(Number)
  const [y1, m1, d1] = MOCK_TODAY.split("-").map(Number)
  return (y1 - y0) * 12 + (m1 - m0) + (d1 >= d0 ? 1 : 0)
}

export const COMMITMENTS: Commitment[] = [
  {
    id: "cmt-terreno",
    name: "Parcela do terreno",
    amount: 2_300_00,
    dayOfMonth: 10,
    paymentMethod: "BOLETO",
    categoryId: "cat-moradia",
    startsOn: "2023-09-10",
    endsOn: "2033-08-10",
    installments: { paid: paidSince("2023-09-10"), total: 120 },
    notes: "Loteadora Exemplo",
  },
  {
    id: "cmt-internet",
    name: "Internet fibra",
    amount: 119_90,
    dayOfMonth: 12,
    paymentMethod: "BOLETO",
    categoryId: "cat-moradia",
    startsOn: "2024-02-12",
    endsOn: null,
    installments: null,
    notes: null,
  },
  {
    id: "cmt-celular",
    name: "Plano de celular",
    amount: 59_90,
    dayOfMonth: 18,
    paymentMethod: "OTHER",
    categoryId: "cat-moradia",
    startsOn: "2022-05-18",
    endsOn: null,
    installments: null,
    notes: null,
  },
  {
    id: "cmt-academia",
    name: "Academia",
    amount: 129_90,
    dayOfMonth: 8,
    paymentMethod: "CARD",
    categoryId: "cat-saude",
    startsOn: "2025-01-08",
    endsOn: null,
    installments: null,
    notes: null,
  },
  {
    id: "cmt-streaming",
    name: "Streaming de vídeo",
    amount: 55_90,
    dayOfMonth: 1,
    paymentMethod: "CARD",
    categoryId: "cat-assinaturas",
    startsOn: "2021-03-01",
    endsOn: null,
    installments: null,
    notes: null,
  },
  {
    id: "cmt-musica",
    name: "Streaming de música",
    amount: 21_90,
    dayOfMonth: 3,
    paymentMethod: "CARD",
    categoryId: "cat-assinaturas",
    startsOn: "2021-03-03",
    endsOn: null,
    installments: null,
    notes: null,
  },
]

export const GOALS: Goal[] = [
  {
    id: "goal-carro",
    name: "Entrada do carro",
    target: 40_000_00,
    saved: 12_500_00,
    targetDate: "2027-12-01",
    monthlyContribution: 1_500_00,
    accountId: IDS.savings,
  },
  {
    id: "goal-reserva",
    name: "Reserva de emergência",
    target: 27_000_00,
    saved: 6_000_00,
    targetDate: "2028-06-01",
    monthlyContribution: 500_00,
    accountId: null,
  },
]

const EXPECTED_INCOME: Cents = 9_000_00

/**
 * Lançamentos que pagam um compromisso fixo. Casar pela contraparte (e não
 * pela categoria inteira) mantém assinaturas avulsas, como o Streaming Plus,
 * no gasto variável — assim fixo + variável fecha com o gasto real.
 */
const COMMITTED_COUNTERPARTIES = new Set([
  "Loteadora Exemplo",
  "Fibra Exemplo",
  "Operadora Exemplo",
  "Academia Exemplo",
  "Streaming Exemplo",
  "Música Exemplo",
])

/** Gasto variável médio dos últimos 3 meses fechados (tudo que não é compromisso). */
export function averageVariableSpending(dataset: MockDataset): Cents {
  const months = lastMonths(MOCK_TODAY.slice(0, 7), 4).slice(0, 3)
  const from = monthRange(months[0]).from
  const to = monthRange(months[months.length - 1]).to
  const total = dataset.transactions
    .filter((tx) => isSpending(tx) && tx.date >= from && tx.date <= to)
    .filter((tx) => !COMMITTED_COUNTERPARTIES.has(tx.counterpartyName ?? ""))
    .reduce((sum, tx) => sum - tx.amount, 0)
  return Math.round(total / months.length)
}

export function buildPlanning(dataset: MockDataset): PlanningOverview {
  const commitmentsTotal = COMMITMENTS.reduce((sum, c) => sum + c.amount, 0)
  const goalsTotal = GOALS.reduce((sum, g) => sum + g.monthlyContribution, 0)
  const variable = averageVariableSpending(dataset)
  const months = lastMonths(MOCK_TODAY.slice(0, 7), 7).slice(1)
  const nextMonths = months.map((_, i) => {
    const [year, month] = MOCK_TODAY.slice(0, 7).split("-").map(Number)
    const index = year * 12 + month + i
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`
  })
  const projections: MonthProjection[] = nextMonths.map((month) => {
    // Dezembro tem 13º; janeiro concentra IPVA/material escolar.
    const income = month.endsWith("-12") ? EXPECTED_INCOME * 2 : EXPECTED_INCOME
    const seasonal = month.endsWith("-01") ? 1_200_00 : month.endsWith("-12") ? 900_00 : 0
    const expectedVariableSpending = variable + seasonal
    return {
      month,
      expectedIncome: income,
      commitments: commitmentsTotal,
      goalContributions: goalsTotal,
      expectedVariableSpending,
      projectedBalance: income - commitmentsTotal - goalsTotal - expectedVariableSpending,
    }
  })
  return { categories: BUDGET_CATEGORIES, commitments: COMMITMENTS, goals: GOALS, projections }
}
