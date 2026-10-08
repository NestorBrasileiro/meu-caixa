import type { IsoDate } from "@/lib/api/types"
import { formatDateShort } from "@/lib/format/date"

const count = new Intl.NumberFormat("pt-BR")

/** 1234 → "1.234" */
export function formatCount(value: number): string {
  return count.format(value)
}

/** "1 lançamento", "1.234 lançamentos" */
export function plural(value: number, one: string, many: string): string {
  return `${formatCount(value)} ${value === 1 ? one : many}`
}

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]
const DAY_MS = 86_400_000

/** Datas de calendário ao meio-dia UTC: a conta de dias nunca "volta um dia". */
function noonUtc(date: IsoDate): number {
  return Date.parse(`${date}T12:00:00Z`)
}

/** Cabeçalho do dia: "Hoje" / "Ontem" / "Segunda", e a data curta ("05 out", com ano se não for o atual). */
export function dayHeading(date: IsoDate, today: IsoDate): { title: string; date: string } {
  const daysAgo = Math.round((noonUtc(today) - noonUtc(date)) / DAY_MS)
  const title =
    daysAgo === 0 ? "Hoje" : daysAgo === 1 ? "Ontem" : WEEKDAYS[new Date(noonUtc(date)).getUTCDay()]
  const year = date.slice(0, 4)
  return { title, date: year === today.slice(0, 4) ? formatDateShort(date) : `${formatDateShort(date)} ${year}` }
}

/** "01 ago – 07 out"; com o ano no início quando o período cruza a virada ("01 nov 2025 – 07 out"). */
export function formatRange(range: { from: IsoDate; to: IsoDate }): string {
  const fromYear = range.from.slice(0, 4)
  const from = fromYear === range.to.slice(0, 4) ? formatDateShort(range.from) : `${formatDateShort(range.from)} ${fromYear}`
  return `${from} – ${formatDateShort(range.to)}`
}
