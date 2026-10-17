import { describe, expect, it } from "vitest"
import type { BudgetCategory, Commitment, Goal } from "@/lib/api/planning"
import {
  categoryForm,
  categoryPatch,
  commitmentForm,
  commitmentPatch,
  formatMoneyInput,
  goalForm,
  goalPatch,
  goalYears,
  isIsoDate,
  lastInstallmentMonth,
  mutationErrorMessage,
  normalizeMoneyInput,
  parseMoney,
  sourceChoices,
  validateCategory,
  validateCommitment,
  validateGoal,
  type CommitmentForm,
} from "./forms"

const nbsp = (value: string) => value.replace(/ /g, " ")

const terreno: Commitment = {
  id: "c1",
  name: "Parcela do terreno",
  amount: 2_300_00,
  dayOfMonth: 10,
  paymentMethod: "BOLETO",
  categoryId: "cat-moradia",
  startsOn: "2023-09-10",
  endsOn: "2033-08-10",
  installments: { paid: 37, total: 120 },
  notes: "Loteadora",
}

const streaming: Commitment = {
  id: "c2",
  name: "Streaming de vídeo",
  amount: 55_90,
  dayOfMonth: 1,
  paymentMethod: "CARD",
  categoryId: null,
  startsOn: "2021-03-01",
  endsOn: null,
  installments: null,
  notes: null,
}

const carro: Goal = {
  id: "g1",
  name: "Entrada do carro",
  target: 40_000_00,
  saved: 12_500_00,
  targetDate: "2027-12-15",
  monthlyContribution: 1_500_00,
  accountId: null,
}

const mercado: BudgetCategory = {
  id: "b1",
  name: "Mercado",
  kind: "ESSENTIAL",
  sourceCategories: ["Groceries", "Pharmacy"],
  monthlyBudget: 1_400_00,
}

describe("planning/forms: dinheiro", () => {
  it("lê o jeito brasileiro de digitar valores", () => {
    expect(parseMoney("2.300,00")).toBe(2_300_00)
    expect(parseMoney("2300")).toBe(2_300_00)
    expect(parseMoney("2.300")).toBe(2_300_00)
    expect(parseMoney("2300,5")).toBe(2_300_50)
    expect(parseMoney("1.234.567,89")).toBe(123_456_789)
    expect(parseMoney(",50")).toBe(50)
    expect(parseMoney(" R$ 55,90 ")).toBe(55_90)
    expect(parseMoney("R$ 1.500,00")).toBe(1_500_00)
  })

  it("aceita o ponto decimal de teclado em inglês só com 1–2 casas", () => {
    expect(parseMoney("2300.50")).toBe(2_300_50)
    expect(parseMoney("2.5")).toBe(2_50)
  })

  it("recusa o que não é valor", () => {
    for (const input of ["", "   ", "abc", "-10", "2,300,00", "2.30.0", "23,456", "1.23,00", "R$", "10e3"]) {
      expect(parseMoney(input), input).toBeNull()
    }
  })

  it("formata centavos para o campo e normaliza ao sair dele", () => {
    expect(nbsp(formatMoneyInput(2_300_00))).toBe("2.300,00")
    expect(formatMoneyInput(5)).toBe("0,05")
    expect(normalizeMoneyInput("2300")).toBe("2.300,00")
    expect(normalizeMoneyInput("abc")).toBe("abc")
  })
})

describe("planning/forms: datas", () => {
  it("valida datas de calendário", () => {
    expect(isIsoDate("2026-02-28")).toBe(true)
    expect(isIsoDate("2026-02-30")).toBe(false)
    expect(isIsoDate("2026-2-3")).toBe(false)
  })

  it("calcula o mês da última parcela como a API", () => {
    expect(lastInstallmentMonth("2023-09-10", 10, 120)).toBe("2033-08")
    expect(lastInstallmentMonth("2026-10-08", 8, 1)).toBe("2026-10")
    expect(lastInstallmentMonth("2026-10-08", 20, 1)).toBe("2026-10")
    // O dia 5 de outubro já passou em 08/10: a 1ª parcela vence em novembro.
    expect(lastInstallmentMonth("2026-10-08", 5, 1)).toBe("2026-11")
    expect(lastInstallmentMonth("2026-10-08", 5, 12)).toBe("2027-10")
  })
})

