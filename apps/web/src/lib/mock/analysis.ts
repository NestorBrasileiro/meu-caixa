import type { AnalysisReport, Insight } from "@/lib/api/analysis"
import type { Cents, Transaction } from "@/lib/api/types"
import { lastMonths, monthRange } from "@/lib/finance/aggregate"
import { isSpending } from "@/lib/finance/classify"
import { formatMoney } from "@/lib/format/money"
import { MOCK_TODAY, type MockDataset } from "./generator"
import { averageVariableSpending, COMMITMENTS, GOALS } from "./planning"

/** Os 3 últimos meses fechados — base de todas as médias da análise. */
function analysisPeriod() {
  const months = lastMonths(MOCK_TODAY.slice(0, 7), 4).slice(0, 3)
  return { months, from: monthRange(months[0]).from, to: monthRange(months[2]).to }
}

function evidenceOf(
  transactions: Transaction[],
  period: { from: string; to: string },
  label: string,
  match: (tx: Transaction) => boolean,
) {
  const matched = transactions.filter(
    (tx) => isSpending(tx) && tx.date >= period.from && tx.date <= period.to && match(tx),
  )
  return {
    label,
    occurrences: matched.length,
    total: matched.reduce((sum, tx) => sum - tx.amount, 0),
    period,
  }
}

const perMonth = (total: Cents) => Math.round(total / 3)

export function buildAnalysis(dataset: MockDataset): AnalysisReport {
  const { from, to } = analysisPeriod()
  const period = { from, to }
  const tx = dataset.transactions

  const delivery = evidenceOf(tx, period, "Pedidos de delivery", (t) => t.category === "Food delivery")
  const restaurants = evidenceOf(tx, period, "Restaurantes aos domingos", (t) => t.category === "Restaurants")
  const extraStreaming = evidenceOf(tx, period, "Streaming Plus", (t) => t.counterpartyName === "Streaming Plus")
  const fees = evidenceOf(tx, period, "Tarifa pacote de serviços", (t) => t.category === "Bank fees")
  const rides = evidenceOf(tx, period, "Corridas de app", (t) => t.category === "Taxi and ride-hailing")

  const deliveryMonthly = perMonth(delivery.total)
  const deliverySavings = Math.round(deliveryMonthly * 0.4)
  const ordersPerMonth = delivery.occurrences / 3
  // Quantos pedidos por mês trocar para chegar aos 40% — texto e número não divergem.
  const ordersToSwap = Math.max(1, Math.round(ordersPerMonth * 0.4))
  const restaurantSavings = Math.round(perMonth(restaurants.total) * 0.3)
  const ridesSavings = Math.round(perMonth(rides.total) * 0.25)
  const streamingSavings = perMonth(extraStreaming.total)
  const feesSavings = perMonth(fees.total)

  const monthlyFixed = COMMITMENTS.reduce((sum, c) => sum + c.amount, 0)
  const monthlyDiscretionary = averageVariableSpending(dataset)
  const car = GOALS[0]
  const carRemaining = car.target - car.saved

  const insights: Insight[] = [
    {
      id: "ins-delivery",
      kind: "SIN",
      title: "Delivery virou rotina de fim de semana",
      explanation: `Foram ${delivery.occurrences} pedidos em 3 meses — cerca de ${Math.round(ordersPerMonth)} por mês, quase sempre sexta e sábado. É o seu maior gasto discricionário. Trocar ${ordersToSwap} desses pedidos por mês por comida feita em casa corta perto de 40% do valor.`,
      monthlySavings: deliverySavings,
      evidence: delivery,
      confidence: "HIGH",
    },
    {
      id: "ins-streaming",
      kind: "LEAK",
      title: "Duas assinaturas de streaming de vídeo",
      explanation: `Além do streaming principal, o "Streaming Plus" cobra ${formatMoney(39_90)} todo dia 22. Pelo histórico, os dois cobrem o mesmo tipo de conteúdo — vale cancelar um.`,
      monthlySavings: streamingSavings,
      evidence: extraStreaming,
      confidence: "MEDIUM",
    },
    {
      id: "ins-tarifa",
      kind: "LEAK",
      title: "Tarifa de pacote bancário",
      explanation: `O Banco Exemplo cobra ${formatMoney(34_90)} por mês de pacote de serviços. Sua conta digital não tem tarifa: concentrar Pix e boletos nela e pedir a conta de serviços essenciais (gratuita por lei) zera esse custo.`,
      monthlySavings: feesSavings,
      evidence: fees,
      confidence: "HIGH",
    },
    {
      id: "ins-restaurantes",
      kind: "CUT",
      title: "Restaurante aos domingos",
      explanation: `Média de ${formatMoney(perMonth(restaurants.total))} por mês. Não precisa cortar — alternar um domingo sim, outro não, mantém o hábito e libera cerca de 30% do valor.`,
      monthlySavings: restaurantSavings,
      evidence: restaurants,
      confidence: "MEDIUM",
    },
    {
      id: "ins-corridas",
      kind: "CUT",
      title: "Corridas de app às terças e quintas",
      explanation: `${rides.occurrences} corridas em 3 meses, concentradas em dias fixos. Se forem trajetos de rotina, combinar carona ou transporte público em metade delas economiza um quarto do gasto.`,
      monthlySavings: ridesSavings,
      evidence: rides,
      confidence: "LOW",
    },
  ]
  const potentialMonthlySavings = insights.reduce((sum, i) => sum + (i.monthlySavings ?? 0), 0)
  const monthsSaved = Math.max(
    0,
    Math.ceil(carRemaining / car.monthlyContribution) -
      Math.ceil(carRemaining / (car.monthlyContribution + potentialMonthlySavings)),
  )

  insights.push({
    id: "ins-carro",
    kind: "SUGGESTION",
    title: "Direcionar a economia para a entrada do carro",
    explanation: `Faltam ${formatMoney(carRemaining)} para a meta. Somando a economia sugerida (${formatMoney(potentialMonthlySavings)}/mês) ao aporte de ${formatMoney(car.monthlyContribution)}, a entrada fica pronta cerca de ${monthsSaved} meses antes do previsto.`,
    monthlySavings: null,
    evidence: null,
    confidence: "MEDIUM",
  })

  return {
    generatedAt: "2026-10-07T12:05:00.000Z",
    period,
    headline: `Dá para liberar cerca de ${formatMoney(potentialMonthlySavings)} por mês sem mexer nos compromissos fixos.`,
    summary: `Seus compromissos fixos somam ${formatMoney(monthlyFixed)} por mês, puxados pela parcela do terreno. O gasto variável médio dos últimos 3 meses foi de ${formatMoney(monthlyDiscretionary)} — e é ali que estão as oportunidades: delivery, uma assinatura duplicada e uma tarifa bancária evitável.`,
    monthlyFixed,
    monthlyDiscretionary,
    potentialMonthlySavings,
    insights,
  }
}
