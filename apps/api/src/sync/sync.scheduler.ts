import {
  type BeforeApplicationShutdown,
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import type { SyncTrigger } from '../database/schema.js';
import { ProviderNotConfiguredError } from '../integrations/finance-provider.js';
import { SyncInProgressError, SyncService } from './sync.service.js';

/**
 * Roda a sincronização de cada usuário a cada `SYNC_INTERVAL_HOURS`. Na
 * subida, sincroniza logo quem está com a última execução bem-sucedida mais
 * velha que o intervalo. Um usuário de cada vez: a falha de um não atrapalha
 * os outros.
 */
@Injectable()
export class SyncScheduler implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(SyncScheduler.name);
  private timer: NodeJS.Timeout | undefined;
  private round: Promise<void> | null = null;

  constructor(
    private readonly sync: SyncService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.env.SYNC_ENABLED) {
      this.logger.log('Sincronização automática desligada (SYNC_ENABLED=false)');
      return;
    }
    const intervalMs = this.env.SYNC_INTERVAL_HOURS * 60 * 60 * 1000;
    this.timer = setInterval(() => this.startRound('SCHEDULED', intervalMs), intervalMs);
    this.timer.unref();
    this.startRound('STARTUP', intervalMs);
  }

  async beforeApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.round;
    await this.sync.waitForIdle();
  }

  /** Uma rodada por vez: se a anterior ainda não acabou, esta é pulada. */
  private startRound(trigger: SyncTrigger, intervalMs: number): void {
    if (this.round) {
      this.logger.log(`Sincronização ${trigger} ignorada: a rodada anterior ainda não terminou`);
      return;
    }
    this.round = this.syncDueUsers(trigger, intervalMs).finally(() => {
      this.round = null;
    });
  }

  private async syncDueUsers(trigger: SyncTrigger, intervalMs: number): Promise<void> {
    let userIds: string[];
    try {
      userIds = await this.sync.scheduledUserIds();
    } catch (error) {
      this.logger.error('Não foi possível listar os usuários para sincronizar', error);
      return;
    }
    if (userIds.length === 0) {
      this.logger.log(`Sincronização ${trigger} ignorada: nenhum usuário com a Pluggy configurada`);
      return;
    }
    for (const userId of userIds) {
      try {
        const last = await this.sync.lastFinishedRun(userId);
        // Margem de 1 min: a rodada agendada não perde o usuário por milissegundos.
        if (last && Date.now() - last.startedAt.getTime() < intervalMs - 60_000) continue;
        await this.sync.run(userId, trigger);
      } catch (error) {
        if (error instanceof SyncInProgressError) {
          this.logger.log(`Sincronização ${trigger} de ${userId} ignorada: outra em andamento`);
        } else if (error instanceof ProviderNotConfiguredError) {
          this.logger.log(`Sincronização ${trigger} de ${userId} ignorada: ${error.message}`);
        } else {
          this.logger.error(`Sincronização ${trigger} de ${userId} falhou`, error);
        }
      }
    }
  }
}