describe("planning/forms: compromissos", () => {
  const valid: CommitmentForm = {
    ...commitmentForm(null, "2026-10-08"),
    name: "  Academia ",
    amount: "129,90",
    dayOfMonth: "5",
    categoryId: "cat-1",
    notes: "  ",
  }

  it("começa vazio com início hoje", () => {
    const form = commitmentForm(null, "2026-10-08")
    expect(form.startsOn).toBe("2026-10-08")
    expect(form.installments).toBe(false)
    expect(form.paymentMethod).toBe("PIX")
  })

  it("monta o corpo do POST com os tipos da API", () => {
    expect(validateCommitment(valid)).toEqual({
      ok: true,
      value: {
        name: "Academia",
        amount: 129_90,
        dayOfMonth: 5,
        paymentMethod: "PIX",
        categoryId: "cat-1",
        startsOn: "2026-10-08",
        endsOn: null,
        installmentsTotal: null,
        notes: null,
      },
    })
  })

  it("parcelado manda o total e deixa o fim para a API", () => {
    const result = validateCommitment({ ...valid, installments: true, installmentsTotal: "12", endsOn: "2027-01-01" })
    expect(result.ok && result.value).toMatchObject({ installmentsTotal: 12, endsOn: null })
  })

  it("aponta cada campo inválido com as regras da API", () => {
    const result = validateCommitment({
      ...valid,
      name: " ",
      amount: "0",
      dayOfMonth: "32",
      startsOn: "",
      notes: "x".repeat(201),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(Object.keys(result.errors).sort()).toEqual(["amount", "dayOfMonth", "name", "notes", "startsOn"])
    expect(result.errors.amount).toBe("O valor precisa ser maior que zero.")
  })

  it("não aceita fim antes do início nem parcelas fora de 1–600", () => {
    const endsBefore = validateCommitment({ ...valid, endsOn: "2026-10-07" })
    expect(!endsBefore.ok && endsBefore.errors.endsOn).toBeTruthy()
    const tooMany = validateCommitment({ ...valid, installments: true, installmentsTotal: "601" })
    expect(!tooMany.ok && tooMany.errors.installmentsTotal).toBe("Informe de 1 a 600 parcelas.")
  })

  it("abre a edição com o fim derivado das parcelas fora do formulário", () => {
    const form = commitmentForm(terreno, "2026-10-08")
    expect(nbsp(form.amount)).toBe("2.300,00")
    expect(form.installments).toBe(true)
    expect(form.installmentsTotal).toBe("120")
    expect(form.endsOn).toBe("")
  })

  it("PATCH sem mudanças fica vazio (inclusive para parcelados)", () => {
    for (const commitment of [terreno, streaming]) {
      const result = validateCommitment(commitmentForm(commitment, "2026-10-08"))
      expect(result.ok && commitmentPatch(commitment, result.value)).toEqual({})
    }
  })

  it("PATCH leva só o que mudou e null para limpar", () => {
    const result = validateCommitment({
      ...commitmentForm(terreno, "2026-10-08"),
      amount: "2.450",
      categoryId: "",
      notes: "",
    })
    expect(result.ok && commitmentPatch(terreno, result.value)).toEqual({
      amount: 2_450_00,
      categoryId: null,
      notes: null,
    })
  })

  it("trocar parcelado por data de fim (e o contrário) acerta os dois campos", () => {
    const toEnd = validateCommitment({ ...commitmentForm(terreno, "2026-10-08"), installments: false, endsOn: "2030-01-10" })
    expect(toEnd.ok && commitmentPatch(terreno, toEnd.value)).toEqual({ installmentsTotal: null, endsOn: "2030-01-10" })

    const toInstallments = validateCommitment({
      ...commitmentForm(streaming, "2026-10-08"),
      installments: true,
      installmentsTotal: "10",
    })
    expect(toInstallments.ok && commitmentPatch(streaming, toInstallments.value)).toEqual({
      installmentsTotal: 10,
      endsOn: null,
    })

    const moreInstallments = validateCommitment({ ...commitmentForm(terreno, "2026-10-08"), installmentsTotal: "121" })
    expect(moreInstallments.ok && commitmentPatch(terreno, moreInstallments.value)).toEqual({
      installmentsTotal: 121,
      endsOn: null,
    })
  })
})

describe("planning/forms: metas", () => {
  it("monta o prazo no primeiro dia do mês e guardado vazio vira 0", () => {
    const result = validateGoal({
      ...goalForm(null),
      name: "Reserva",
      target: "10.000",
      monthlyContribution: "0",
      targetMonth: "06",
      targetYear: "2028",
    })
    expect(result).toEqual({
      ok: true,
      value: {
        name: "Reserva",
        target: 10_000_00,
        saved: 0,
        targetDate: "2028-06-01",
        monthlyContribution: 0,
        accountId: null,
      },
    })
  })

  it("exige valor da meta, aporte e prazo", () => {
    const result = validateGoal({ ...goalForm(null), name: "Reserva", target: "0" })
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual([
      "monthlyContribution",
      "target",
      "targetMonth",
      "targetYear",
    ])
  })

  it("PATCH preserva o dia salvo quando o mês do prazo não muda", () => {
    const same = validateGoal(goalForm(carro))
    expect(same.ok && goalPatch(carro, same.value)).toEqual({})
    const moved = validateGoal({ ...goalForm(carro), targetMonth: "06", saved: "13.000,00", accountId: "acc-1" })
    expect(moved.ok && goalPatch(carro, moved.value)).toEqual({
      targetDate: "2027-06-01",
      saved: 13_000_00,
      accountId: "acc-1",
    })
  })

  it("oferece anos a partir do atual (ou do prazo antigo)", () => {
    expect(goalYears("2026-10-08", "").slice(0, 2)).toEqual(["2026", "2027"])
    expect(goalYears("2026-10-08", "").at(-1)).toBe("2056")
    expect(goalYears("2026-10-08", "2025")[0]).toBe("2025")
  })
})

describe("planning/forms: categorias", () => {
  it("teto vazio vira null (só acompanha o gasto) e repetidas saem", () => {
    const result = validateCategory({
      ...categoryForm(null),
      name: " Lazer ",
      kind: "DISCRETIONARY",
      sourceCategories: ["Restaurants", "Restaurants"],
    })
    expect(result).toEqual({
      ok: true,
      value: { name: "Lazer", kind: "DISCRETIONARY", sourceCategories: ["Restaurants"], monthlyBudget: null },
    })
  })

  it("valida nome (até 60) e teto", () => {
    const result = validateCategory({ ...categoryForm(null), name: "x".repeat(61), monthlyBudget: "abc" })
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual(["monthlyBudget", "name"])
  })

  it("teto de R$ 0,00 não vale (a API exige pelo menos 1 centavo); em branco = sem teto", () => {
    for (const monthlyBudget of ["0", "0,00", "R$ 0,00"]) {
      const result = validateCategory({ ...categoryForm(null), name: "Lazer", monthlyBudget })
      expect(result).toEqual({
        ok: false,
        errors: { monthlyBudget: "Use pelo menos R$ 0,01 ou deixe em branco para não ter teto." },
      })
    }
    const cent = validateCategory({ ...categoryForm(null), name: "Lazer", monthlyBudget: "0,01" })
    expect(cent.ok && cent.value.monthlyBudget).toBe(1)
    const empty = validateCategory({ ...categoryForm(null), name: "Lazer", monthlyBudget: "  " })
    expect(empty.ok && empty.value.monthlyBudget).toBeNull()
  })

  it("PATCH ignora a ordem das categorias do banco", () => {
    const reordered = validateCategory({ ...categoryForm(mercado), sourceCategories: ["Pharmacy", "Groceries"] })
    expect(reordered.ok && categoryPatch(mercado, reordered.value)).toEqual({})
    const changed = validateCategory({ ...categoryForm(mercado), monthlyBudget: "", sourceCategories: ["Groceries"] })
    expect(changed.ok && categoryPatch(mercado, changed.value)).toEqual({
      monthlyBudget: null,
      sourceCategories: ["Groceries"],
    })
  })
})

describe("planning/forms: categorias do banco no formulário", () => {
  const options = [
    { value: "Groceries", label: "Mercado" },
    { value: "Restaurants", label: "Restaurantes" },
    { value: "Utilities", label: "Utilities" },
  ]
  const categories = [
    mercado,
    { id: "b2", name: "Lazer", kind: "DISCRETIONARY" as const, sourceCategories: ["Restaurants"], monthlyBudget: null },
  ]

  it("separa livres das já usadas em outra categoria (a própria não conta)", () => {
    const { free, taken } = sourceChoices(options, ["Groceries"], categories, "b1", (v) => v)
    expect(free.map((c) => c.value)).toEqual(["Groceries", "Utilities"])
    expect(taken).toEqual([{ value: "Restaurants", label: "Restaurantes", usedIn: ["Lazer"] }])
  })

  it("mantém valores salvos fora das opções e não move o item ao marcar", () => {
    const before = sourceChoices(options, [], categories, null, (v) => v.toUpperCase())
    const after = sourceChoices(options, ["Groceries", "Pets"], categories, null, (v) => v.toUpperCase())
    expect(before.taken.map((c) => c.value)).toEqual(["Groceries", "Restaurants"])
    expect(after.taken.map((c) => c.value)).toEqual(["Groceries", "Restaurants"])
    expect(after.free).toContainEqual({ value: "Pets", label: "PETS", usedIn: [] })
  })
})

describe("planning/forms: erros da API", () => {
  const apiError = (status: number, message: string) => Object.assign(new Error(message), { status })

  it("traduz os erros conhecidos para pt-BR", () => {
    expect(mutationErrorMessage(apiError(400, "Categoria ou conta informada não existe"), "salvar")).toMatch(
      /não existe mais/,
    )
    expect(mutationErrorMessage(apiError(400, "amount must be an integer number"), "salvar")).toBe(
      "A API não aceitou algum valor. Confira os campos e tente de novo.",
    )
    expect(mutationErrorMessage(apiError(404, "Meta não encontrado(a)"), "excluir")).toMatch(/não existe mais/)
    expect(mutationErrorMessage(apiError(503, "Service Unavailable"), "excluir")).toBe(
      "O servidor não conseguiu excluir agora. Tente de novo em instantes.",
    )
  })

  it("falha de rede (sem status) pede para conferir a conexão", () => {
    expect(mutationErrorMessage(new TypeError("Failed to fetch"), "salvar")).toMatch(/sem resposta do servidor/)
  })
})
