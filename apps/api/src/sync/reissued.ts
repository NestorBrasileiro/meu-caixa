import type { IsoDate } from '../domain/finance.js';

/** Pendente vira efetivada com até alguns dias de diferença na data (cartão, fim de semana). */
const MAX_DAYS_APART = 10;
const DAY_MS = 86_400_000;

export interface GoneTransaction {
  externalId: string;
  date: IsoDate;
  amount: number;
  description: string;
  userCategory: string | null;
}

export interface ArrivedTransaction {
  externalId: string;
  date: IsoDate;
  amount: number;
  description: string;
}

const daysApart = (a: IsoDate, b: IsoDate) =>
  Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS;

/**
 * Liga cada transação que sumiu da janela, com categoria editada pelo usuário,
 * à que chegou no lugar dela (o banco reemitiu com outro id): mesmo valor, até
 * `MAX_DAYS_APART` dias de diferença, preferindo a mesma descrição e depois a
 * data mais próxima. Cada transação nova recebe no máximo uma categoria.
 */
export function carryUserCategories(
  gone: GoneTransaction[],
  arrived: ArrivedTransaction[],
): { from: GoneTransaction; to: ArrivedTransaction }[] {
  const taken = new Set<string>();
  const result: { from: GoneTransaction; to: ArrivedTransaction }[] = [];
  for (const old of gone) {
    if (old.userCategory === null) continue;
    const best = arrived
      .filter(
        (candidate) =>
          !taken.has(candidate.externalId) &&
          candidate.amount === old.amount &&
          daysApart(candidate.date, old.date) <= MAX_DAYS_APART,
      )
      .sort(
        (a, b) =>
          Number(b.description === old.description) - Number(a.description === old.description) ||
          daysApart(a.date, old.date) - daysApart(b.date, old.date),
      )[0];
    if (!best) continue;
    taken.add(best.externalId);
    result.push({ from: old, to: best });
  }
  return result;
}
