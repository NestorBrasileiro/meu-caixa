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

/** Primeiro e último dia do mês. */
export function monthRange(month: IsoMonth): { from: IsoDate; to: IsoDate } {
  const [year, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year!, m!, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
}

/**
 * Quantas ocorrências mensais (no dia de `startsOn`) já venceram até `today`,
 * contando a de `startsOn`. Zero se ainda não começou.
 */
export function occurrencesUntil(startsOn: IsoDate, today: IsoDate): number {
  if (today < startsOn) return 0;
  const months = index(monthOf(today)) - index(monthOf(startsOn));
  const dueThisMonth = Number(today.slice(8, 10)) >= Number(startsOn.slice(8, 10));
  return months + (dueThisMonth ? 1 : 0);
}
