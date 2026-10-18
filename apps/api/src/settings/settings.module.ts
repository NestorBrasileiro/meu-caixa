import { Module } from '@nestjs/common';
import { ClaudeModule } from '../claude/claude.module.js';
import { IntegrationsModule } from '../integrations/integrations.module.js';
import { AnthropicSettingsService } from './anthropic-settings.service.js';
import { SettingsController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';

/** Configurações do app editáveis pela interface (Pluggy e Anthropic). */
@Module({
  imports: [IntegrationsModule, ClaudeModule],
  controllers: [SettingsController],
  providers: [SettingsService, AnthropicSettingsService],
})
export class SettingsModule {}
