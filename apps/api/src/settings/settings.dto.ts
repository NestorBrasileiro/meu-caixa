import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CLAUDE_MODEL_IDS } from '../claude/claude-models.js';

export class UpdateAnthropicSettingsDto {
  /** Ausente = mantém a que já está salva. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  apiKey?: string;

  @IsIn(CLAUDE_MODEL_IDS, { message: 'modelo não suportado pelo app' })
  model!: string;
}

export class UpdatePluggySettingsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  clientId!: string;

  /** Ausente = mantém o que já está salvo. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  clientSecret?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'informe ao menos um item (banco conectado)' })
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true, message: 'cada item deve ser um id (UUID) da Pluggy' })
  itemIds!: string[];
}
