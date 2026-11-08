import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, lt, lte } from 'drizzle-orm';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DATABASE, type Database } from '../database/database.module.js';
import {
  accounts,
  budgetCategories,
  commitments,
  goals,
  transactions,
  type BudgetCategoryRow,
  type CommitmentRow,
  type GoalRow,
} from '../database/schema.js';
import { openInstallments, type OpenInstallment } from '../domain/card-installments.js';
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
const MISSING_REFERENCE = 'Categoria ou conta informada não existe';

export interface MonthProjection {
  month: IsoMonth;
  expectedIncome: number;
  commitments: number;
  goalContributions: number;
  expectedVariableSpending: number;
  projectedBalance: number;
}

/** Parcela de compra no cartão ainda não totalmente paga (derivada das transações, não cadastrada). */
export interface CardInstallment extends OpenInstallment {
  cardName: string;
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

  async overview(userId: string) {
    const todayDate = today(this.env.TIMEZONE);
    const [categoryRows, commitmentRows, goalRows, cardInstallments] = await Promise.all([
      this.db
        .select()
        .from(budgetCategories)
        .where(eq(budgetCategories.userId, userId))
        .orderBy(asc(budgetCategories.position), asc(budgetCategories.name)),
      this.db
        .select()
        .from(commitments)
        .where(eq(commitments.userId, userId))
        .orderBy(desc(commitments.amount), asc(commitments.name)),
      this.db
        .select()
        .from(goals)
        .where(eq(goals.userId, userId))
        .orderBy(asc(goals.targetDate), asc(goals.name)),
      this.openCardInstallments(userId, todayDate),
    ]);

    return {
      categories: categoryRows.map(toCategory),
      commitments: commitmentRows.map((row) => toCommitment(row, todayDate)),
      goals: goalRows.map(toGoal),
      cardInstallments,
      projections: await this.projections(userId, todayDate, commitmentRows, goalRows),
    };
  }

  // ------------------------------------------------ parcelas de cartão

