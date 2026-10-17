import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  type AnalysisRunDto,
  AnalysisRunInProgressError,
  AnalysisRunsService,
} from './analysis-runs.service.js';
import { type AskAnswer, AskInProgressError, AskService } from './ask.service.js';
import { ClaudeDisabledError } from './claude-disabled.error.js';
import { ClaudeFailure } from './claude-errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AskHistoryItem {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  content!: string;
}

export class AskDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  question!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AskHistoryItem)
  history?: AskHistoryItem[];
}

export interface AnalysisStatus {
  app: { enabled: boolean; model: string | null };
  latestRun: AnalysisRunDto | null;
}

/**
 * Análise feita pela interface com a API da Anthropic ("Gerar análise" e
 * "Pergunte ao Claude"). Precisa de `ANTHROPIC_API_KEY`; sem ela, 503.
 */
@Controller('analysis')
export class ClaudeController {
  constructor(
    private readonly runs: AnalysisRunsService,
    private readonly asker: AskService,
  ) {}

  @Get('status')
  async status(): Promise<AnalysisStatus> {
    return {
      app: { enabled: this.runs.enabled, model: this.runs.model },
      latestRun: await this.runs.latest(),
    };
  }

  /** Começa a gerar uma análise em background; acompanhe em `GET /analysis/runs/:id`. */
  @Post('runs')
  @HttpCode(HttpStatus.ACCEPTED)
  async start(): Promise<AnalysisRunDto> {
    try {
      const { run } = await this.runs.start();
      return run;
    } catch (error) {
      throw toHttpError(error);
    }
  }

  @Get('runs/:id')
  async run(@Param('id') id: string): Promise<AnalysisRunDto> {
    const run = UUID.test(id) ? await this.runs.get(id) : null;
    if (!run) throw new NotFoundException('Execução de análise não encontrada');
    return run;
  }

  @Post('ask')
  @HttpCode(HttpStatus.OK)
  async ask(@Body() body: AskDto): Promise<AskAnswer> {
    try {
      return await this.asker.ask(body.question, body.history ?? []);
    } catch (error) {
      throw toHttpError(error);
    }
  }
}

function toHttpError(error: unknown): unknown {
  if (error instanceof ClaudeDisabledError) return new ServiceUnavailableException(error.message);
  if (error instanceof AnalysisRunInProgressError) return new ConflictException(error.message);
  if (error instanceof AskInProgressError) {
    return new HttpException(
      { statusCode: HttpStatus.TOO_MANY_REQUESTS, message: error.message },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
  if (error instanceof ClaudeFailure) {
    return new HttpException(
      { statusCode: error.httpStatus, message: error.message, code: error.code },
      error.httpStatus,
    );
  }
  return error;
}
