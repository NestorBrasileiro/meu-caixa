import type { IsoDate } from './finance.js';
import {
  firstDueDate,
  installmentDueDate,
  monthOf,
  monthsBetween,
  occurrencesUntil,
  type IsoMonth,
} from './months.js';

/** O que define o calendário de um compromisso mensal. */
export interface CommitmentSchedule {
  startsOn: IsoDate;
  dayOfMonth: number;
  endsOn: IsoDate | null;
  installmentsTotal: number | null;
}

/** Fim explícito ou, sem ele, o vencimento da última parcela. `null` = sem fim. */
export function scheduleEnd(schedule: CommitmentSchedule): IsoDate | null {
  if (schedule.endsOn !== null) return schedule.endsOn;
  if (schedule.installmentsTotal === null) return null;
  return installmentDueDate(schedule.startsOn, schedule.dayOfMonth, schedule.installmentsTotal);
}

/** Parcelas vencidas antes de hoje (a de hoje ainda não), até o total. */
export function paidInstallments(schedule: CommitmentSchedule, today: IsoDate): number | null {
  if (schedule.installmentsTotal === null) return null;
  return Math.min(
    schedule.installmentsTotal,
    occurrencesUntil(schedule.startsOn, schedule.dayOfMonth, today),
  );
}

/** O compromisso vence no mês: entre o mês do 1º vencimento e o mês do fim. */
export function isActiveIn(schedule: CommitmentSchedule, month: IsoMonth): boolean {
  const first = monthOf(firstDueDate(schedule.startsOn, schedule.dayOfMonth));
  if (monthsBetween(first, month) < 0) return false;
  const end = scheduleEnd(schedule);
  return end === null || monthsBetween(month, monthOf(end)) >= 0;
}

/** O que define os aportes de uma meta. */
export interface GoalPlan {
  target: number;
  saved: number;
  monthlyContribution: number;
}

/**
 * Aporte da meta daqui a `monthsAhead` meses (1 = próximo mês): o aporte
 * mensal até faltar menos que ele, então só o que falta, depois zero.
 */
export function contributionIn(goal: GoalPlan, monthsAhead: number): number {
  const remaining = goal.target - goal.saved;
  if (goal.monthlyContribution <= 0 || remaining <= 0) return 0;
  const left = remaining - (monthsAhead - 1) * goal.monthlyContribution;
  return Math.min(goal.monthlyContribution, Math.max(0, left));
}
