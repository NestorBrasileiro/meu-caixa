import { z } from 'zod';
import { isIsoDate } from '../domain/dates.js';

/**
 * Formato do relatório de análise do Claude — o mesmo `AnalysisReport` da
 * interface (apps/web/src/lib/api/analysis.ts). Valores em centavos.
 */

export const INSIGHT_KINDS = ['CUT', 'SIN', 'LEAK', 'SUGGESTION'] as const;
export const CONFIDENCES = ['HIGH', 'MEDIUM', 'LOW'] as const;

export const isoDateSchema = z
  .string()
  .refine(isIsoDate, { message: 'Data inválida: use YYYY-MM-DD (ex.: 2026-09-30)' });

const centsSchema = z.number().int('Valor em centavos deve ser inteiro');
const positiveCents = centsSchema.min(0, 'Use valores positivos em centavos');

export const periodSchema = z
  .object({
    from: isoDateSchema.describe('Primeiro dia (YYYY-MM-DD)'),
    to: isoDateSchema.describe('Último dia (YYYY-MM-DD)'),
  })
  .refine((period) => period.from <= period.to, {
    message: 'period.from deve ser anterior ou igual a period.to',
  });

const insightFields = {
  kind: z
    .enum(INSIGHT_KINDS)
    .describe(
      'CUT = dá para cortar sem perder qualidade de vida; SIN = "gasto do pecado", supérfluo recorrente; ' +
        'LEAK = vazamento (assinatura esquecida, tarifa, juros, cobrança duplicada); SUGGESTION = sugestão de planejamento',
    ),
  title: z.string().trim().min(1).max(120).describe('Título curto, em português'),
  explanation: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .describe('Explicação em linguagem natural: o que foi visto, por que importa e o que fazer'),
  monthlySavings: positiveCents
    .nullable()
    .describe(
      'Economia mensal estimada em centavos se a sugestão for seguida; null se não se aplica',
    ),
  evidence: z
    .object({
      label: z.string().trim().min(1).max(200).describe('O que foi somado (ex.: "Delivery")'),
      occurrences: z.number().int().min(0).describe('Quantas transações'),
      total: positiveCents.describe('Total dessas transações no período, em centavos (positivo)'),
      period: periodSchema,
    })
    .nullable()
    .describe('Evidência tirada das transações; null se o insight não vem de transações'),
  confidence: z.enum(CONFIDENCES).describe('Confiança no insight'),
};

const reportFields = {
  period: periodSchema.describe('Período analisado'),
  headline: z.string().trim().min(1).max(200).describe('Resumo de uma frase'),
  summary: z.string().trim().min(1).max(4000).describe('Resumo da análise em poucos parágrafos'),
  monthlyFixed: positiveCents.describe(
    'Média mensal de gasto fixo (compromissos, contas essenciais)',
  ),
  monthlyDiscretionary: positiveCents.describe('Média mensal de gasto discricionário (o resto)'),
  potentialMonthlySavings: positiveCents.describe(
    'Economia mensal potencial somando os insights, em centavos',
  ),
};

/** O que o Claude envia em `salvar_analise`: o servidor completa ids e data. */
export const analysisReportInputSchema = z.object({
  ...reportFields,
  insights: z.array(z.object(insightFields)).min(1).max(30).describe('De 1 a 30 insights'),
  model: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .describe('Modelo que gerou a análise (ex.: o id do modelo Claude), se souber'),
});

/** Relatório guardado (e devolvido pela API). */
export const analysisReportSchema = z.object({
  generatedAt: z.iso.datetime({ offset: true }),
  ...reportFields,
  insights: z.array(z.object({ id: z.string().min(1), ...insightFields })).max(30),
});

export type AnalysisReportInput = z.output<typeof analysisReportInputSchema>;
export type AnalysisReport = z.output<typeof analysisReportSchema>;
