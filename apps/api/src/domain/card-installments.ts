import type { Cents, IsoDate } from './finance.js';
import { dueDate, installmentDueDate, monthOf, shiftMonth, type IsoMonth } from './months.js';
import { paidInstallments, scheduleEnd, type CommitmentSchedule } from './planning.js';

/** Lançamento de cartão com parcela conhecida ("3 de 10"). */
export interface InstallmentRow {
  accountId: string;
  date: IsoDate;
  description: string;
  /** Com sinal: compras são negativas. */
  amount: Cents;
  installmentNumber: number;
  installmentTotal: number;
}

export interface OpenInstallment {
  accountId: string;
  description: string;
  /** Valor de cada parcela (positivo). */
  amount: Cents;
  installments: { paid: number; total: number };
  nextDueDate: IsoDate;
  endsOn: IsoDate;
}

/**
 * Compras parceladas ainda em aberto, deduzidas das parcelas já conhecidas.
 *
 * Sem id de parcelamento no Open Finance, a compra é identificada por conta +
 * descrição + total de parcelas + mês da 1ª parcela:
 * - em geral cada parcela vem datada no mês em que é cobrada, então a 1ª foi
 *   `n − 1` meses antes;
 * - alguns bancos datam todas no dia da compra: números de parcela diferentes
 *   da mesma compra no mesmo dia denunciam isso, e o mês da data é o da 1ª.
 *
 * O valor fica fora da chave (a 1ª parcela costuma levar os centavos da
 * divisão) e créditos (estornos) ficam de fora.
 */
export function openInstallments(rows: InstallmentRow[], today: IsoDate): OpenInstallment[] {
  const purchases = rows.filter((row) => row.amount < 0 && row.installmentTotal > 1);
  const product = (row: InstallmentRow) =>
    `${row.accountId}|${row.description}|${row.installmentTotal}`;

  const numbersByDay = new Map<string, Set<number>>();
  for (const row of purchases) {
    const day = `${product(row)}|${row.date}`;
    const numbers = numbersByDay.get(day) ?? new Set<number>();
    numbers.add(row.installmentNumber);
    numbersByDay.set(day, numbers);
  }

  const groups = new Map<string, { anchor: InstallmentRow; firstMonth: IsoMonth }>();
  for (const row of purchases) {
    const datedAtPurchase = numbersByDay.get(`${product(row)}|${row.date}`)!.size > 1;
    const firstMonth = shiftMonth(
      monthOf(row.date),
      datedAtPurchase ? 0 : -(row.installmentNumber - 1),
    );
    const key = `${product(row)}|${firstMonth}`;
    const current = groups.get(key)?.anchor;
    // Âncora = parcela mais adiantada (desempate pela data): independe da ordem das linhas.
    if (
      !current ||
      row.installmentNumber > current.installmentNumber ||
      (row.installmentNumber === current.installmentNumber && row.date > current.date)
    ) {
      groups.set(key, { anchor: row, firstMonth });
    }
  }

  const result: OpenInstallment[] = [];
  for (const { anchor, firstMonth } of groups.values()) {
    const dayOfMonth = Number(anchor.date.slice(8, 10));
    const schedule: CommitmentSchedule = {
      startsOn: dueDate(firstMonth, dayOfMonth),
      dayOfMonth,
      endsOn: null,
      installmentsTotal: anchor.installmentTotal,
    };
    const paid = paidInstallments(schedule, today)!;
    if (paid >= anchor.installmentTotal) continue;
    result.push({
      accountId: anchor.accountId,
      description: anchor.description,
      amount: -anchor.amount,
      installments: { paid, total: anchor.installmentTotal },
      nextDueDate: installmentDueDate(schedule.startsOn, dayOfMonth, paid + 1),
      endsOn: scheduleEnd(schedule)!,
    });
  }
  return result.sort((a, b) => b.amount - a.amount);
}
