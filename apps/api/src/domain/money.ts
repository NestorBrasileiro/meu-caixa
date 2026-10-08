import type { Cents } from './finance.js';

/** Converte um valor decimal (ex.: `-45.9`) para centavos (`-4590`). */
export function toCents(amount: number): Cents {
  if (!Number.isFinite(amount)) {
    throw new RangeError(`Valor monetário inválido: ${amount}`);
  }
  const cents = Math.round(Math.abs(amount) * 100);
  return amount < 0 && cents !== 0 ? -cents : cents;
}
