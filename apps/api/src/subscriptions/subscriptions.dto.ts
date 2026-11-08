import { Transform } from 'class-transformer';
import { IsIn, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import {
  SUBSCRIPTION_PREFERENCE_KINDS,
  type SubscriptionPreferenceKind,
} from '../database/schema.js';

/**
 * Ajuste de uma cobrança recorrente. Campo ausente = não muda; `null` = volta
 * ao automático (sem marcação ou com o nome do extrato).
 */
export class UpdateSubscriptionPreferenceDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  key!: string;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsIn(SUBSCRIPTION_PREFERENCE_KINDS)
  kind?: SubscriptionPreferenceKind | null;

  /** Nome em branco é o mesmo que limpar. */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(80)
  name?: string | null;
}
