import { describe, expect, it } from "vitest"
import type { Account, Transaction } from "@/lib/api/types"
import { lastMonths, monthlyCashFlow, monthRange, periodTotals, spendingByCategory } from "./aggregate"

const account = (id: string, type: Account["type"]): Account => ({
  id,
  connectionId: "c",
  institutionName: "Banco",
  connectionStatus: "ACTIVE",
  type,
  name: id,
  number: null,
  currency: "BRL",
  balance: 0,
  creditLimit: null,
  availableCredit: null,
  transactionsSyncedThrough: null,
  updatedAt: "2026-10-07T00:00:00Z",
})

const tx = (accountId: string, date: string, amount: number, category: string | null): Transaction => ({
  id: `${accountId}-${date}-${amount}`,
  accountId,
  date,
  description: category ?? "",
  amount,
  status: "POSTED",
  category,
  paymentMethod: null,
  counterpartyName: null,
  installment: null,
  invoiceExternalId: null,
})

const accounts = [account("checking", "CHECKING"), account("savings", "SAVINGS"), account("card", "CREDIT_CARD")]
const transactions = [
  tx("checking", "2026-09-05", 9_000_00, "Salary"),
  tx("checking", "2026-09-06", -1_500_00, "Transfer - Savings"),
  tx("savings", "2026-09-06", 1_500_00, "Transfer - Savings"),
  tx("card", "2026-09-10", -300_00, "Food delivery"),
  tx("card", "2026-09-11", -200_00, "Groceries"),
  tx("checking", "2026-09-15", -500_00, "Credit card payment"),
  tx("checking", "2026-09-20", -150_00, "Groceries"),
]

describe("finance/aggregate", () => {
  it("lista os últimos meses em ordem, atravessando o ano", () => {
    expect(lastMonths("2026-02", 3)).toEqual(["2025-12", "2026-01", "2026-02"])
  })

  it("calcula o intervalo de um mês", () => {
    expect(monthRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" })
  })

  it("fluxo de caixa ignora o cartão e transferências entre contas próprias", () => {
    const [september] = monthlyCashFlow(transactions, accounts, ["2026-09"])
    // Entra o salário; saem a fatura (que paga o cartão) e o mercado no Pix.
    expect(september).toEqual({ month: "2026-09", inflow: 9_000_00, outflow: 650_00, net: 8_350_00 })
  })

  it("gasto por categoria conta cada compra uma vez (sem fatura nem transferência)", () => {
    const totals = spendingByCategory(transactions, { from: "2026-09-01", to: "2026-09-30" })
    expect(totals.map((t) => [t.category, t.total])).toEqual([
      ["Groceries", 350_00],
      ["Food delivery", 300_00],
    ])
    expect(totals[0].label).toBe("Mercado")
  })

  it("renda e gasto do período", () => {
    expect(periodTotals(transactions, { from: "2026-09-01", to: "2026-09-30" })).toEqual({
      income: 9_000_00,
      spending: 650_00,
      net: 8_350_00,
    })
  })
})
