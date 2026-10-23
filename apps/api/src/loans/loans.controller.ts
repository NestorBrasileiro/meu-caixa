import { Controller, Get } from '@nestjs/common';
import { LoansService } from './loans.service.js';

@Controller('loans')
export class LoansController {
  constructor(private readonly loans: LoansService) {}

  /** Empréstimos e financiamentos, do maior saldo devedor para o menor. */
  @Get()
  list() {
    return this.loans.list();
  }
}
