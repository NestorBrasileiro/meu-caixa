import type { IsoDate } from './finance.js';

/** Mês no formato `YYYY-MM`. */
export type IsoMonth = string;

function index(month: IsoMonth): number {
  const [year, m] = month.split('-').map(Number);
  return year! * 12 + (m! - 1);
}

function fromIndex(i: number): IsoMonth {
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}

export function monthOf(date: IsoDate): IsoMonth {
  return date.slice(0, 7);
}

export function shiftMonth(month: IsoMonth, offset: number): IsoMonth {
  return fromIndex(index(month) + offset);
}

/** Último dia do mês (28 a 31). */
export function lastDayOf(month: IsoMonth): number {
  const [year, m] = month.split('-').map(Number);
  return new Date(Date.UTC(year!, m!, 0)).getUTCDate();
}

/** Primeiro e último dia do mês. */
export function monthRange(month: IsoMonth): { from: IsoDate; to: IsoDate } {
  return { from: `${month}-01`, to: `${month}-${String(lastDayOf(month)).padStart(2, '0')}` };
}

/** Meses de `from` até `to` (positivo se `to` é depois). */
export function monthsBetween(from: IsoMonth, to: IsoMonth): number {
  return index(to) - index(from);
}

/**
 * Vencimento no mês para o dia `dayOfMonth`, limitado ao último dia do mês
 * (dia 31 vence em 30/abr e 28/fev).
 */
export function dueDate(month: IsoMonth, dayOfMonth: number): IsoDate {
  return `${month}-${String(Math.min(dayOfMonth, lastDayOf(month))).padStart(2, '0')}`;
}

/** Primeiro vencimento em ou depois de `startsOn`. */
export function firstDueDate(startsOn: IsoDate, dayOfMonth: number): IsoDate {
  const month = monthOf(startsOn);
  const due = dueDate(month, dayOfMonth);
  return due >= startsOn ? due : dueDate(shiftMonth(month, 1), dayOfMonth);
}

/** Vencimento da parcela `n` (a primeira é 1). */
export function installmentDueDate(startsOn: IsoDate, dayOfMonth: number, n: number): IsoDate {
  return dueDate(shiftMonth(monthOf(firstDueDate(startsOn, dayOfMonth)), n - 1), dayOfMonth);
}

/**
 * Quantos vencimentos mensais caíram estritamente antes de `today`. O que vence
 * hoje ainda não conta como pago: é o próximo.
 */
export function occurrencesUntil(startsOn: IsoDate, dayOfMonth: number, today: IsoDate): number {
  const first = firstDueDate(startsOn, dayOfMonth);
  if (first >= today) return 0;
  const currentMonth = monthOf(today);
  const dueThisMonth = dueDate(currentMonth, dayOfMonth) < today ? 1 : 0;
  return monthsBetween(monthOf(first), currentMonth) + dueThisMonth;
}
