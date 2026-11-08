import { Injectable } from '@nestjs/common';
import { type ExportFormat, FORMATS } from './export.catalog.js';
import type { ExportRequest } from './export.query.js';
import { ExportDataService } from './export-data.service.js';
import type { ExportReport } from './export-report.js';
import { exportFileName } from './export-views.js';
import { renderCsvZip } from './renderers/csv.renderer.js';
import { renderMarkdown } from './renderers/markdown.renderer.js';
import { renderPdf } from './renderers/pdf.renderer.js';
import { renderXlsx } from './renderers/xlsx.renderer.js';

export interface ExportFile {
  fileName: string;
  contentType: string;
  body: Buffer;
}

/** Renderizador puro por formato: o mesmo relatório alimenta todos. */
export const RENDERERS: Record<ExportFormat, (report: ExportReport) => Buffer | Promise<Buffer>> = {
  xlsx: renderXlsx,
  pdf: renderPdf,
  csv: renderCsvZip,
  md: renderMarkdown,
};

@Injectable()
export class ExportService {
  constructor(private readonly data: ExportDataService) {}

  today() {
    return this.data.today();
  }

  async export(userId: string, request: ExportRequest): Promise<ExportFile> {
    const report = await this.data.build(userId, request);
    const format = FORMATS[request.format];
    return {
      fileName: exportFileName(report.period, format.extension),
      contentType: format.contentType,
      body: await RENDERERS[request.format](report),
    };
  }
}
