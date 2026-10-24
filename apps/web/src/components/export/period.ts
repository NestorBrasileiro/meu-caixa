import type { IsoDate } from "@/lib/api/types"

/** Período da exportação: atalhos, validação e texto. Sem relógio: "hoje" sempre vem de fora. */

export interface Period {
  from: IsoDate
  to: IsoDate
}

export type PeriodPresetId = "month" | "3m" | "6m" | "12m" | "custom"

export const PERIOD_PRESETS: { id: PeriodPresetId; label: string }[] = [
  { id: "month", label: "Este mês" },
  { id: "3m", label: "Últimos 3 meses" },
  { id: "6m", label: "Últimos 6 meses" },
  { id: "12m", label: "Últimos 12 meses" },
  { id: "custom", label: "Personalizado" },
]

/** O atalho que abre a tela: é o período padrão da API. */
export const DEFAULT_PRESET: PeriodPresetId = "3m"

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** `YYYY-MM-DD` de uma data que existe no calendário (nada de 31/02). */
export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const [, year, month, day] = match.map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** Dia 1º do mês `offset` meses antes/depois do mês de `date`. */
export function firstOfMonth(date: IsoDate, offset = 0): IsoDate {
  const index = Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1 + offset
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}-01`
}

/** Meses do calendário que o período toca: 15/08 a 03/10 = ago, set, out = 3. */
export function monthsSpanned({ from, to }: Period): number {
  const index = (date: IsoDate) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7))
  return index(to) - index(from) + 1
}

/** Os últimos `months` meses do calendário até `today`, contando o mês corrente. */
export function lastMonths(today: IsoDate, months: number): Period {
  return { from: firstOfMonth(today, -(months - 1)), to: today }
}

/** Período padrão quando a API não informa: os últimos 3 meses. */
export function defaultPeriodFor(today: IsoDate): Period {
  return lastMonths(today, 3)
}

/**
 * O período de um atalho. "Hoje" é o fim do período padrão da API (mesmo fuso que ela usa) e os
 * "Últimos 3 meses" são exatamente o padrão. "Personalizado" não tem período próprio: null.
 */
export function presetPeriod(preset: PeriodPresetId, defaultPeriod: Period): Period | null {
  const today = defaultPeriod.to
  switch (preset) {
    case "month":
      return lastMonths(today, 1)
    case "3m":
      return { ...defaultPeriod }
    case "6m":
      return lastMonths(today, 6)
    case "12m":
      return lastMonths(today, 12)
    case "custom":
      return null
  }
}

export interface PeriodErrors {
  from?: string
  to?: string
}

/**
 * Erros das duas datas (vazio = ok). O limite conta meses do calendário, como `monthsSpanned`: assim
 * o app nunca manda um período que a API recusaria por ser longo demais.
 */
export function validatePeriod(period: Period, maxMonths: number): PeriodErrors {
  const errors: PeriodErrors = {}
  if (!period.from) errors.from = "Informe a data inicial."
  else if (!isIsoDate(period.from)) errors.from = "Data inicial inválida."
  if (!period.to) errors.to = "Informe a data final."
  else if (!isIsoDate(period.to)) errors.to = "Data final inválida."
  if (errors.from || errors.to) return errors

  if (period.to < period.from) {
    errors.to = "A data final precisa ser igual ou posterior à inicial."
  } else if (monthsSpanned(period) > maxMonths) {
    errors.to = `O período pode ter no máximo ${maxMonths} meses. Encurte o intervalo.`
  }
  return errors
}

export function hasPeriodErrors(errors: PeriodErrors): boolean {
  return Boolean(errors.from || errors.to)
}

/** `YYYY-MM-DD` → "01/08/2026". */
function numeric(date: IsoDate): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`
}

/** "De 01/08/2026 a 23/10/2026 · 3 meses" (ou "Só 23/10/2026" num dia só). */
export function periodSummary(period: Period): string {
  if (period.from === period.to) return `Só ${numeric(period.from)}`
  const months = monthsSpanned(period)
  return `De ${numeric(period.from)} a ${numeric(period.to)} · ${months} ${months === 1 ? "mês" : "meses"}`
}