  /** Compras parceladas no cartão ainda em aberto (heurística em `domain/card-installments.ts`). */
  private async openCardInstallments(
    userId: string,
    todayDate: string,
  ): Promise<CardInstallment[]> {
    const cardAccounts = await this.db
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.type, 'CREDIT_CARD')));
    if (cardAccounts.length === 0) return [];
    const cardName = new Map(cardAccounts.map((account) => [account.id, account.name]));

    const rows = await this.db
      .select({
        accountId: transactions.accountId,
        date: transactions.date,
        description: transactions.description,
        amount: transactions.amount,
        installmentNumber: transactions.installmentNumber,
        installmentTotal: transactions.installmentTotal,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          inArray(
            transactions.accountId,
            cardAccounts.map((account) => account.id),
          ),
          isNotNull(transactions.installmentNumber),
          gt(transactions.installmentTotal, 1),
          lt(transactions.amount, 0),
        ),
      );

    const installmentRows = rows.map((row) => ({
      ...row,
      installmentNumber: row.installmentNumber!,
      installmentTotal: row.installmentTotal!,
    }));
    return openInstallments(installmentRows, todayDate).map((open) => ({
      ...open,
      cardName: cardName.get(open.accountId) ?? '',
    }));
  }

  // ------------------------------------------------------------- compromissos

  async createCommitment(userId: string, dto: CreateCommitmentDto) {
    assertDateOrder(dto.startsOn, dto.endsOn);
    await this.assertReferences(userId, { categoryId: dto.categoryId });
    const [row] = await this.write(() =>
      this.db
        .insert(commitments)
        .values({
          userId,
          name: dto.name.trim(),
          amount: dto.amount,
          dayOfMonth: dto.dayOfMonth,
          paymentMethod: dto.paymentMethod,
          categoryId: dto.categoryId ?? null,
          startsOn: dto.startsOn,
          endsOn: dto.endsOn ?? null,
          installmentsTotal: dto.installmentsTotal ?? null,
          notes: dto.notes?.trim() || null,
          subscriptionKey: dto.subscriptionKey ?? null,
        })
        .returning(),
    );
    return toCommitment(row!, today(this.env.TIMEZONE));
  }

  /** Só as categorias de orçamento (o formulário de compromisso precisa delas). */
  async categories(userId: string) {
    const rows = await this.db
      .select()
      .from(budgetCategories)
      .where(eq(budgetCategories.userId, userId))
      .orderBy(asc(budgetCategories.position), asc(budgetCategories.name));
    return rows.map(toCategory);
  }

  async updateCommitment(userId: string, id: string, dto: UpdateCommitmentDto) {
    const current = await this.findOne(userId, commitments, id, 'Compromisso');
    assertDateOrder(
      dto.startsOn ?? current.startsOn,
      dto.endsOn === undefined ? current.endsOn : dto.endsOn,
    );
    await this.assertReferences(userId, { categoryId: dto.categoryId });
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
        .where(and(eq(commitments.id, id), eq(commitments.userId, userId)))
        .returning(),
    );
    return toCommitment(row!, today(this.env.TIMEZONE));
  }

  async deleteCommitment(userId: string, id: string): Promise<void> {
    await this.findOne(userId, commitments, id, 'Compromisso');
    await this.db
      .delete(commitments)
      .where(and(eq(commitments.id, id), eq(commitments.userId, userId)));
  }

  // -------------------------------------------------------------------- metas

  async createGoal(userId: string, dto: CreateGoalDto) {
    await this.assertReferences(userId, { accountId: dto.accountId });
    const [row] = await this.write(() =>
      this.db
        .insert(goals)
        .values({
          userId,
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

  async updateGoal(userId: string, id: string, dto: UpdateGoalDto) {
    await this.findOne(userId, goals, id, 'Meta');
    await this.assertReferences(userId, { accountId: dto.accountId });
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
        .where(and(eq(goals.id, id), eq(goals.userId, userId)))
        .returning(),
    );
    return toGoal(row!);
  }

  async deleteGoal(userId: string, id: string): Promise<void> {
    await this.findOne(userId, goals, id, 'Meta');
    await this.db.delete(goals).where(and(eq(goals.id, id), eq(goals.userId, userId)));
  }

  // --------------------------------------------------------------- categorias

  async createCategory(userId: string, dto: CreateBudgetCategoryDto) {
    const [row] = await this.db
      .insert(budgetCategories)
      .values({
        userId,
        name: dto.name.trim(),
        kind: dto.kind,
        sourceCategories: uniqueTrimmed(dto.sourceCategories ?? []),
        monthlyBudget: dto.monthlyBudget ?? null,
        position: dto.position ?? 0,
      })
      .returning();
    return toCategory(row!);
  }

  async updateCategory(userId: string, id: string, dto: UpdateBudgetCategoryDto) {
    await this.findOne(userId, budgetCategories, id, 'Categoria');
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
      .where(and(eq(budgetCategories.id, id), eq(budgetCategories.userId, userId)))
      .returning();
    return toCategory(row!);
  }

  /** Compromissos da categoria ficam sem categoria (on delete set null). */
  async deleteCategory(userId: string, id: string): Promise<void> {
    await this.findOne(userId, budgetCategories, id, 'Categoria');
    await this.db
      .delete(budgetCategories)
      .where(and(eq(budgetCategories.id, id), eq(budgetCategories.userId, userId)));
  }

  // --------------------------------------------------------------- projeção

  /**
   * Próximos meses: renda média − compromissos ativos no mês − aportes das
   * metas ainda não atingidas − gasto variável médio. Gasto variável é o gasto
   * médio dos meses fechados menos os compromissos que estavam ativos neles.
   */
  private async projections(
    userId: string,
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
      .where(
        and(
          eq(transactions.userId, userId),
          gte(transactions.date, from),
          lte(transactions.date, to),
        ),
      );

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

  /** Registro do usuário; o de outro usuário é tratado como inexistente (404). */
  private async findOne<T extends typeof commitments | typeof goals | typeof budgetCategories>(
    userId: string,
    table: T,
    id: string,
    label: string,
  ) {
    const [row] = await this.db
      .select()
      .from(table as typeof commitments)
      .where(and(eq(table.id, id), eq(table.userId, userId)));
    if (!row) throw new NotFoundException(`${label} não encontrado(a)`);
    return row as T['$inferSelect'];
  }

  /**
   * Categoria e conta citadas no corpo precisam ser do usuário: a chave
   * estrangeira só garante que existem, não de quem são.
   */
  private async assertReferences(
    userId: string,
    refs: { categoryId?: string | null; accountId?: string | null },
  ): Promise<void> {
    const checks = [
      refs.categoryId
        ? this.db
            .select({ id: budgetCategories.id })
            .from(budgetCategories)
            .where(
              and(eq(budgetCategories.id, refs.categoryId), eq(budgetCategories.userId, userId)),
            )
        : null,
      refs.accountId
        ? this.db
            .select({ id: accounts.id })
            .from(accounts)
            .where(and(eq(accounts.id, refs.accountId), eq(accounts.userId, userId)))
        : null,
    ];
    for (const rows of await Promise.all(checks)) {
      if (rows && rows.length === 0) throw new BadRequestException(MISSING_REFERENCE);
    }
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
        throw new BadRequestException(MISSING_REFERENCE);
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
