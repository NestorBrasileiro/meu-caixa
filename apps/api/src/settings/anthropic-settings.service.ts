import Anthropic from '@anthropic-ai/sdk';
import { BadGatewayException, BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  AnthropicSettingsStore,
  type AnthropicCredentials,
} from '../claude/anthropic-settings.store.js';
import { createAnthropicClient } from '../claude/anthropic.client.js';
import { ClaudeDisabledError } from '../claude/claude-disabled.error.js';
import { CLAUDE_MODELS, DEFAULT_CLAUDE_MODEL } from '../claude/claude-models.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import type { AnthropicSettingsRow } from '../database/schema.js';
import type { UpdateAnthropicSettingsDto } from './settings.dto.js';

/** O que a tela vê. A chave nunca sai da API. */
export interface AnthropicSettingsView {
  configured: boolean;
  model: string;
  models: { id: string; label: string }[];
  updatedAt: Date | null;
}

@Injectable()
export class AnthropicSettingsService {
  constructor(
    private readonly store: AnthropicSettingsStore,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async view(): Promise<AnthropicSettingsView> {
    return this.toView(await this.store.find());
  }

  /** Confere chave e modelo na Anthropic antes de gravar. */
  async save(userId: string, dto: UpdateAnthropicSettingsDto): Promise<AnthropicSettingsView> {
    this.store.assertCanEncrypt();
    const credentials: AnthropicCredentials = {
      apiKey: dto.apiKey?.trim() || (await this.savedKey()),
      model: dto.model,
    };
    await this.verify(credentials);
    return this.toView(await this.store.save(userId, credentials));
  }

  /** Desliga a análise pelo app (a do MCP não depende disto). */
  async remove(): Promise<void> {
    await this.store.remove();
  }

  private async savedKey(): Promise<string> {
    const current = await this.store.find();
    if (!current) throw new BadRequestException('Informe a chave da Anthropic');
    try {
      return this.store.decrypt(current).apiKey;
    } catch (error) {
      if (!(error instanceof ClaudeDisabledError)) throw error;
      throw new BadRequestException('A chave salva não pôde ser lida: informe de novo');
    }
  }

  private async verify({ apiKey, model }: AnthropicCredentials): Promise<void> {
    try {
      await createAnthropicClient(this.env, apiKey, 0).models.retrieve(model);
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        throw new BadRequestException('Chave da Anthropic inválida ou revogada');
      }
      if (error instanceof Anthropic.PermissionDeniedError) {
        throw new BadRequestException('Esta chave não tem permissão para usar a API da Anthropic');
      }
      if (error instanceof Anthropic.NotFoundError) {
        throw new BadRequestException(
          `O modelo ${model} não está disponível para esta conta da Anthropic`,
        );
      }
      throw new BadGatewayException('Não foi possível falar com a Anthropic agora. Tente de novo.');
    }
  }

  private toView(row: AnthropicSettingsRow | null): AnthropicSettingsView {
    return {
      configured: row !== null,
      model: row?.model ?? DEFAULT_CLAUDE_MODEL,
      models: CLAUDE_MODELS.map(({ id, label }) => ({ id, label })),
      updatedAt: row?.updatedAt ?? null,
    };
  }
}
