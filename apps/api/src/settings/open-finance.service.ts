import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray, ne } from 'drizzle-orm';
import type { AuthUser } from '../auth/auth.types.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { connections } from '../database/schema.js';
import { FinanceProviderRegistry } from '../integrations/open-finance/finance-provider.registry.js';
import {
  clientIdHint,
  MEU_PLUGGY_URL,
  providerNameOf,
  type OpenFinanceMode,
  type PluggyCredentials,
  type SettingSource,
  type StoredOpenFinanceMode,
} from '../integrations/open-finance/open-finance-config.js';
import { OpenFinanceConfigStore } from '../integrations/open-finance/open-finance-config.store.js';
import { PluggyApiError, type PluggyClient } from '../integrations/pluggy/pluggy.client.js';
import type { PluggyItem } from '../integrations/pluggy/pluggy.schemas.js';
import { SyncInProgressError, SyncService } from '../sync/sync.service.js';

/** Formato devolvido por todas as rotas de Configurações → Open Finance. */
export interface OpenFinanceSettings {
  mode: { value: OpenFinanceMode; source: SettingSource | 'default' };
  credentials: {
    configured: boolean;
    source: SettingSource | null;
    clientIdHint: string | null;
    updatedAt: string | null;
  };
  items: {
    source: SettingSource;
    list: {
      id: string;
      institutionName: string | null;
      status: string | null;
      lastUpdatedAt: string | null;
      error: string | null;
    }[];
  };
  connectUrl: string;
}

/** Meu Pluggy permite 5 conexões; folga para quem usa uma aplicação própria. */
export const MAX_ITEMS = 20;

const PLUGGY_PROVIDER = providerNameOf('pluggy');

export const MESSAGES = {
  modeFromEnv:
    'A origem dos dados está definida pela variável FINANCE_PROVIDER no servidor; altere-a lá para trocar.',
  credentialsFromEnv:
    'As credenciais estão definidas nas variáveis PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET do servidor; altere-as lá.',
  itemsFromEnv:
    'Os bancos estão definidos na variável PLUGGY_ITEM_IDS do servidor; altere-a lá para adicionar ou remover.',
  invalidCredentials: 'Client ID ou Client Secret inválidos: a Pluggy recusou essas credenciais.',
  pluggyUnreachable:
    'Não foi possível falar com a Pluggy agora. Confira a conexão do servidor e tente de novo em instantes.',
  noCredentials: 'Cadastre primeiro o Client ID e o Client Secret da Pluggy para adicionar bancos.',
  duplicateItem: 'Esse banco já foi adicionado.',
  tooManyItems: `Limite de ${MAX_ITEMS} bancos atingido: remova um antes de adicionar outro.`,
  itemNotFound:
    'Item não encontrado na Pluggy. Confira o id no Meu Pluggy (cada banco conectado tem o seu) e se ele é desta aplicação.',
  itemForbidden:
    'A Pluggy recusou o acesso a esse item: ele pertence a outra aplicação ou as credenciais não valem para ele.',
  itemNotInList: 'Esse banco não está na lista.',
  syncBusy:
    'Há uma sincronização em andamento. Tente de novo quando ela terminar (acompanhe em Sincronizar).',
} as const;

/**
 * Configurações → Open Finance: modo (Pluggy/fictício), credenciais da Pluggy
 * e bancos conectados (items do Meu Pluggy), cadastrados pela interface.
 * O ambiente sempre vence: o que vem de lá aparece aqui só para leitura (409).
 */
