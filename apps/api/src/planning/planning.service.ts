import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DATABASE, type Database } from '../database/database.module.js';
import {
  budgetCategories,
  commitments,
  goals,
  transactions,
  type BudgetCategoryRow,
  type CommitmentRow,
  type GoalRow,
} from '../database/schema.js';
import { isIncome, isSpending } from '../domain/classify.js';
import { today } from '../domain/dates.js';
import { monthOf, monthRange, shiftMonth, type IsoMonth } from '../domain/months.js';
import { contributionIn, isActiveIn, paidInstallments, scheduleEnd } from '../domain/planning.js';
import type {
  CreateBudgetCategoryDto,
  CreateCommitmentDto,
  CreateGoalDto,
  UpdateBudgetCategoryDto,
  UpdateCommitmentDto,
  UpdateGoalDto,
} from './planning.dto.js';

/** Meses fechados usados nas médias de renda e gasto. */
const AVERAGE_MONTHS = 3;
const PROJECTION_MONTHS = 6;
/** Violação de chave estrangeira no Postgres. */
const FOREIGN_KEY_VIOLATION = '23503';

export interface MonthProjection {
  month: IsoMonth;
  expectedIncome: number;
  commitments: number;
  goalContributions: number;
  expectedVariableSpending: number;
  projectedBalance: number;
}

/**
 * Planejamento: compromissos fixos, metas e categorias de orçamento, mais a
 * projeção dos próximos meses a partir das transações sincronizadas.
 */
@Injectable()
export class PlanningService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async overview() {
    const todayDate = today(this.env.TIMEZONE);
    const [categoryRows, commitmentRows, goalRows] = await Promise.all([
      this.db
        .select()
        .from(budgetCategories)
        .orderBy(asc(budgetCategories.position), asc(budgetCategories.name)),
      this.db.select().from(commitments).orderBy(desc(commitments.amount), asc(commitments.name)),
      this.db.select().from(goals).orderBy(asc(goals.targetDate), asc(goals.name)),
    ]);

