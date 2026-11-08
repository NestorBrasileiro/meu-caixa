import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { LoansService } from './loans.service.js';

@Controller('loans')
export class LoansController {
  constructor(private readonly loans: LoansService) {}

  /** Empréstimos e financiamentos, do maior saldo devedor para o menor. */
  @Get()
  list(@CurrentUser() userId: string) {
    return this.loans.list(userId);
  }
}
