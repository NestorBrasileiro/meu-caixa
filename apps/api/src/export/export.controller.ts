import { BadRequestException, Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import {
  EXPORT_FORMATS,
  FORMATS,
  MAX_EXPORT_MONTHS,
  SECTION_IDS,
  SECTIONS,
} from './export.catalog.js';
import { defaultPeriod, ExportQueryError, parseExportQuery } from './export.query.js';
import { ExportService } from './export.service.js';

@Controller('export')
export class ExportController {
  constructor(private readonly exports: ExportService) {}

  /** Formatos, seções e período padrão para a tela de exportação. */
  @Get('options')
  options() {
    return {
      formats: EXPORT_FORMATS.map((id) => {
        const { contentType: _type, ...format } = FORMATS[id];
        return format;
      }),
      sections: SECTION_IDS.map((id) => SECTIONS[id]),
      defaultPeriod: defaultPeriod(this.exports.today()),
      maxMonths: MAX_EXPORT_MONTHS,
    };
  }

  /**
   * Baixa a exportação: `format` (xlsx, pdf, csv ou md), `from`/`to`
   * (YYYY-MM-DD) e `sections` (ids separados por vírgula; padrão: todas).
   */
  @Get()
  async download(
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    let request;
    try {
      request = parseExportQuery(query, this.exports.today());
    } catch (error) {
      if (error instanceof ExportQueryError) throw new BadRequestException(error.message);
      throw error;
    }
    const file = await this.exports.export(request);
    res.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(file.body, {
      type: file.contentType,
      disposition: `attachment; filename="${file.fileName}"`,
      length: file.body.length,
    });
  }
}