    return {
      categories: categoryRows.map(toCategory),
      commitments: commitmentRows.map((row) => toCommitment(row, todayDate)),
      goals: goalRows.map(toGoal),
      projections: await this.projections(todayDate, commitmentRows, goalRows),
    };
  }

  // ------------------------------------------------------------- compromissos

  async createCommitment(dto: CreateCommitmentDto) {
    assertDateOrder(dto.startsOn, dto.endsOn);
    const [row] = await this.write(() =>
      this.db
        .insert(commitments)
        .values({
          name: dto.name.trim(),
          amount: dto.amount,
          dayOfMonth: dto.dayOfMonth,
          paymentMethod: dto.paymentMethod,
          categoryId: dto.categoryId ?? null,
          startsOn: dto.startsOn,
          endsOn: dto.endsOn ?? null,
          installmentsTotal: dto.installmentsTotal ?? null,
          notes: dto.notes?.trim() || null,
        })
        .returning(),
    );
    return toCommitment(row!, today(this.env.TIMEZONE));
  }

  async updateCommitment(id: string, dto: UpdateCommitmentDto) {
    const current = await this.findOne(commitments, id, 'Compromisso');
    assertDateOrder(
      dto.startsOn ?? current.startsOn,
      dto.endsOn === undefined ? current.endsOn : dto.endsOn,
    );
    const [row] = await this.write(() =>
      this.db
        .update(commitments)
        .set({
          ...definedOnly({
            name: dto.name?.trim(),
            amount: dto.amount,
            dayOfMonth: dto.dayOfMonth,
            paymentMethod: dto.paymentMethod,
            categoryId: dto.categoryId,
            startsOn: dto.startsOn,
            endsOn: dto.endsOn,
            installmentsTotal: dto.installmentsTotal,
            notes: dto.notes === undefined ? undefined : dto.notes?.trim() || null,
          }),
          updatedAt: new Date(),
        })
        .where(eq(commitments.id, id))
        .returning(),
    );
    return toCommitment(row!, today(this.env.TIMEZONE));
  }

  async deleteCommitment(id: string): Promise<void> {
    await this.findOne(commitments, id, 'Compromisso');
    await this.db.delete(commitments).where(eq(commitments.id, id));
  }

  // -------------------------------------------------------------------- metas

  async createGoal(dto: CreateGoalDto) {
    const [row] = await this.write(() =>
      this.db
        .insert(goals)
        .values({
          name: dto.name.trim(),
          target: dto.target,
          saved: dto.saved ?? 0,
          targetDate: dto.targetDate,
          monthlyContribution: dto.monthlyContribution,
          accountId: dto.accountId ?? null,
        })
        .returning(),
    );
    return toGoal(row!);
  }

  async updateGoal(id: string, dto: UpdateGoalDto) {
    await this.findOne(goals, id, 'Meta');
    const [row] = await this.write(() =>
      this.db
        .update(goals)
        .set({
          ...definedOnly({
            name: dto.name?.trim(),
            target: dto.target,
            saved: dto.saved,
            targetDate: dto.targetDate,
            monthlyContribution: dto.monthlyContribution,
            accountId: dto.accountId,
          }),
          updatedAt: new Date(),
        })
        .where(eq(goals.id, id))
        .returning(),
    );
    return toGoal(row!);
  }

  async deleteGoal(id: string): Promise<void> {
    await this.findOne(goals, id, 'Meta');
    await this.db.delete(goals).where(eq(goals.id, id));
  }

  // --------------------------------------------------------------- categorias

  async createCategory(dto: CreateBudgetCategoryDto) {
    const [row] = await this.db
      .insert(budgetCategories)
      .values({
        name: dto.name.trim(),
        kind: dto.kind,
        sourceCategories: uniqueTrimmed(dto.sourceCategories ?? []),
        monthlyBudget: dto.monthlyBudget ?? null,
        position: dto.position ?? 0,
      })
      .returning();
    return toCategory(row!);
  }

  async updateCategory(id: string, dto: UpdateBudgetCategoryDto) {
    await this.findOne(budgetCategories, id, 'Categoria');
    const [row] = await this.db
      .update(budgetCategories)
      .set({
        ...definedOnly({
          name: dto.name?.trim(),
          kind: dto.kind,
          sourceCategories: dto.sourceCategories ? uniqueTrimmed(dto.sourceCategories) : undefined,
          monthlyBudget: dto.monthlyBudget,
          position: dto.position,
        }),
        updatedAt: new Date(),
      })
      .where(eq(budgetCategories.id, id))
      .returning();
    return toCategory(row!);
  }

  /** Compromissos da categoria ficam sem categoria (on delete set null). */
  async deleteCategory(id: string): Promise<void> {
    await this.findOne(budgetCategories, id, 'Categoria');
    await this.db.delete(budgetCategories).where(eq(budgetCategories.id, id));
  }

  // --------------------------------------------------------------- projeção

  /**
   * Próximos meses: renda média − compromissos ativos no mês − aportes das
   * metas ainda não atingidas − gasto variável médio. Gasto variável é o gasto
   * médio dos meses fechados menos os compromissos que estavam ativos neles.
   */
  private async projections(
    todayDate: string,
    commitmentRows: CommitmentRow[],
    goalRows: GoalRow[],
  ): Promise<MonthProjection[]> {
    const currentMonth = monthOf(todayDate);
    const closedMonths = Array.from({ length: AVERAGE_MONTHS }, (_, i) =>
      shiftMonth(currentMonth, i - AVERAGE_MONTHS),
    );
    const from = monthRange(closedMonths[0]!).from;
    const to = monthRange(closedMonths[closedMonths.length - 1]!).to;

    const rows = await this.db
      .select({
        amount: transactions.amount,
        category: transactions.category,
        userCategory: transactions.userCategory,
      })
      .from(transactions)
      .where(and(gte(transactions.date, from), lte(transactions.date, to)));

    let income = 0;
    let spending = 0;
    for (const row of rows) {
      const tx = { amount: row.amount, category: row.userCategory ?? row.category };
      if (isIncome(tx)) income += tx.amount;
      else if (isSpending(tx)) spending -= tx.amount;
    }
    const averageIncome = Math.round(income / AVERAGE_MONTHS);
    const committedInPeriod =
      closedMonths.reduce((sum, month) => sum + committedIn(commitmentRows, month), 0) /
      AVERAGE_MONTHS;
    const variable = Math.max(0, Math.round(spending / AVERAGE_MONTHS - committedInPeriod));

    return Array.from({ length: PROJECTION_MONTHS }, (_, i) => {
      const month = shiftMonth(currentMonth, i + 1);
      const committed = committedIn(commitmentRows, month);
      const contributions = goalRows.reduce((sum, goal) => sum + contributionIn(goal, i + 1), 0);
      return {
        month,
        expectedIncome: averageIncome,
        commitments: committed,
        goalContributions: contributions,
        expectedVariableSpending: variable,
        projectedBalance: averageIncome - committed - contributions - variable,
      };
    });
  }

  // ---------------------------------------------------------------- suporte

  private async findOne<T extends typeof commitments | typeof goals | typeof budgetCategories>(
    table: T,
    id: string,
    label: string,
  ) {
    const [row] = await this.db
      .select()
      .from(table as typeof commitments)
      .where(eq(table.id, id));
    if (!row) throw new NotFoundException(`${label} não encontrado(a)`);
    return row as T['$inferSelect'];
  }

  /** Traduz chave estrangeira inválida (categoria/conta inexistente) em 400. */
  private async write<R>(run: () => Promise<R>): Promise<R> {
    try {
      return await run();
    } catch (error) {
      const code =
        (error as { code?: string; cause?: { code?: string } }).cause?.code ??
        (error as { code?: string }).code;
      if (code === FOREIGN_KEY_VIOLATION) {
        throw new BadRequestException('Categoria ou conta informada não existe');
      }
      throw error;
    }
  }
}

