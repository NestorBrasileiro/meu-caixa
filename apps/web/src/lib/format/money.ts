import type { Cents } from "@/lib/api/types"

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const compactCurrency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
})
const plainNumber = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 })

export interface MoneyOptions {
  /** Mostra "+" em valores positivos (o "−" sempre aparece). */
  signed?: boolean
  /** R$ 12,9 mil — para eixos e tiles apertados. */
  compact?: boolean
}

/** Centavos → "R$ 1.234,56" (com espaço não separável, como o Intl gera). */
export function formatMoney(cents: Cents, options: MoneyOptions = {}): string {
  const value = cents / 100
  const formatter = options.compact ? compactCurrency : currency
  const formatted = formatter.format(Math.abs(value))
  if (value < 0) return `−${formatted}`
  if (options.signed && value > 0) return `+${formatted}`
  return formatted
}

/** Valor de eixo de gráfico: "12 mil", "1,5 mil", "800". */
export function formatAxisMoney(cents: Cents): string {
  const value = cents / 100
  const abs = Math.abs(value)
  const sign = value < 0 ? "−" : ""
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`
  return `${sign}${plainNumber.format(abs)}`
}

/** Fração 0–1 → "42%". */
export function formatPercent(fraction: number, digits = 0): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(fraction)
}
