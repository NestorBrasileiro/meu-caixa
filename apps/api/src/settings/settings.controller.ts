import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  PreconditionFailedException,
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ClaudeDisabledError } from '../claude/claude-disabled.error.js';
import { ProviderNotConfiguredError } from '../integrations/finance-provider.js';
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
  ) {}

  @Get('pluggy')
  pluggy(): Promise<PluggySettingsView> {
    return this.settings.pluggy();
  }

  @Put('pluggy')
  async savePluggy(
    @Req() req: Request,
    @Body() dto: UpdatePluggySettingsDto,
  ): Promise<PluggySettingsView> {
    try {
      return await this.settings.savePluggy(req.user!.id, dto);
    } catch (error) {
      throw missingKey(error);
    }
  }

  @Get('anthropic')
  anthropicSettings(): Promise<AnthropicSettingsView> {
    return this.anthropic.view();
  }

  @Put('anthropic')
  async saveAnthropic(
    @Req() req: Request,
    @Body() dto: UpdateAnthropicSettingsDto,
  ): Promise<AnthropicSettingsView> {
    try {
      return await this.anthropic.save(req.user!.id, dto);
    } catch (error) {
      throw missingKey(error);
    }
  }

  @Delete('anthropic')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAnthropic(): Promise<void> {
    return this.anthropic.remove();
  }
}

/** Sem SETTINGS_ENCRYPTION_KEY não há como cifrar: 412 com a mensagem do que falta. */
function missingKey(error: unknown): unknown {
  if (error instanceof ProviderNotConfiguredError || error instanceof ClaudeDisabledError) {
    return new PreconditionFailedException(error.message);
  }
  return error;
}