function toCategory(row: BudgetCategoryRow) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    sourceCategories: row.sourceCategories,
    monthlyBudget: row.monthlyBudget,
  };
}

function toCommitment(row: CommitmentRow, todayDate: string) {
  return {
    id: row.id,
    name: row.name,
    amount: row.amount,
    dayOfMonth: row.dayOfMonth,
    paymentMethod: row.paymentMethod,
    categoryId: row.categoryId,
    startsOn: row.startsOn,
    endsOn: scheduleEnd(row),
    installments:
      row.installmentsTotal === null
        ? null
        : { paid: paidInstallments(row, todayDate)!, total: row.installmentsTotal },
    notes: row.notes,
  };
}

function toGoal(row: GoalRow) {
  return {
    id: row.id,
    name: row.name,
    target: row.target,
    saved: row.saved,
    targetDate: row.targetDate,
    monthlyContribution: row.monthlyContribution,
    accountId: row.accountId,
  };
}

/** Soma dos compromissos que têm vencimento no mês. */
function committedIn(rows: CommitmentRow[], month: IsoMonth): number {
  return rows.reduce((sum, row) => (isActiveIn(row, month) ? sum + row.amount : sum), 0);
}

function assertDateOrder(startsOn: string, endsOn: string | null | undefined): void {
  if (endsOn && endsOn < startsOn) {
    throw new BadRequestException('endsOn deve ser igual ou posterior a startsOn');
  }
}

function uniqueTrimmed(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

/** Remove chaves `undefined` (campo não enviado = não muda; `null` limpa). */
function definedOnly<T extends Record<string, unknown>>(values: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
