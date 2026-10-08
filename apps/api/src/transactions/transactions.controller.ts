import { Controller, Get, Query } from '@nestjs/common';
import { ListInvoicesQuery, ListTransactionsQuery } from './transactions.dto.js';
import { TransactionsService } from './transactions.service.js';

@Controller()
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  /** Lista unificada de todos os bancos, mais recentes primeiro. Valores em centavos. */
  @Get('transactions')
  listTransactions(@Query() query: ListTransactionsQuery) {
    return this.transactions.listTransactions(query);
  }

  /** Faturas de cartão, da mais recente para a mais antiga. */
  @Get('invoices')
  listInvoices(@Query() query: ListInvoicesQuery) {
    return this.transactions.listInvoices(query);
  }
}
