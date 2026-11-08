import { BadGatewayException, BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import type { PluggySettingsRow } from '../database/schema.js';
import { ProviderNotConfiguredError } from '../integrations/finance-provider.js';
import { createPluggyClient } from '../integrations/integrations.module.js';
import {
  PluggySettingsStore,
  type PluggyCredentials,
} from '../integrations/pluggy/pluggy-settings.store.js';
import { PluggyApiError } from '../integrations/pluggy/pluggy.client.js';
import type { UpdatePluggySettingsDto } from './settings.dto.js';

/** O que a tela vê. O Client Secret nunca sai da API. */
export interface PluggySettingsView {
  provider: Env['FINANCE_PROVIDER'];
  configured: boolean;
  clientId: string | null;
  itemIds: string[];
  updatedAt: Date | null;
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly store: PluggySettingsStore,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async pluggy(userId: string): Promise<PluggySettingsView> {
    return this.view(await this.store.find(userId));
  }

  /** Confere as credenciais na Pluggy antes de gravar. */
  async savePluggy(userId: string, dto: UpdatePluggySettingsDto): Promise<PluggySettingsView> {
    this.store.assertCanEncrypt();
    const credentials: PluggyCredentials = {
      clientId: dto.clientId.trim(),
      clientSecret: dto.clientSecret?.trim() || (await this.savedSecret(userId)),
      itemIds: [...new Set(dto.itemIds.map((id) => id.trim()))],
    };
    await this.verify(credentials);
    return this.view(await this.store.save(userId, credentials));
  }

  private async savedSecret(userId: string): Promise<string> {
    const current = await this.store.find(userId);
    if (!current) throw new BadRequestException('Informe o Client Secret');
    try {
      return this.store.decrypt(current).clientSecret;
    } catch (error) {
      if (!(error instanceof ProviderNotConfiguredError)) throw error;
      throw new BadRequestException('O Client Secret salvo não pôde ser lido: informe de novo');
    }
  }

  private async verify(credentials: PluggyCredentials): Promise<void> {
    const client = createPluggyClient(this.env, credentials, 0);
    try {
      await client.verifyCredentials();
    } catch (error) {
      throw rejection(error, 'Client ID ou Client Secret inválidos');
    }
    for (const itemId of credentials.itemIds) {
      try {
        await client.getItem(itemId);
      } catch (error) {
        throw rejection(error, `Item ${itemId} não encontrado nesta aplicação da Pluggy`);
      }
    }
  }

  private view(row: PluggySettingsRow | null): PluggySettingsView {
    return {
      provider: this.env.FINANCE_PROVIDER,
      configured: row !== null,
      clientId: row?.clientId ?? null,
      itemIds: row?.itemIds ?? [],
      updatedAt: row?.updatedAt ?? null,
    };
  }
}

/** 4xx da Pluggy = dado errado (400 com a mensagem); o resto = Pluggy fora (502). */
function rejection(error: unknown, message: string): Error {
  if (
    error instanceof PluggyApiError &&
    error.status !== undefined &&
    error.status >= 400 &&
    error.status < 500 &&
    !error.retryable
  ) {
    return new BadRequestException(message);
  }
  return new BadGatewayException('Não foi possível falar com a Pluggy agora. Tente de novo.');
}
