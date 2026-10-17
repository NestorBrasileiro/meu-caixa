import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module.js';
import { SyncModule } from '../sync/sync.module.js';
import { OpenFinanceSettingsController } from './open-finance.controller.js';
import { OpenFinanceSettingsService } from './open-finance.service.js';

/** Telas de configuração (hoje: Open Finance). */
@Module({
  imports: [IntegrationsModule, SyncModule],
  controllers: [OpenFinanceSettingsController],
  providers: [OpenFinanceSettingsService],
})
export class SettingsModule {}
