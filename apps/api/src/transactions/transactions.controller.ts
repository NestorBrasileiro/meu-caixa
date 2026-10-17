import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
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
  listTransactions(@Query() query: ListTransactionsQuery) {
    return this.transactions.listTransactions(query);
  }

  /** Muda a categoria de uma transação (sobrevive às sincronizações). */
  @Patch('transactions/:id')
  recategorize(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RecategorizeTransactionDto) {
    return this.transactions.recategorize(id, dto.category);
  }

  /** Faturas de cartão, da mais recente para a mais antiga. */
  @Get('invoices')
  listInvoices(@Query() query: ListInvoicesQuery) {
    return this.transactions.listInvoices(query);
  }
}
