import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.types.js';
import {
  addItemBody,
  INVALID_ITEM_ID,
  ITEM_ID_PATTERN,
  parseBody,
  setCredentialsBody,
  setModeBody,
} from './open-finance.dto.js';
import { type OpenFinanceSettings, OpenFinanceSettingsService } from './open-finance.service.js';

/**
 * Configurações → Open Finance (`/api/settings/open-finance`). Protegido como
 * o resto da API: sessão, role `owner` (guard global) e checagem de Origin
 * nas mutações (CSRF). Nenhuma rota devolve o Client Secret.
 */
@Controller('settings/open-finance')
export class OpenFinanceSettingsController {
  constructor(private readonly settings: OpenFinanceSettingsService) {}

  @Get()
  get(): Promise<OpenFinanceSettings> {
    return this.settings.get();
  }

  /** `{ mode: "pluggy" | "fake" }`; 409 se `FINANCE_PROVIDER` estiver no ambiente. */
  @Put('mode')
  setMode(@Body() body: unknown, @Req() req: Request): Promise<OpenFinanceSettings> {
    const { mode } = parseBody(setModeBody, body);
    return this.settings.setMode(mode, userOf(req));
  }

  /** `{ clientId, clientSecret }`, conferidos na Pluggy antes de gravar. */
  @Put('credentials')
  setCredentials(@Body() body: unknown, @Req() req: Request): Promise<OpenFinanceSettings> {
    return this.settings.setCredentials(parseBody(setCredentialsBody, body), userOf(req));
  }

  @Delete('credentials')
  deleteCredentials(@Req() req: Request): Promise<OpenFinanceSettings> {
    return this.settings.deleteCredentials(userOf(req));
  }

  /** `{ itemId }` de um banco conectado no Meu Pluggy, conferido na Pluggy. */
  @Post('items')
  @HttpCode(HttpStatus.OK)
  addItem(@Body() body: unknown, @Req() req: Request): Promise<OpenFinanceSettings> {
    const { itemId } = parseBody(addItemBody, body);
    return this.settings.addItem(itemId, userOf(req));
  }

  @Delete('items/:itemId')
  removeItem(@Param('itemId') itemId: string, @Req() req: Request): Promise<OpenFinanceSettings> {
    if (!ITEM_ID_PATTERN.test(itemId)) throw new BadRequestException(INVALID_ITEM_ID);
    return this.settings.removeItem(itemId, userOf(req));
  }
}

function userOf(req: Request): AuthUser {
  // O guard global sempre preenche `req.user` nas rotas protegidas.
  return req.user!;
}
