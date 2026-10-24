import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AccountsService } from './accounts.service.js';

@Controller()
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  /** Bancos conectados e o estado de cada conexão. */
  @Get('connections')
  listConnections(@CurrentUser() userId: string) {
    return this.accounts.listConnections(userId);
  }

  /** Contas e cartões com saldo e limite, em centavos. */
  @Get('accounts')
  listAccounts(@CurrentUser() userId: string) {
    return this.accounts.listAccounts(userId);
  }
}
