import { describe, expect, it } from "vitest"
import type { BudgetCategory, Commitment, Goal } from "@/lib/api/planning"
import { deleteCategoryCopy, deleteCommitmentCopy, deleteGoalCopy, goalPreview, savedToast } from "./copy"
import { goalProgress } from "./model"

const money = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`
const month = (value: string) => value

const commitment: Commitment = {
  id: "c",
  name: "Academia",
  amount: 129_90,
  dayOfMonth: 5,
  paymentMethod: "PIX",
  categoryId: null,
  startsOn: "2026-10-01",
  endsOn: null,
  installments: null,
  notes: null,
}

const goal: Goal = {
  id: "g",
  name: "Entrada do carro",
  target: 40_000_00,
  saved: 12_500_00,
  targetDate: "2027-12-01",
  monthlyContribution: 1_500_00,
  accountId: null,
}

const category: BudgetCategory = {
  id: "b",
  name: "Mercado",
  kind: "ESSENTIAL",
  sourceCategories: ["Groceries"],
  monthlyBudget: 1_400_00,
}

describe("planning/copy: exclusão", () => {
  it("compromisso: nomeia o item e diz o que acontece", () => {
    expect(deleteCommitmentCopy(commitment, money)).toEqual({
      title: "Excluir “Academia”?",
      description:
        "O compromisso de R$ 129,90 por mês sai da lista e deixa de entrar na projeção. Isso não pode ser desfeito.",
      confirm: "Excluir compromisso",
      success: "Compromisso “Academia” excluído",
    })
  })

  it("meta: o dinheiro guardado continua na conta", () => {
    expect(deleteGoalCopy(goal, "Poupança", money).description).toBe(
      "A meta e o aporte de R$ 1500,00/mês saem do planejamento e da projeção. Os R$ 12500,00 já guardados continuam em Poupança. Isso não pode ser desfeito.",
    )
    expect(deleteGoalCopy({ ...goal, saved: 0, monthlyContribution: 0 }, null, money).description).toBe(
      "A meta sai do planejamento e da projeção. Isso não pode ser desfeito.",
    )
  })

  it("categoria: teto, gasto fora do orçamento e compromissos sem categoria", () => {
    expect(deleteCategoryCopy(category, ["Mercado"], ["Feira", "Sacolão"], money).description).toBe(
      "O teto de R$ 1400,00 sai do orçamento. O gasto em Mercado passa a aparecer como fora do orçamento. 2 compromissos (Feira e Sacolão) ficam sem categoria. Isso não pode ser desfeito.",
    )
    expect(deleteCategoryCopy({ ...category, monthlyBudget: null }, [], ["Feira"], money).description).toBe(
      "O compromisso “Feira” fica sem categoria. Isso não pode ser desfeito.",
    )
  })
})

describe("planning/copy: toasts e prévia da meta", () => {
  it("toasts concordam em gênero", () => {
    expect(savedToast("commitment", "Academia", true)).toBe("Compromisso “Academia” adicionado")
    expect(savedToast("goal", "Viagem", false)).toBe("Meta “Viagem” atualizada")
    expect(savedToast("category", "Lazer", true)).toBe("Categoria “Lazer” adicionada")
  })

  it("prévia diz quando a meta fecha e o aporte que fecha no prazo", () => {
    const late = goalProgress(goal, "2026-10-08", [])
    expect(goalPreview(late, money, month)).toBe(
      "No ritmo de R$ 1500,00/mês, a meta fecha em 2028-05, 5 meses depois do prazo. Para chegar em 2027-12, o aporte precisa ser de R$ 1964,29/mês.",
    )
    const onTime = goalProgress({ ...goal, monthlyContribution: 3_000_00 }, "2026-10-08", [])
    expect(goalPreview(onTime, money, month)).toBe("No ritmo de R$ 3000,00/mês, a meta fecha em 2027-08, dentro do prazo.")
    const noPace = goalProgress({ ...goal, monthlyContribution: 0 }, "2026-10-08", [])
    expect(goalPreview(noPace, money, month)).toBe("Sem aporte mensal, a meta não tem previsão de conclusão.")
    const done = goalProgress({ ...goal, saved: 40_000_00 }, "2026-10-08", [])
    expect(goalPreview(done, money, month)).toBe("Com o que já foi guardado, a meta está atingida.")
  })
})
