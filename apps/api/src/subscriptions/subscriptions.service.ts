import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import {
  commitments,
  subscriptionPreferences,
  type SubscriptionPreferenceKind,
} from '../database/schema.js';
import { monthOf, monthRange, shiftMonth } from '../domain/months.js';
import { scheduleEnd } from '../domain/planning.js';
import { detectRecurrences } from '../insights/aggregate.js';
import { InsightsService } from '../insights/insights.service.js';
import type { UpdateSubscriptionPreferenceDto } from './subscriptions.dto.js';
import { buildSubscriptions, type SubscriptionsOverview } from './subscriptions.js';

/** Histórico usado na detecção: o mesmo que a sincronização traz (12 meses). */
const HISTORY_MONTHS = 12;
/** Cobrança em 2 meses distintos já conta: assinatura nova aparece na 2ª fatura. */
const MIN_MONTHS = 2;

/**
 * Assinaturas e cobranças recorrentes, detectadas das transações do usuário
 * a cada leitura (sem cópia no banco) e ajustadas pelas preferências dele.
 */
@Injectable()
export class SubscriptionsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly insights: InsightsService,
  ) {}

  async overview(userId: string): Promise<SubscriptionsOverview & { today: string }> {
    const todayDate = this.insights.today();
    const from = monthRange(shiftMonth(monthOf(todayDate), 1 - HISTORY_MONTHS)).from;
    const [txs, preferences, commitmentRows] = await Promise.all([
      this.insights.loadTransactions(userId, { from, to: todayDate }),
      this.db
        .select({
          key: subscriptionPreferences.key,
          kind: subscriptionPreferences.kind,
          name: subscriptionPreferences.name,
        })
        .from(subscriptionPreferences)
        .where(eq(subscriptionPreferences.userId, userId)),
      this.db
        .select({
          id: commitments.id,
          name: commitments.name,
          subscriptionKey: commitments.subscriptionKey,
          dayOfMonth: commitments.dayOfMonth,
          startsOn: commitments.startsOn,
          endsOn: commitments.endsOn,
          installmentsTotal: commitments.installmentsTotal,
        })
        .from(commitments)
        .where(eq(commitments.userId, userId)),
    ]);
    // Encerrado não conta como planejado: a projeção já não o inclui.
    const planned = commitmentRows.filter((row) => {
      const end = scheduleEnd(row);
      return end === null || end >= todayDate;
    });
    const recurrences = detectRecurrences(txs, { today: todayDate, minMonths: MIN_MONTHS });
    return {
      today: todayDate,
      ...buildSubscriptions(recurrences, preferences, planned, todayDate),
    };
  }

  /**
   * Grava o ajuste mudando só os campos enviados, num upsert (duas abas
   * mexendo na mesma cobrança não apagam o ajuste uma da outra). Linha que
   * fica sem marcação e sem nome é apagada: volta ao automático.
   */
  async setPreference(userId: string, dto: UpdateSubscriptionPreferenceDto): Promise<void> {
    const changes: { kind?: SubscriptionPreferenceKind | null; name?: string | null } = {};
    if (dto.kind !== undefined) changes.kind = dto.kind;
    if (dto.name !== undefined) changes.name = dto.name;
    if (Object.keys(changes).length === 0) return;

    await this.db
      .insert(subscriptionPreferences)
      .values({ userId, key: dto.key, kind: dto.kind ?? null, name: dto.name ?? null })
      .onConflictDoUpdate({
        target: [subscriptionPreferences.userId, subscriptionPreferences.key],
        set: { ...changes, updatedAt: new Date() },
      });
    await this.db
      .delete(subscriptionPreferences)
      .where(
        and(
          eq(subscriptionPreferences.userId, userId),
          eq(subscriptionPreferences.key, dto.key),
          isNull(subscriptionPreferences.kind),
          isNull(subscriptionPreferences.name),
        ),
      );
  }
}
