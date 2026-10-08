import {
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import type { SyncRunRow } from '../database/schema.js';
import { SyncInProgressError, SyncService } from './sync.service.js';

export class ListSyncRunsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  /** Dispara uma sincronização sob demanda; acompanhe em `GET /sync/runs`. */
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async start(): Promise<SyncRunRow> {
    try {
      const { run } = await this.sync.start('MANUAL');
      return run;
    } catch (error) {
      if (error instanceof SyncInProgressError) throw new ConflictException(error.message);
      throw error;
    }
  }

  @Get('runs')
  listRuns(@Query() query: ListSyncRunsQuery): Promise<SyncRunRow[]> {
    return this.sync.listRuns(query.limit);
  }
}
