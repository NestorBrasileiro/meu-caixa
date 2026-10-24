import { Module } from '@nestjs/common';
import { InsightsModule } from '../insights/insights.module.js';
import { SubscriptionsController } from './subscriptions.controller.js';
import { SubscriptionsService } from './subscriptions.service.js';

/** Aba "Assinaturas": cobranças recorrentes detectadas das transações, com os ajustes do usuário. */
@Module({
  imports: [InsightsModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
})
export class SubscriptionsModule {}
