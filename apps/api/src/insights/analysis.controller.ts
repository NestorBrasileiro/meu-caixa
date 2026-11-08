import { Controller, Get, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { AnalysisService } from './analysis.service.js';

export class ListAnalysesQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 10;
}

/** Análises do Claude, da mais recente para a mais antiga. */
@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysis: AnalysisService) {}

  /** A análise mais recente; 404 se ainda não houver nenhuma. */
  @Get('latest')
  latest(@CurrentUser() userId: string) {
    return this.analysis.latestOrFail(userId);
  }

  @Get()
  list(@CurrentUser() userId: string, @Query() query: ListAnalysesQuery) {
    return this.analysis.list(userId, query.limit);
  }
}
