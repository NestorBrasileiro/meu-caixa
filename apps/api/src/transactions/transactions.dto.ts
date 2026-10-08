import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TRANSACTION_STATUSES, type TransactionStatus } from '../domain/finance.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_MESSAGE = '$property deve estar no formato YYYY-MM-DD';

export class ListTransactionsQuery {
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @IsOptional()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  @IsISO8601({ strict: true })
  to?: string;

  @IsOptional()
  @IsIn(TRANSACTION_STATUSES)
  status?: TransactionStatus;

  /** Busca na descrição e na contraparte. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}

export class ListInvoicesQuery {
  @IsOptional()
  @IsUUID()
  accountId?: string;
}
