import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module.js';
import { SyncController } from './sync.controller.js';
import { SyncScheduler } from './sync.scheduler.js';
import { SyncService } from './sync.service.js';

@Module({
  imports: [IntegrationsModule],
  controllers: [SyncController],
  providers: [SyncService, SyncScheduler],
  exports: [SyncService],
})
export class SyncModule {}
