import { Body, Controller, Get, HttpCode, HttpStatus, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { UpdateSubscriptionPreferenceDto } from './subscriptions.dto.js';
import { SubscriptionsService } from './subscriptions.service.js';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  /** Assinaturas ativas, outras cobranças recorrentes, as que pararam e as ocultas. */
  @Get()
  overview(@CurrentUser() userId: string) {
    return this.subscriptions.overview(userId);
  }

  /** "Não é assinatura", "É assinatura", renomear ou desfazer (a tela relê a visão depois). */
  @Put('preferences')
  @HttpCode(HttpStatus.NO_CONTENT)
  setPreference(
    @CurrentUser() userId: string,
    @Body() dto: UpdateSubscriptionPreferenceDto,
  ): Promise<void> {
    return this.subscriptions.setPreference(userId, dto);
  }
}
