import { describe, expect, it } from "vitest"
import type { Transaction } from "@/lib/api/types"
import {
  ALL,
  applyFilters,
  buildSearchIndex,
  categoryOptions,
  categoryOptionsFor,
  DEFAULT_FILTERS,
  internalKindOf,
  NO_CATEGORY,
  noDataReason,
} from "./model"

const tx = (
  id: string,
  category: string | null,
  amount: number,
  overrides: Partial<Transaction> = {},
): Transaction => ({
  id,
  accountId: "checking",
  date: "2026-10-05",
  description: id,
  amount,
  status: "POSTED",
  category,
  originalCategory: category,
  paymentMethod: null,
  counterpartyName: null,
  installment: null,
  invoiceExternalId: null,
  ...overrides,
})

const values = (options: { value: string }[]) => options.map((option) => option.value)
const ids = (rows: Transaction[]) => rows.map((row) => row.id)

describe("transactions/model", () => {
  it("classifica a categoria como movimentação interna só pelo nome", () => {
    expect(internalKindOf("Credit card payment")).toBe("card-payment")
    expect(internalKindOf("Transfer - Savings")).toBe("own-transfer")
    expect(internalKindOf("Groceries")).toBeNull()
    expect(internalKindOf(null)).toBeNull()
  })

  it("lista as categorias dos dados e as extras, sem repetir, pelo rótulo em português", () => {
    const options = categoryOptions([tx("a", "Groceries", -1), tx("b", null, -1)], ["Restaurants", "Groceries", null])
    expect(options.map((option) => option.label)).toEqual(["Mercado", "Restaurantes", "Sem categoria"])
    expect(values(options)).toEqual(["Groceries", "Restaurants", NO_CATEGORY])
  })

  describe("categorias oferecidas para um lançamento", () => {
    const options = categoryOptions([], ["Groceries", "Credit card payment", "Transfer - Savings", null])

    it("não oferece 'Sem categoria' quando o banco deu uma categoria (a API não guarda essa escolha)", () => {
      const purchase = tx("a", "Groceries", -50_00)
      expect(values(categoryOptionsFor(options, purchase, { type: "CHECKING" }))).not.toContain(NO_CATEGORY)
    })

    it("oferece 'Sem categoria' quando é a original", () => {
      const edited = tx("a", "Groceries", -50_00, { originalCategory: null })
      expect(values(categoryOptionsFor(options, edited, { type: "CHECKING" }))).toContain(NO_CATEGORY)
    })

    it("pagamento de fatura só como saída da conta ou entrada no cartão; poupança só em conta", () => {
      const cardPurchase = tx("a", "Groceries", -50_00)
      expect(values(categoryOptionsFor(options, cardPurchase, { type: "CREDIT_CARD" }))).toEqual(["Groceries"])
      const cardCredit = tx("b", "Groceries", 50_00)
      expect(values(categoryOptionsFor(options, cardCredit, { type: "CREDIT_CARD" }))).toContain("Credit card payment")
      const checkingOut = tx("c", "Groceries", -50_00)
      expect(values(categoryOptionsFor(options, checkingOut, { type: "CHECKING" }))).toEqual([
        "Groceries",
        "Credit card payment",
        "Transfer - Savings",
      ])
    })

    it("mantém a categoria atual e a original mesmo quando a regra as excluiria", () => {
      const odd = tx("a", "Transfer - Savings", -50_00, { originalCategory: "Credit card payment" })
      expect(values(categoryOptionsFor(options, odd, { type: "CREDIT_CARD" }))).toEqual([
        "Groceries",
        "Credit card payment",
        "Transfer - Savings",
      ])
    })
  })

  it("mantém na lista o lançamento fixado que saiu dos filtros, com o motivo", () => {
    const rows = [tx("a", "Credit card payment", -100_00), tx("b", "Groceries", -10_00)]
    const range = { from: "2026-10-01", to: "2026-10-08" }
    const index = buildSearchIndex(rows)
    const hidden = applyFilters(rows, DEFAULT_FILTERS, range, index)
    expect(ids(hidden.rows)).toEqual(["b"])
    expect(hidden.hiddenInternal).toBe(1)
    const pinned = applyFilters(rows, DEFAULT_FILTERS, range, index, new Set(["a"]))
    expect(ids(pinned.rows)).toEqual(["a", "b"])
    expect(pinned.outOfFilter.get("a")).toBe("internal")
    const byCategory = applyFilters(rows, { ...DEFAULT_FILTERS, category: "Groceries" }, range, index, new Set(["a"]))
    expect(byCategory.outOfFilter.get("a")).toBe("category")
    expect(DEFAULT_FILTERS.category).toBe(ALL)
  })

  it("distingue 'sem banco conectado' de 'nada sincronizado' quando não há lançamentos", () => {
    expect(noDataReason(0, 0)).toBe("no-accounts")
    expect(noDataReason(0, 3)).toBe("not-synced")
    expect(noDataReason(12, 3)).toBeNull()
  })
})
