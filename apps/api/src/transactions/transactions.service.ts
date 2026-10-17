import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, ilike, lte, or, type SQL } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import { invoices, transactions, type TransactionRow } from '../database/schema.js';
import type { ListInvoicesQuery, ListTransactionsQuery } from './transactions.dto.js';

@Injectable()
export class TransactionsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listTransactions(query: ListTransactionsQuery) {
    if (query.from && query.to && query.from > query.to) {
      throw new BadRequestException('from deve ser anterior ou igual a to');
    }
    const conditions: (SQL | undefined)[] = [
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

  listInvoices(query: ListInvoicesQuery) {
    return this.db
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
      .where(query.accountId ? eq(invoices.accountId, query.accountId) : undefined)
      .orderBy(desc(invoices.dueDate));
  }

  /**
   * Recategoriza uma transação. A escolha fica em `user_category`, que o sync
   * nunca sobrescreve; `null` (ou a categoria original) volta para a do banco.
   */
  async recategorize(id: string, category: string | null) {
    const [current] = await this.db.select().from(transactions).where(eq(transactions.id, id));
    if (!current) throw new NotFoundException('Transação não encontrada');
    const userCategory = category === null || category === current.category ? null : category;
    const [row] = await this.db
      .update(transactions)
      .set({ userCategory, updatedAt: new Date() })
      .where(eq(transactions.id, id))
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
