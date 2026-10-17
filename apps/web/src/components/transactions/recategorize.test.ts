import { describe, expect, it } from "vitest"
import { ClientApiError } from "@/lib/api/client"
import type { Transaction } from "@/lib/api/types"
import { categoryLabel } from "@/lib/format/category"
import {
  applyEdits,
  KNOWN_CATEGORIES,
  pruneSaved,
  recategorizeBody,
  saveErrorMessage,
  saveFailureDescription,
  without,
} from "./recategorize"

const tx = (id: string, category: string | null, originalCategory: string | null = category): Transaction => ({
  id,
  accountId: "card",
  date: "2026-10-05",
  description: `Lançamento ${id}`,
  amount: -10_00,
  status: "POSTED",
  category,
  originalCategory,
  paymentMethod: "CARD",
  counterpartyName: null,
  installment: null,
  invoiceExternalId: null,
})

describe("transactions/recategorize", () => {
  it("manda a categoria escolhida, ou null para voltar à do banco", () => {
    expect(recategorizeBody("Restaurants", "Food delivery")).toEqual({ category: "Restaurants" })
    expect(recategorizeBody("Food delivery", "Food delivery")).toEqual({ category: null })
    // Sem categoria no banco: voltar para "Sem categoria" também é remover a escolha.
    expect(recategorizeBody(null, null)).toEqual({ category: null })
  })

  it("sem edições devolve o mesmo array", () => {
    const rows = [tx("a", "Groceries")]
    expect(applyEdits(rows, {}, {})).toBe(rows)
  })

  it("sobrepõe a resposta salva e, por cima, o pedido em andamento", () => {
    const rows = [tx("a", "Groceries"), tx("b", "Shopping"), tx("c", "Housing")]
    const saved = { a: tx("a", "Restaurants", "Groceries") }
    const pending = { a: "Pharmacy", b: null }
    const [a, b, c] = applyEdits(rows, saved, pending)
    expect(a).toMatchObject({ category: "Pharmacy", originalCategory: "Groceries" })
    expect(b).toMatchObject({ category: null, originalCategory: "Shopping" })
    expect(c).toBe(rows[2])
    // Sem pedido em andamento, vale a resposta da API.
    expect(applyEdits(rows, saved, {})[0]).toBe(saved.a)
  })

  it("descarta as respostas que a página nova já reflete e mantém as mais novas", () => {
    const saved = {
      a: tx("a", "Restaurants", "Groceries"),
      b: tx("b", "Pharmacy", "Shopping"),
      gone: tx("gone", "Housing", "Shopping"),
    }
    // A página nova já tem "a"; "b" foi salvo depois do pedido dela; "gone" saiu na sincronização.
    const server = [tx("a", "Restaurants", "Groceries"), tx("b", "Shopping")]
    expect(pruneSaved(saved, server)).toEqual({ b: saved.b })
  })

  it("não troca o objeto quando nada sai", () => {
    const saved = { a: tx("a", "Restaurants", "Groceries") }
    expect(pruneSaved(saved, [tx("a", "Groceries")])).toBe(saved)
    const empty = {}
    expect(pruneSaved(empty, [tx("a", "Groceries")])).toBe(empty)
  })

  it("remove uma chave sem mexer no original", () => {
    const record = { a: 1, b: 2 }
    expect(without(record, "a")).toEqual({ b: 2 })
    expect(record).toEqual({ a: 1, b: 2 })
    expect(without(record, "z")).toBe(record)
  })

  it("explica a falha em português", () => {
    expect(saveErrorMessage(new ClientApiError(500, "Internal server error"))).toBe(
      "A API não conseguiu salvar agora. Tente de novo em instantes.",
    )
    expect(saveErrorMessage(new ClientApiError(400, "category must be a string"))).toBe(
      "A API recusou a categoria escolhida.",
    )
    expect(saveErrorMessage(new ClientApiError(404, "Transação não encontrada"))).toMatch(/não existe mais/)
    expect(saveErrorMessage(new ClientApiError(409, "Conflito ao salvar"))).toBe("Conflito ao salvar")
    expect(saveErrorMessage(new TypeError("Failed to fetch"))).toMatch(/Sem conexão/)
    expect(saveErrorMessage("??")).toBe("Erro inesperado. Tente de novo.")
  })

  it("diz onde o lançamento ficou, menos quando ele não existe mais", () => {
    expect(saveFailureDescription(new ClientApiError(500, "x"), "Supermercado", "Mercado")).toBe(
      "A API não conseguiu salvar agora. Tente de novo em instantes. “Supermercado” continua em Mercado.",
    )
    expect(saveFailureDescription(new ClientApiError(404, "x"), "Supermercado", "Mercado")).toBe(
      "Este lançamento não existe mais: a última sincronização pode tê-lo removido.",
    )
  })

  it("só oferece categorias que já têm nome em português", () => {
    // "Internet" é igual nas duas línguas; as demais precisam de tradução.
    const untranslated = KNOWN_CATEGORIES.filter((category) => categoryLabel(category) === category)
    expect(untranslated).toEqual(["Internet"])
    expect(new Set(KNOWN_CATEGORIES).size).toBe(KNOWN_CATEGORIES.length)
  })
})
