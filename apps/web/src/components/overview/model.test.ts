import { describe, expect, it } from "vitest"
import type { Commitment } from "@/lib/api/planning"
import type { Account, Invoice } from "@/lib/api/types"
import { monthlyCashFlow } from "@/lib/finance/aggregate"
import {
  cashFlowWindow,
  closingLabel,
  hasMovement,
  hasPeriodMovement,
  installmentNumberOn,
  overviewDescription,
  upcomingDue,
} from "./model"

const flow = (month: string, inflow: number, outflow: number) => ({ month, inflow, outflow, net: inflow - outflow })

const months = [
  "2025-11",
  "2025-12",
  "2026-01",
  "2026-02",
  "2026-03",
  "2026-04",
  "2026-05",
  "2026-06",
  "2026-07",
  "2026-08",
  "2026-09",
  "2026-10",
]

const card: Account = {
  id: "card",
  connectionId: "c",
  institutionName: "Banco",
  connectionStatus: "ACTIVE",
  type: "CREDIT_CARD",
  name: "Cartão",
  number: null,
  currency: "BRL",
  balance: 0,
  creditLimit: null,
  availableCredit: null,
  transactionsSyncedThrough: null,
  updatedAt: "2026-10-07T00:00:00Z",
}

const invoice: Invoice = {
  id: "inv",
  accountId: "card",
  dueDate: "2026-10-15",
  closingDate: "2026-10-08",
  total: 3_399_14,
  minimumPayment: null,
  currency: "BRL",
}

const commitment: Commitment = {
  id: "terreno",
  name: "Parcela do terreno",
  amount: 2_300_00,
  dayOfMonth: 10,
  paymentMethod: "BOLETO",
  categoryId: null,
  startsOn: "2023-09-10",
  endsOn: null,
  installments: { paid: 37, total: 120 },
  notes: "Loteadora",
}

describe("overview/model — usuário novo, sem histórico", () => {
  it("12 meses sem entradas nem saídas não têm movimento (o gráfico vira estado vazio)", () => {
    // Exatamente o que a página monta para quem ainda não sincronizou: zero contas, zero transações.
    const rows = monthlyCashFlow([], [], months)
    expect(rows).toHaveLength(12)
    expect(hasMovement(rows)).toBe(false)
  })

  it("um único mês com movimento já basta para mostrar o gráfico", () => {
    expect(hasMovement([flow("2026-09", 0, 0), flow("2026-10", 0, 120_00)])).toBe(true)
  })

  it("resultado do mês sem entrada nem gasto não tem movimento (o KPI mostra um traço)", () => {
    expect(hasPeriodMovement({ income: 0, spending: 0 })).toBe(false)
    expect(hasPeriodMovement({ income: 0, spending: 45_90 })).toBe(true)
  })

  it("descreve a página sem bancos conectados", () => {
    expect(overviewDescription("quinta-feira, 8 de outubro", 0, 0)).toBe(
      "Quinta-feira, 8 de outubro · nenhum banco conectado",
    )
    expect(overviewDescription("quinta-feira, 8 de outubro", 3, 2)).toBe(
      "Quinta-feira, 8 de outubro · 3 contas em 2 bancos",
    )
    expect(overviewDescription("sexta-feira", 1, 1)).toBe("Sexta-feira · 1 conta em 1 banco")
  })

  it("só com compromissos (sem cartão), a lista de vencimentos traz os compromissos", () => {
    const items = upcomingDue({
      commitments: [commitment],
      invoices: [],
      accounts: [],
      today: "2026-10-08",
      horizonDays: 10,
    })
    expect(items).toEqual([
      expect.objectContaining({
        kind: "COMMITMENT",
        date: "2026-10-10",
        daysAway: 2,
        detail: "Parcela 38 de 120 · Loteadora",
        inTotal: true,
      }),
    ])
  })
})

