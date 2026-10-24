import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  PreconditionFailedException,
  Put,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { ClaudeDisabledError } from '../claude/claude-disabled.error.js';
import { ProviderNotConfiguredError } from '../integrations/finance-provider.js';
import { McpTokenStore, type McpTokenView } from '../mcp/mcp-token.store.js';
import {
  AnthropicSettingsService,
  type AnthropicSettingsView,
} from './anthropic-settings.service.js';
import { UpdateAnthropicSettingsDto, UpdatePluggySettingsDto } from './settings.dto.js';
import { SettingsService, type PluggySettingsView } from './settings.service.js';

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly anthropic: AnthropicSettingsService,
    private readonly mcpTokens: McpTokenStore,
  ) {}

  @Get('pluggy')
  pluggy(@CurrentUser() userId: string): Promise<PluggySettingsView> {
    return this.settings.pluggy(userId);
  }

  @Put('pluggy')
  async savePluggy(
    @CurrentUser() userId: string,
    @Body() dto: UpdatePluggySettingsDto,
  ): Promise<PluggySettingsView> {
    try {
      return await this.settings.savePluggy(userId, dto);
    } catch (error) {
      throw missingKey(error);
    }
  }

  @Get('anthropic')
  anthropicSettings(@CurrentUser() userId: string): Promise<AnthropicSettingsView> {
    return this.anthropic.view(userId);
  }

  @Put('anthropic')
  async saveAnthropic(
    @CurrentUser() userId: string,
    @Body() dto: UpdateAnthropicSettingsDto,
  ): Promise<AnthropicSettingsView> {
    try {
      return await this.anthropic.save(userId, dto);
    } catch (error) {
      throw missingKey(error);
    }
  }

  @Delete('anthropic')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAnthropic(@CurrentUser() userId: string): Promise<void> {
    return this.anthropic.remove(userId);
  }

  /** Se há token pessoal do MCP (nunca o token em si). */
  @Get('mcp-token')
  mcpToken(@CurrentUser() userId: string): Promise<McpTokenView> {
    return this.mcpTokens.view(userId);
  }

  /** Gera um token novo, que substitui o anterior. É a única vez que ele aparece. */
  @Post('mcp-token')
  async issueMcpToken(@CurrentUser() userId: string): Promise<{ token: string }> {
    return { token: await this.mcpTokens.issue(userId) };
  }

  @Delete('mcp-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeMcpToken(@CurrentUser() userId: string): Promise<void> {
    return this.mcpTokens.revoke(userId);
  }
}

/** Sem SETTINGS_ENCRYPTION_KEY não há como cifrar: 412 com a mensagem do que falta. */
function missingKey(error: unknown): unknown {
  if (error instanceof ProviderNotConfiguredError || error instanceof ClaudeDisabledError) {
    return new PreconditionFailedException(error.message);
  }
  return error;
}
