import { Module } from '@nestjs/common';
import { InsightsModule } from '../insights/insights.module.js';
import { AnalysisRunsService } from './analysis-runs.service.js';
import { anthropicClientProvider } from './anthropic.client.js';
import { AskService } from './ask.service.js';
import { ClaudeController } from './claude.controller.js';

/**
 * Análise pela interface com a API da Anthropic, usando as mesmas
 * ferramentas do servidor MCP (`insights/tools.ts`) no Tool Runner do SDK.
 */
@Module({
  imports: [InsightsModule],
  controllers: [ClaudeController],
  providers: [anthropicClientProvider, AnalysisRunsService, AskService],
})
export class ClaudeModule {}