@Injectable()
export class OpenFinanceSettingsService {
  private readonly logger = new Logger(OpenFinanceSettingsService.name);
  /** Sincronização pedida enquanto outra rodava: roda quando ela terminar. */
  private resyncQueued = false;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(DATABASE) private readonly db: Database,
    private readonly store: OpenFinanceConfigStore,
    private readonly registry: FinanceProviderRegistry,
    private readonly sync: SyncService,
  ) {}

  async get(): Promise<OpenFinanceSettings> {
    const config = await this.store.load();
    const ids = config.items.ids;
    const [snapshots, synced] = await Promise.all([
      this.store.loadSnapshots(),
      ids.length === 0
        ? []
        : this.db
            .select({
              externalId: connections.externalId,
              institutionName: connections.institutionName,
              lastRefreshedAt: connections.lastRefreshedAt,
            })
            .from(connections)
            .where(
              and(eq(connections.provider, PLUGGY_PROVIDER), inArray(connections.externalId, ids)),
            ),
    ]);
    const syncedById = new Map(synced.map((row) => [row.externalId, row]));

    return {
      mode: config.mode,
      credentials: {
        configured: config.credentials !== null,
        source: config.credentials?.source ?? null,
        clientIdHint: config.credentials ? clientIdHint(config.credentials.clientId) : null,
        updatedAt: config.credentials?.updatedAt?.toISOString() ?? null,
      },
      items: {
        source: config.items.source,
        list: ids.map((id) => {
          const snapshot = snapshots[id];
          const row = syncedById.get(id);
          return {
            id,
            institutionName: snapshot?.institutionName ?? row?.institutionName ?? null,
            status: snapshot?.status ?? null,
            lastUpdatedAt: snapshot?.lastUpdatedAt ?? row?.lastRefreshedAt?.toISOString() ?? null,
            error: snapshot?.error ?? null,
          };
        }),
      },
      connectUrl: MEU_PLUGGY_URL,
    };
  }

  /**
   * Troca a origem dos dados. Apaga o que foi sincronizado de outro provedor
   * (conexões, e em cascata contas, transações, faturas e recategorizações);
   * o planejamento fica. Depois sincroniza em background.
   */
  async setMode(mode: StoredOpenFinanceMode, user: AuthUser): Promise<OpenFinanceSettings> {
    if (this.env.FINANCE_PROVIDER) throw new ConflictException(MESSAGES.modeFromEnv);

    const purged = await this.exclusive(() =>
      this.db.transaction(async (tx) => {
        const removed = await tx
          .delete(connections)
          .where(ne(connections.provider, providerNameOf(mode)))
          .returning({ id: connections.id });
        await this.store.saveMode(mode, tx);
        return removed.length;
      }),
    );
    this.logger.log(
      `Origem dos dados do Open Finance alterada para "${mode}" por ${who(user)}` +
        (purged > 0 ? ` (${purged} conexão(ões) de outro provedor apagada(s))` : ''),
    );
    const settings = await this.get();
    // Meu Pluggy sem credenciais ou sem bancos ainda não tem o que buscar: sincronizar
    // agora só deixaria uma execução FAILED no histórico.
    if (mode === 'fake' || (settings.credentials.configured && settings.items.list.length > 0)) {
      await this.syncInBackground();
    }
    return settings;
  }

  /** Confere as credenciais na Pluggy e guarda (o segredo cifrado). */
  async setCredentials(
    credentials: PluggyCredentials,
    user: AuthUser,
  ): Promise<OpenFinanceSettings> {
    if (this.credentialsFromEnv()) throw new ConflictException(MESSAGES.credentialsFromEnv);

    await this.verifyCredentials(
      this.registry.createPluggyClient(credentials, { validation: true }),
    );
    await this.store.saveCredentials(credentials);
    this.logger.log(
      `Credenciais do Open Finance atualizadas por ${who(user)} (Client ID ${clientIdHint(credentials.clientId)})`,
    );

    const config = await this.store.load();
    if (config.mode.value === 'pluggy' && config.items.ids.length > 0) {
      await this.syncInBackground();
    }
    return this.get();
  }

  async deleteCredentials(user: AuthUser): Promise<OpenFinanceSettings> {
    if (this.credentialsFromEnv()) throw new ConflictException(MESSAGES.credentialsFromEnv);
    if (await this.store.deleteCredentials()) {
      this.logger.log(`Credenciais do Open Finance removidas por ${who(user)}`);
    }
    return this.get();
  }

  /** Confere o item na Pluggy com as credenciais atuais, guarda e sincroniza. */
  async addItem(itemId: string, user: AuthUser): Promise<OpenFinanceSettings> {
    const config = await this.store.load();
    if (config.items.source === 'env') throw new ConflictException(MESSAGES.itemsFromEnv);
    if (!config.credentials) throw new ConflictException(MESSAGES.noCredentials);
    if (config.items.ids.includes(itemId)) throw new ConflictException(MESSAGES.duplicateItem);
    if (config.items.ids.length >= MAX_ITEMS) throw new BadRequestException(MESSAGES.tooManyItems);

    const item = await this.fetchItem(config.credentials, itemId);
    await this.store.updateItemIds(async (ids, tx) => {
      // Conferido de novo dentro da transação: duas requisições ao mesmo tempo.
      if (ids.includes(itemId)) throw new ConflictException(MESSAGES.duplicateItem);
      if (ids.length >= MAX_ITEMS) throw new BadRequestException(MESSAGES.tooManyItems);
      await this.store.saveSnapshots([item], tx);
      return [...ids, itemId];
    });
    this.logger.log(
      `Banco ${itemId} (${item.connector.name}) adicionado ao Open Finance por ${who(user)}`,
    );
    await this.syncInBackground();
    return this.get();
  }

  /** Tira o banco da lista e apaga o que foi sincronizado dele. */
  async removeItem(itemId: string, user: AuthUser): Promise<OpenFinanceSettings> {
    const config = await this.store.load();
    if (config.items.source === 'env') throw new ConflictException(MESSAGES.itemsFromEnv);
    if (!config.items.ids.includes(itemId)) throw new NotFoundException(MESSAGES.itemNotInList);

    await this.exclusive(() =>
      this.db.transaction(async (tx) => {
        await this.store.updateItemIds(async (ids) => {
          if (!ids.includes(itemId)) throw new NotFoundException(MESSAGES.itemNotInList);
          return ids.filter((id) => id !== itemId);
        }, tx);
        await tx
          .delete(connections)
          .where(
            and(eq(connections.provider, PLUGGY_PROVIDER), eq(connections.externalId, itemId)),
          );
        await this.store.removeSnapshot(itemId, tx);
      }),
    );
    this.logger.log(`Banco ${itemId} removido do Open Finance por ${who(user)}`);
    await this.syncInBackground();
    return this.get();
  }

  private credentialsFromEnv(): boolean {
    return Boolean(this.env.PLUGGY_CLIENT_ID && this.env.PLUGGY_CLIENT_SECRET);
  }

  private async verifyCredentials(client: PluggyClient): Promise<void> {
    try {
      await client.verifyCredentials();
    } catch (error) {
      throw this.credentialsError(error);
    }
  }

  private async fetchItem(credentials: PluggyCredentials, itemId: string): Promise<PluggyItem> {
    const client = this.registry.createPluggyClient(credentials, { validation: true });
    await this.verifyCredentials(client);
    try {
      return await client.getItem(itemId);
    } catch (error) {
      if (error instanceof PluggyApiError && (error.status === 400 || error.status === 404)) {
        throw new BadRequestException(MESSAGES.itemNotFound);
      }
      if (error instanceof PluggyApiError && (error.status === 401 || error.status === 403)) {
        throw new BadRequestException(MESSAGES.itemForbidden);
      }
      throw this.unreachable(error);
    }
  }

  private credentialsError(error: unknown): HttpException {
    if (error instanceof PluggyApiError && [400, 401, 403].includes(error.status ?? 0)) {
      return new BadRequestException(MESSAGES.invalidCredentials);
    }
    return this.unreachable(error);
  }

  private unreachable(error: unknown): HttpException {
    // A mensagem do PluggyApiError traz método, rota e status — nunca credenciais.
    this.logger.warn(
      `Pluggy indisponível na validação: ${error instanceof Error ? error.message : String(error)}`,
    );
    return new BadGatewayException(MESSAGES.pluggyUnreachable);
  }

  private async exclusive<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await this.sync.runExclusive(work);
    } catch (error) {
      if (error instanceof SyncInProgressError) throw new ConflictException(MESSAGES.syncBusy);
      throw error;
    }
  }

  /**
   * Sincroniza com a configuração nova. Se já houver uma rodando (com a
   * configuração antiga), roda outra assim que ela terminar.
   */
  private async syncInBackground(): Promise<void> {
    try {
      await this.sync.start('MANUAL');
    } catch (error) {
      if (!(error instanceof SyncInProgressError)) {
        this.logger.warn(`Não foi possível iniciar a sincronização: ${describe(error)}`);
        return;
      }
      if (this.resyncQueued) return;
      this.resyncQueued = true;
      void this.sync.waitForIdle().then(async () => {
        this.resyncQueued = false;
        try {
          await this.sync.start('MANUAL');
        } catch (retryError) {
          this.logger.log(`Sincronização após a mudança ignorada: ${describe(retryError)}`);
        }
      });
    }
  }
}

function who(user: AuthUser): string {
  return user.username ?? user.email ?? user.id;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
