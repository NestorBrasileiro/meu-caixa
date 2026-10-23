import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { InsightsModule } from '../insights/insights.module.js';
import { LoansModule } from '../loans/loans.module.js';
import { PlanningModule } from '../planning/planning.module.js';
import { SyncModule } from '../sync/sync.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { ExportController } from './export.controller.js';
import { ExportDataService } from './export-data.service.js';
import { ExportService } from './export.service.js';

/**
 * Exportação dos dados em Excel, PDF, CSV (zip) e Markdown: o
 * `ExportDataService` monta um relatório só e cada formato tem um
 * renderizador puro (`renderers/`).
 */
@Module({
  imports: [
    AccountsModule,
    TransactionsModule,
    PlanningModule,
    InsightsModule,
    LoansModule,
    SyncModule,
  ],
  controllers: [ExportController],
  providers: [ExportDataService, ExportService],
})
export class ExportModule {}
