import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import {
  ListInvoicesQuery,
  ListTransactionsQuery,
  RecategorizeTransactionDto,
} from './transactions.dto.js';
import { TransactionsService } from './transactions.service.js';

@Controller()
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  /** Lista unificada de todos os bancos, mais recentes primeiro. Valores em centavos. */
  @Get('transactions')
  listTransactions(@CurrentUser() userId: string, @Query() query: ListTransactionsQuery) {
    return this.transactions.listTransactions(userId, query);
  }

  /** Muda a categoria de uma transação (sobrevive às sincronizações). */
  @Patch('transactions/:id')
  recategorize(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecategorizeTransactionDto,
  ) {
    return this.transactions.recategorize(userId, id, dto.category);
  }

  /** Faturas de cartão, da mais recente para a mais antiga. */
  @Get('invoices')
  listInvoices(@CurrentUser() userId: string, @Query() query: ListInvoicesQuery) {
    return this.transactions.listInvoices(userId, query);
  }
}
