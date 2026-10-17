import { Controller, Get, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
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
  latest() {
    return this.analysis.latestOrFail();
  }

  @Get()
  list(@Query() query: ListAnalysesQuery) {
    return this.analysis.list(query.limit);
  }
}
