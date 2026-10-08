import { Controller, Get } from '@nestjs/common';
import { AccountsService } from './accounts.service.js';

@Controller()
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  /** Bancos conectados e o estado de cada conexão. */
  @Get('connections')
  listConnections() {
    return this.accounts.listConnections();
  }

  /** Contas e cartões com saldo e limite, em centavos. */
  @Get('accounts')
  listAccounts() {
    return this.accounts.listAccounts();
  }
}
