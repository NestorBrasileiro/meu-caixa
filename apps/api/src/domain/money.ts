import type { Cents } from './finance.js';

/** Converte um valor decimal (ex.: `-45.9`) para centavos (`-4590`). */
export function toCents(amount: number): Cents {
  if (!Number.isFinite(amount)) {
    throw new RangeError(`Valor monetário inválido: ${amount}`);
  }
  const cents = Math.round(Math.abs(amount) * 100);
  return amount < 0 && cents !== 0 ? -cents : cents;
}

const brlFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Centavos em reais para leitura humana: `-123456` → `"-R$ 1.234,56"`. */
export function formatBRL(cents: Cents): string {
  // O Intl separa "R$" do número com espaço não separável; troca por espaço comum.
  return brlFormatter.format(cents / 100).replace(/\s/g, ' ');
}
