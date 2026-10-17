import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { PlanningModule } from '../planning/planning.module.js';
import { AnalysisController } from './analysis.controller.js';
import { AnalysisService } from './analysis.service.js';
import { InsightsService } from './insights.service.js';

/**
 * Dados para a análise do Claude (agregações e recorrências) e o histórico
 * de análises (`GET /api/analysis`). As ferramentas em `tools.ts` são usadas
 * pelo servidor MCP e podem ser usadas pela análise feita na interface.
 */
@Module({
  imports: [AccountsModule, PlanningModule],
  controllers: [AnalysisController],
  providers: [InsightsService, AnalysisService],
  exports: [InsightsService, AnalysisService],
})
export class InsightsModule {}
