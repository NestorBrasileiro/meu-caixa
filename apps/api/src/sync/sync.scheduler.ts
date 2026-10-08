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
import { SyncInProgressError, SyncService } from './sync.service.js';

/**
 * Roda a sincronização a cada `SYNC_INTERVAL_HOURS`. Na subida, sincroniza
 * logo se a última execução bem-sucedida já passou do intervalo.
 */
@Injectable()
export class SyncScheduler implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(SyncScheduler.name);
  private timer: NodeJS.Timeout | undefined;

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
    this.timer = setInterval(() => void this.trigger('SCHEDULED'), intervalMs);
    this.timer.unref();

    try {
      const last = await this.sync.lastFinishedRun();
      if (!last || Date.now() - last.startedAt.getTime() >= intervalMs) {
        void this.trigger('STARTUP');
      }
    } catch (error) {
      this.logger.error('Não foi possível consultar a última sincronização', error);
    }
  }

  async beforeApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.sync.waitForIdle();
  }

  private async trigger(trigger: SyncTrigger): Promise<void> {
    try {
      await this.sync.run(trigger);
    } catch (error) {
      if (error instanceof SyncInProgressError) {
        this.logger.log(`Sincronização ${trigger} ignorada: outra já está em andamento`);
      } else {
        this.logger.error(`Sincronização ${trigger} falhou`, error);
      }
    }
  }
}