describe("overview/model — janela do fluxo de caixa", () => {
  const empty = months.map((month) => flow(month, 0, 0))

  it("mantém os 12 meses quando todos têm histórico", () => {
    const rows = months.map((month) => flow(month, 100, 50))
    expect(cashFlowWindow(rows, 6)).toHaveLength(12)
  })

  it("tira os meses vazios do começo quando o histórico é curto", () => {
    const rows = empty.map((row, i) => (i >= 3 ? flow(row.month, 100, 50) : row))
    expect(cashFlowWindow(rows, 6).map((row) => row.month)[0]).toBe("2026-02")
  })

  it("mostra ao menos o mínimo de meses, mesmo com um mês só de histórico", () => {
    const rows = empty.map((row, i) => (i === 11 ? flow(row.month, 100, 0) : row))
    const window = cashFlowWindow(rows, 6)
    expect(window.map((row) => row.month)).toEqual(months.slice(6))
  })

  it("não corta nada quando não há movimento (quem chama mostra o estado vazio)", () => {
    expect(cashFlowWindow(empty, 6)).toHaveLength(12)
  })
})

describe("overview/model — fatura nos vencimentos", () => {
  it("diz que a fatura fecha hoje ou amanhã em vez da data", () => {
    expect(closingLabel("2026-10-08", "2026-10-08")).toBe("fecha hoje")
    expect(closingLabel("2026-10-09", "2026-10-08")).toBe("fecha amanhã")
    expect(closingLabel("2026-10-12", "2026-10-08")).toBe("fecha 12 out")
  })

  it("mistura compromisso e fatura do cartão por data", () => {
    const items = upcomingDue({
      commitments: [commitment],
      invoices: [invoice],
      accounts: [card],
      today: "2026-10-08",
      horizonDays: 10,
    })
    expect(items.map((item) => [item.kind, item.date, item.detail])).toEqual([
      ["COMMITMENT", "2026-10-10", "Parcela 38 de 120 · Loteadora"],
      ["INVOICE", "2026-10-15", "Cartão · fecha hoje"],
    ])
  })
})

describe("overview/model — número da parcela nos vencimentos", () => {
  // Começou em 15/jul com vencimento dia 10: a 1ª vence em 10/ago (10/jul é antes do início).
  const parcelado: Commitment = {
    ...commitment,
    id: "geladeira",
    name: "Geladeira",
    notes: null,
    startsOn: "2026-07-15",
    dayOfMonth: 10,
    installments: { paid: 2, total: 3 },
  }
  const upcoming = (c: Commitment, today: string) =>
    upcomingDue({ commitments: [c], invoices: [], accounts: [], today, horizonDays: 10 })

  it("calcula N pela data do vencimento, contando a partir do 1º vencimento", () => {
    expect(installmentNumberOn(parcelado, 3, "2026-07-10")).toBeNull()
    expect(installmentNumberOn(parcelado, 3, "2026-08-10")).toBe(1)
    expect(installmentNumberOn(parcelado, 3, "2026-10-10")).toBe(3)
    expect(installmentNumberOn(parcelado, 3, "2026-11-10")).toBeNull()
    // Dia 31 limitado ao fim do mês: a 1ª vence em 30/set, a 2ª em 31/out.
    expect(installmentNumberOn({ startsOn: "2026-09-01", dayOfMonth: 31 }, 12, "2026-10-31")).toBe(2)
  })

  it("no dia do vencimento, a parcela de hoje é a próxima (pagas + 1)", () => {
    expect(upcoming(parcelado, "2026-10-10").map((item) => item.detail)).toEqual(["Parcela 3 de 3"])
  })

  it("o \"pagas\" vindo da API não muda o número: nunca \"Parcela 4 de 3\"", () => {
    const stale = { ...parcelado, installments: { paid: 3, total: 3 } }
    expect(upcoming(stale, "2026-10-08").map((item) => item.detail)).toEqual(["Parcela 3 de 3"])
  })

  it("depois da última parcela, o compromisso sai da lista", () => {
    expect(upcoming({ ...parcelado, endsOn: null }, "2026-11-01")).toEqual([])
  })

  it("antes do 1º vencimento, nada aparece", () => {
    // Hoje 05/jul: o próximo dia 10 (10/jul) é antes do início; a 1ª só vence em agosto.
    expect(upcoming(parcelado, "2026-07-05")).toEqual([])
    // 1º/ago: o vencimento de 10/ago é a parcela 1.
    expect(upcoming(parcelado, "2026-08-01").map((item) => item.detail)).toEqual(["Parcela 1 de 3"])
  })
})
