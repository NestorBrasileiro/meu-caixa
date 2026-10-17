import type { IsoDate } from "@/lib/api/types"

/**
 * Calendário de vencimentos de um compromisso fixo — a mesma regra da API:
 *
 * - vencimento do mês = dia `dayOfMonth`, limitado ao último dia do mês (31 → 28/fev);
 * - a 1ª parcela vence no mês do início se esse vencimento cai em `startsOn` ou depois,
 *   senão no mês seguinte;
 * - a parcela n vence n − 1 meses depois da 1ª;
 * - paga = vencimento estritamente antes de hoje (a que vence hoje ainda é a próxima).
 */

/** `YYYY-MM` deslocado `offset` meses. */
function shift(month: string, offset: number): string {
  const [year, m] = month.split("-").map(Number)
  const index = year * 12 + (m - 1) + offset
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`
}

function monthIndex(month: string): number {
  const [year, m] = month.split("-").map(Number)
  return year * 12 + (m - 1)
}

function lastDayOf(month: string): number {
  const [year, m] = month.split("-").map(Number)
  return new Date(Date.UTC(year, m, 0)).getUTCDate()
}

/** Vencimento no mês `YYYY-MM`: `dayOfMonth` limitado ao último dia do mês. */
export function dueDate(month: string, dayOfMonth: number): IsoDate {
  return `${month}-${String(Math.min(dayOfMonth, lastDayOf(month))).padStart(2, "0")}`
}

/** Vencimento da 1ª parcela. */
export function firstDueDate(startsOn: IsoDate, dayOfMonth: number): IsoDate {
  const month = startsOn.slice(0, 7)
  const due = dueDate(month, dayOfMonth)
  return due >= startsOn ? due : dueDate(shift(month, 1), dayOfMonth)
}

/** Vencimento da parcela `n` (1 = primeira). */
export function installmentDueDate(startsOn: IsoDate, dayOfMonth: number, n: number): IsoDate {
  return dueDate(shift(firstDueDate(startsOn, dayOfMonth).slice(0, 7), n - 1), dayOfMonth)
}

/** Parcelas que venceram antes de hoje (a de hoje não conta), até `total` se houver. */
export function installmentsPaid(startsOn: IsoDate, dayOfMonth: number, total: number | null, today: IsoDate): number {
  const first = firstDueDate(startsOn, dayOfMonth)
  if (first >= today) return 0
  const months = monthIndex(today.slice(0, 7)) - monthIndex(first.slice(0, 7))
  // Vencimentos de first até o mês de hoje; o deste mês só conta se já passou.
  const paid = months + (dueDate(today.slice(0, 7), dayOfMonth) < today ? 1 : 0)
  return total === null ? paid : Math.min(paid, total)
}
