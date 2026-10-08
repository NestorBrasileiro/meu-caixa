import type { IsoDate } from './finance.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    // en-CA formata como YYYY-MM-DD.
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  // O round-trip rejeita datas que não existem, como 2026-02-30.
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/** Dia do calendário em que um instante cai, no fuso informado. */
export function toLocalDate(instant: Date | string, timeZone: string): IsoDate {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Data inválida: ${String(instant)}`);
  }
  return formatterFor(timeZone).format(date);
}

export function today(timeZone: string, now: Date = new Date()): IsoDate {
  return toLocalDate(now, timeZone);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}
