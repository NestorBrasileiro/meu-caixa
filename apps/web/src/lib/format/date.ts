import type { IsoDate, IsoDateTime } from "@/lib/api/types"

const TIME_ZONE = "America/Sao_Paulo"

/** Datas de calendário (`YYYY-MM-DD`) são formatadas em UTC para não "voltar um dia". */
function calendarDate(date: IsoDate): Date {
  return new Date(`${date}T12:00:00Z`)
}

const formatters = {
  short: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" }),
  long: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }),
  numeric: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }),
  weekday: new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "UTC" }),
  month: new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }),
  monthShort: new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }),
  monthShortYear: new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }),
  dateTime: new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }),
}

/** Remove o ponto de abreviação ("out.") e o "de" ("01 de out"). */
const clean = (value: string) => value.replace(/\./g, "").replace(" de ", " ")

/** "07 out" */
export function formatDateShort(date: IsoDate): string {
  return clean(formatters.short.format(calendarDate(date)))
}

/** "07 de outubro de 2026" */
export function formatDateLong(date: IsoDate): string {
  return formatters.long.format(calendarDate(date))
}

/** "07/10/2026" */
export function formatDateNumeric(date: IsoDate): string {
  return formatters.numeric.format(calendarDate(date))
}

/** "quarta-feira, 07 de outubro" */
export function formatWeekday(date: IsoDate): string {
  return formatters.weekday.format(calendarDate(date))
}

/** `YYYY-MM` → "outubro de 2026" */
export function formatMonth(month: string): string {
  return formatters.month.format(calendarDate(`${month}-01`))
}

/** `YYYY-MM` → "out" (ou "out/26" com `withYear`) */
export function formatMonthShort(month: string, withYear = false): string {
  const formatter = withYear ? formatters.monthShortYear : formatters.monthShort
  return formatter.format(calendarDate(`${month}-01`)).replace(/\./g, "").replace(" de ", "/")
}

/** Instante → "07 out, 09:12" no fuso de São Paulo. */
export function formatDateTime(instant: IsoDateTime): string {
  return clean(formatters.dateTime.format(new Date(instant)))
}

/** "há 3 h", "há 2 dias" — relativo a `now` (passado explicitamente; nunca o relógio no servidor). */
export function formatRelative(instant: IsoDateTime, now: IsoDateTime): string {
  const minutes = Math.round((Date.parse(now) - Date.parse(instant)) / 60_000)
  if (minutes < 1) return "agora"
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.round(hours / 24)
  return days === 1 ? "há 1 dia" : `há ${days} dias`
}
