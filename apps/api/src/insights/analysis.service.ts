import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.module.js';
import {
  analysisReports,
  type AnalysisReportRow,
  type AnalysisSource,
} from '../database/schema.js';
import {
  type AnalysisReport,
  type AnalysisReportInput,
  analysisReportInputSchema,
  analysisReportSchema,
} from './analysis.schema.js';

/** Relatório como a API devolve: o `AnalysisReport` da interface mais id, origem e modelo. */
export type StoredAnalysis = AnalysisReport & {
  id: string;
  source: AnalysisSource;
  model: string | null;
};

/** Guarda e lê as análises do Claude (feitas via MCP ou, depois, pela interface). */
@Injectable()
export class AnalysisService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Valida o relatório, completa ids e data e guarda. */
  async save(input: unknown, source: AnalysisSource): Promise<StoredAnalysis> {
    const { model, ...fields } = analysisReportInputSchema.parse(input) as AnalysisReportInput;
    const generatedAt = new Date();
    const report = analysisReportSchema.parse({
      ...fields,
      generatedAt: generatedAt.toISOString(),
      insights: fields.insights.map((insight) => ({ id: randomUUID(), ...insight })),
    });
    const [row] = await this.db
      .insert(analysisReports)
      .values({
        generatedAt,
        source,
        model: model ?? null,
        periodFrom: report.period.from,
        periodTo: report.period.to,
        report,
      })
      .returning();
    return toStoredAnalysis(row!);
  }

  async latest(): Promise<StoredAnalysis | null> {
    const [row] = await this.list(1);
    return row ?? null;
  }

  async latestOrFail(): Promise<StoredAnalysis> {
    const latest = await this.latest();
    if (!latest) throw new NotFoundException('Nenhuma análise salva ainda');
    return latest;
  }

  async list(limit: number): Promise<StoredAnalysis[]> {
    const rows = await this.db
      .select()
      .from(analysisReports)
      .orderBy(desc(analysisReports.generatedAt), desc(analysisReports.id))
      .limit(limit);
    return rows.map(toStoredAnalysis);
  }
}

function toStoredAnalysis(row: AnalysisReportRow): StoredAnalysis {
  // Valida também na leitura: um relatório fora do formato falha alto.
  const report = analysisReportSchema.parse(row.report);
  return { id: row.id, source: row.source, model: row.model, ...report };
}
