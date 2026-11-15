import { addDays } from './dates.js';
import type { AccountType, Cents, IsoDate } from './finance.js';
import { dueDate, monthOf, shiftMonth } from './months.js';

export interface CardLimits {
  type: AccountType;
  balance: Cents;
  creditLimit: Cents | null;
  availableCredit: Cents | null;
}

/**
 * Cartão com limite, sem dívida e sem nada disponível: o banco zerou o limite
 * (bloqueado, cancelado ou substituído por outro). O limite dele não conta nos
 * totais e o uso não é 100%.
 */
export function isBlockedCard(card: CardLimits): boolean {
  return (
    card.type === 'CREDIT_CARD' &&
    card.balance === 0 &&
    card.availableCredit === 0 &&
    (card.creditLimit ?? 0) > 0
  );
}

/** Quanto do limite está em uso: a dívida em aberto (o `balance` do cartão). */
export function cardUsed(card: CardLimits): Cents {
  return Math.max(0, card.balance);
}

export interface ClosedInvoice {
  dueDate: IsoDate;
  closingDate: IsoDate | null;
}

/** Fechamento costuma ser uns 7 a 10 dias antes do vencimento; sem a data, usa 7. */
const DAYS_FROM_CLOSING_TO_DUE = 7;

const sameDayIn = (date: IsoDate, months: number): IsoDate =>
  dueDate(shiftMonth(monthOf(date), months), Number(date.slice(8, 10)));

/**
 * Datas da fatura em aberto quando o banco só devolve as fechadas (a Pluggy
 * não manda a atual): um mês depois da última conhecida, avançando até o
 * vencimento não ter passado. Entram nela as compras com data depois de
 * `after` (o fechamento anterior).
 */
export function estimateOpenInvoiceDates(
  invoices: ClosedInvoice[],
  today: IsoDate,
): { after: IsoDate; closingDate: IsoDate; dueDate: IsoDate } | null {
  const last = [...invoices].sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0];
  if (!last || last.dueDate >= today) return null;
  const lastClosing = last.closingDate ?? addDays(last.dueDate, -DAYS_FROM_CLOSING_TO_DUE);
  let months = 1;
  while (sameDayIn(last.dueDate, months) < today) months += 1;
  return {
    after: sameDayIn(lastClosing, months - 1),
    closingDate: sameDayIn(lastClosing, months),
    dueDate: sameDayIn(last.dueDate, months),
  };
}
