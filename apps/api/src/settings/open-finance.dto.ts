import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { OPEN_FINANCE_MODES } from '../integrations/open-finance/open-finance-config.js';

/**
 * Corpos das rotas de Configurações → Open Finance. Validados com zod (e não
 * class-validator) para o 400 trazer uma mensagem só, em português, no
 * formato `{ message }` do contrato com a interface.
 */

/** Sem espaços no meio (o que vem colado do dashboard é aparado nas pontas). */
const token = (max: number, message: string) =>
  z.string(message).trim().min(1, message).max(max, message).regex(/^\S+$/, message);

const INVALID_BODY = 'Corpo da requisição inválido';

export const setModeBody = z.object(
  { mode: z.enum(OPEN_FINANCE_MODES, 'O modo deve ser "pluggy" ou "fake"') },
  INVALID_BODY,
);

const INVALID_CREDENTIALS_FORMAT =
  'Client ID ou Client Secret em formato inválido: copie os dois do dashboard da Pluggy, sem espaços';

export const setCredentialsBody = z.object(
  {
    clientId: token(200, INVALID_CREDENTIALS_FORMAT),
    clientSecret: token(500, INVALID_CREDENTIALS_FORMAT),
  },
  INVALID_BODY,
);

export const INVALID_ITEM_ID =
  'Id do item inválido: use o id do banco conectado que aparece no Meu Pluggy (ex.: 3f6c1a52-...)';
/** Ids da Pluggy são UUIDs; aceita qualquer id simples para não depender disso. */
export const ITEM_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;

export const addItemBody = z.object(
  { itemId: z.string(INVALID_ITEM_ID).trim().regex(ITEM_ID_PATTERN, INVALID_ITEM_ID) },
  INVALID_BODY,
);

export type SetModeBody = z.output<typeof setModeBody>;
export type SetCredentialsBody = z.output<typeof setCredentialsBody>;
export type AddItemBody = z.output<typeof addItemBody>;

export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.issues[0]?.message ?? INVALID_BODY);
  }
  return parsed.data;
}
