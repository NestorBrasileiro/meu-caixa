import { Module } from '@nestjs/common';
import { InsightsModule } from '../insights/insights.module.js';
import { AnalysisRunsService } from './analysis-runs.service.js';
import { AnthropicSettingsStore } from './anthropic-settings.store.js';
import { anthropicSourceProvider } from './anthropic.client.js';
import { AskService } from './ask.service.js';
import { ClaudeController } from './claude.controller.js';

/**
 * Análise pela interface com a API da Anthropic, usando as mesmas
 * ferramentas do servidor MCP (`insights/tools.ts`) no Tool Runner do SDK.
 */
@Module({
  imports: [InsightsModule],
  controllers: [ClaudeController],
  providers: [AnthropicSettingsStore, anthropicSourceProvider, AnalysisRunsService, AskService],
  exports: [AnthropicSettingsStore],
})
export class ClaudeModule {}
