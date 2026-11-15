import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, gt, gte, ilike, lt, lte, or, sum, type SQL } from 'drizzle-orm';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { invoices, transactions, type TransactionRow } from '../database/schema.js';
import { estimateOpenInvoiceDates } from '../domain/cards.js';
import { today } from '../domain/dates.js';
import type { ListInvoicesQuery, ListTransactionsQuery } from './transactions.dto.js';

@Injectable()
export class TransactionsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async listTransactions(userId: string, query: ListTransactionsQuery) {
    if (query.from && query.to && query.from > query.to) {
      throw new BadRequestException('from deve ser anterior ou igual a to');
    }
    const conditions: (SQL | undefined)[] = [
      eq(transactions.userId, userId),
      query.accountId ? eq(transactions.accountId, query.accountId) : undefined,
      query.from ? gte(transactions.date, query.from) : undefined,
      query.to ? lte(transactions.date, query.to) : undefined,
      query.status ? eq(transactions.status, query.status) : undefined,
    ];
    if (query.search) {
      const pattern = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
      conditions.push(
        or(ilike(transactions.description, pattern), ilike(transactions.counterpartyName, pattern)),
      );
    }
    const where = and(...conditions);

    const [rows, [totals]] = await Promise.all([
      this.db
        .select()
        .from(transactions)
        .where(where)
        .orderBy(desc(transactions.date), asc(transactions.id))
        .limit(query.limit)
        .offset(query.offset),
      this.db.select({ total: count() }).from(transactions).where(where),
    ]);

    return {
      items: rows.map(toTransactionDto),
      total: totals?.total ?? 0,
      limit: query.limit,
      offset: query.offset,
    };
  }

  /**
   * Faturas dos cartões, da mais nova para a mais antiga. A Pluggy só devolve as
   * fechadas; para o cartão sem nenhuma a vencer, entra uma fatura em aberto
   * estimada (`estimated`): as compras desde o último fechamento, com fechamento
   * e vencimento um mês depois dos anteriores.
   */
  async listInvoices(userId: string, query: ListInvoicesQuery) {
    const rows = await this.db
      .select({
        id: invoices.id,
        accountId: invoices.accountId,
        dueDate: invoices.dueDate,
        closingDate: invoices.closingDate,
        total: invoices.total,
        minimumPayment: invoices.minimumPayment,
        currency: invoices.currency,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.userId, userId),
          query.accountId ? eq(invoices.accountId, query.accountId) : undefined,
        ),
      )
      .orderBy(desc(invoices.dueDate));

    const todayDate = today(this.env.TIMEZONE);
    const result = rows.map((row) => ({ ...row, estimated: false }));
    const byCard = new Map<string, typeof rows>();
    for (const row of rows) byCard.set(row.accountId, [...(byCard.get(row.accountId) ?? []), row]);
    for (const [accountId, cardInvoices] of byCard) {
      const dates = estimateOpenInvoiceDates(cardInvoices, todayDate);
      if (!dates) continue;
      const [spent] = await this.db
        .select({ total: sum(transactions.amount).mapWith(Number) })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.accountId, accountId),
            gt(transactions.date, dates.after),
            lte(transactions.date, todayDate < dates.closingDate ? todayDate : dates.closingDate),
            lt(transactions.amount, 0),
          ),
        );
      result.unshift({
        id: `estimada-${accountId}`,
        accountId,
        dueDate: dates.dueDate,
        closingDate: dates.closingDate,
        total: -(spent?.total ?? 0),
        minimumPayment: null,
        currency: cardInvoices[0]!.currency,
        estimated: true,
      });
    }
    return result.sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  }

  /**
   * Recategoriza uma transação. A escolha fica em `user_category`, que o sync
   * nunca sobrescreve; `null` (ou a categoria original) volta para a do banco.
   */
  async recategorize(userId: string, id: string, category: string | null) {
    const own = and(eq(transactions.id, id), eq(transactions.userId, userId));
    const [current] = await this.db.select().from(transactions).where(own);
    if (!current) throw new NotFoundException('Transação não encontrada');
    const userCategory = category === null || category === current.category ? null : category;
    const [row] = await this.db
      .update(transactions)
      .set({ userCategory, updatedAt: new Date() })
      .where(own)
      .returning();
    return toTransactionDto(row!);
  }
}

function toTransactionDto(row: TransactionRow) {
  return {
    id: row.id,
    accountId: row.accountId,
    date: row.date,
    description: row.description,
    amount: row.amount,
    status: row.status,
    /** Categoria efetiva: a escolhida pelo usuário ou, sem escolha, a do banco. */
    category: row.userCategory ?? row.category,
    /** Categoria que veio do banco (para mostrar "editada" e permitir desfazer). */
    originalCategory: row.category,
    paymentMethod: row.paymentMethod,
    counterpartyName: row.counterpartyName,
    installment:
      row.installmentNumber !== null && row.installmentTotal !== null
        ? { number: row.installmentNumber, total: row.installmentTotal }
        : null,
    invoiceExternalId: row.invoiceExternalId,
  };
}
