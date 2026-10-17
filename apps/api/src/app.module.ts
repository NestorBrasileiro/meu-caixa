import { Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { AccountsModule } from './accounts/accounts.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { InsightsModule } from './insights/insights.module.js';
import { IntegrationsModule } from './integrations/integrations.module.js';
import { McpModule } from './mcp/mcp.module.js';
import { PlanningModule } from './planning/planning.module.js';
import { SyncModule } from './sync/sync.module.js';
import { TransactionsModule } from './transactions/transactions.module.js';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuthModule,
    IntegrationsModule,
    AccountsModule,
    TransactionsModule,
    PlanningModule,
    SyncModule,
    InsightsModule,
    McpModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    },
  ],
})
export class AppModule {}
