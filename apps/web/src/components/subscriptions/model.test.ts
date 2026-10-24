import { describe, expect, it } from "vitest"
import type { Subscription, SubscriptionsOverview } from "@/lib/api/subscriptions"
import { formatMoney } from "@/lib/format/money"
import { chargedOn, commitmentDraft, headerSummary, intervalLabel, nextChargeLabel, priceIncreaseLabel } from "./model"

const subscription = (overrides: Partial<Subscription> = {}): Subscription => ({
  key: "streaming",
  name: "Streaming",
  detectedName: "STREAMING 10/2026",
  customName: null,
  source: "DETECTED",
  counterpartyName: null,
  category: "Video streaming",
  accounts: ["Cartão Exemplo"],
  account: "Cartão Exemplo",
  chargeAmount: 55_90,
  lastAmount: 55_90,
  variable: false,
  priceIncrease: null,
  intervalMonths: 1,
  lastDate: "2026-10-01",
  nextDate: "2026-11-01",
  since: "2026-01-01",
  months: 10,
  monthlyCost: 55_90,
  yearlyCost: 55_90 * 12,
  paymentMethod: "CARD",
  onCreditCard: true,
  dayOfMonth: 1,
  plannedCommitmentId: null,
  ...overrides,
})

describe("subscriptions/model", () => {
  it("diz onde cai a cobrança", () => {
    expect(chargedOn(subscription())).toBe("No cartão Cartão Exemplo")
    // Mudou do cartão para a conta: vale onde cai hoje.
    const moved = subscription({ onCreditCard: false, accounts: ["Cartão Exemplo", "Conta Exemplo"], account: "Conta Exemplo" })
    expect(chargedOn(moved)).toBe("Conta Exemplo")
  })

  it("cobrança espaçada diz o valor de cada cobrança e entra no planejamento pelo valor por mês", () => {
    const quarterly = subscription({ intervalMonths: 3, chargeAmount: 300_00, monthlyCost: 100_00, dayOfMonth: 10 })
    expect(intervalLabel(quarterly)).toBe(`${formatMoney(300_00)} a cada 3 meses`)
    expect(intervalLabel(subscription())).toBeNull()
    expect(commitmentDraft(quarterly, "2026-10-20")).toMatchObject({
      amount: "100,00",
      notes: `Cobra ${formatMoney(300_00)} a cada 3 meses; aqui, o valor por mês.`,
    })
  })

  it("próxima cobrança, ou esperada desde quando se já passou", () => {
    expect(nextChargeLabel(subscription(), "2026-10-20")).toBe("Próxima em 01 nov")
    expect(nextChargeLabel(subscription(), "2026-11-05")).toBe("Esperada desde 01 nov")
  })

  it("descreve o aumento de preço", () => {
    expect(priceIncreaseLabel(subscription())).toBeNull()
    const increased = subscription({ priceIncrease: { from: 21_90, to: 23_90, on: "2026-10-03" } })
    expect(priceIncreaseLabel(increased)).toBe(`Subiu de ${formatMoney(21_90)} para ${formatMoney(23_90)} em 03 out`)
  })

  it("resume o total no cabeçalho", () => {
    const overview: SubscriptionsOverview = {
      today: "2026-10-20",
      subscriptions: [subscription()],
      others: [],
      stopped: [],
      hidden: [],
      totals: { monthly: 55_90, yearly: 55_90 * 12, active: 1 },
    }
    expect(headerSummary(overview)).toBe(
      `1 assinatura ativa · ${formatMoney(55_90)} por mês · ${formatMoney(55_90 * 12)} por ano`,
    )
    expect(headerSummary({ ...overview, totals: { monthly: 0, yearly: 0, active: 0 } })).toContain("todo mês")
  })

  it("monta o rascunho do compromisso: no cartão vira CARD; fora dele, a forma do extrato", () => {
    expect(commitmentDraft(subscription(), "2026-10-20")).toEqual({
      name: "Streaming",
      amount: "55,90",
      dayOfMonth: "1",
      paymentMethod: "CARD",
      startsOn: "2026-10-20",
    })
    const bill = subscription({ onCreditCard: false, paymentMethod: "BOLETO", monthlyCost: 119_90, dayOfMonth: 12 })
    expect(commitmentDraft(bill, "2026-10-20")).toMatchObject({ amount: "119,90", dayOfMonth: "12", paymentMethod: "BOLETO" })
    expect(commitmentDraft(subscription({ onCreditCard: false, paymentMethod: null }), "2026-10-20").paymentMethod).toBe("OTHER")
  })
})
