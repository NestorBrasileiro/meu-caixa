import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PAYMENT_METHODS, type PaymentMethod } from '../domain/finance.js';
import { BUDGET_CATEGORY_KINDS } from '../database/schema.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_MESSAGE = '$property deve estar no formato YYYY-MM-DD';
/** Teto de sanidade para valores em centavos (R$ 100 milhões). */
const MAX_CENTS = 10_000_000_000;

type BudgetCategoryKind = (typeof BUDGET_CATEGORY_KINDS)[number];

// Convenção dos DTOs de atualização: campo ausente = não muda; `null` limpa
// os campos opcionais (por isso `ValidateIf(value !== null)`).

export class CreateCommitmentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  /** Centavos. */
  @IsInt()
  @Min(1)
  @Max(MAX_CENTS)
  amount!: number;

  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth!: number;

  @IsIn(PAYMENT_METHODS)
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  @IsISO8601({ strict: true })
  startsOn!: string;

  @IsOptional()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  @IsISO8601({ strict: true })
  endsOn?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  installmentsTotal?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string | null;
}

export class UpdateCommitmentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_CENTS)
  amount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number;

  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  paymentMethod?: PaymentMethod;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  @IsISO8601({ strict: true })
  startsOn?: string;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  @IsISO8601({ strict: true })
  endsOn?: string | null;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt()
  @Min(1)
  @Max(600)
  installmentsTotal?: number | null;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(200)
  notes?: string | null;
}

export class CreateGoalDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_CENTS)
  target!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_CENTS)
  saved?: number;

  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  @IsISO8601({ strict: true })
  targetDate!: string;

  @IsInt()
  @Min(0)
  @Max(MAX_CENTS)
  monthlyContribution!: number;

  @IsOptional()
  @IsUUID()
  accountId?: string | null;
}

export class UpdateGoalDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_CENTS)
  target?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_CENTS)
  saved?: number;

  @IsOptional()
  @Matches(ISO_DATE, { message: ISO_DATE_MESSAGE })
  @IsISO8601({ strict: true })
  targetDate?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_CENTS)
  monthlyContribution?: number;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsUUID()
  accountId?: string | null;
}

export class CreateBudgetCategoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @IsIn(BUDGET_CATEGORY_KINDS)
  kind!: BudgetCategoryKind;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  sourceCategories?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_CENTS)
  monthlyBudget?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;
}

export class UpdateBudgetCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsIn(BUDGET_CATEGORY_KINDS)
  kind?: BudgetCategoryKind;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  sourceCategories?: string[];

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt()
  @Min(0)
  @Max(MAX_CENTS)
  monthlyBudget?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
