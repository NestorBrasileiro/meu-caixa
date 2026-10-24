import { Module } from '@nestjs/common';
import { ClaudeModule } from '../claude/claude.module.js';
import { IntegrationsModule } from '../integrations/integrations.module.js';
import { McpModule } from '../mcp/mcp.module.js';
import { AnthropicSettingsService } from './anthropic-settings.service.js';
import { SettingsController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';

/** Configurações de cada usuário editáveis pela interface (Pluggy, Anthropic e token do MCP). */
@Module({
  imports: [IntegrationsModule, ClaudeModule, McpModule],
  controllers: [SettingsController],
  providers: [SettingsService, AnthropicSettingsService],
})
export class SettingsModule {}
