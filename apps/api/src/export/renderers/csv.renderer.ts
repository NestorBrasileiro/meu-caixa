import { strToU8, zipSync, type Zippable } from 'fflate';
import { SECTIONS } from '../export.catalog.js';
import { formatDate, formatDateTime, formatDecimal, formatMonthNumeric } from '../export-format.js';
import type { ExportReport } from '../export-report.js';
import {
  buildViews,
  type CellType,
  type CellValue,
  CONVENTIONS,
  REPORT_TITLE,
  reportHeader,
  type SectionView,
  type TableBlock,
} from '../export-views.js';

/**
 * CSV: um arquivo por seção num .zip, pensado para abrir direto no Excel em
 * português (UTF-8 com BOM, separador ";", vírgula decimal, datas dd/mm/aaaa),
 * mais um LEIA-ME.txt com as colunas e convenções.
 */

const BOM = '﻿';
const SEPARATOR = ';';
const EOL = '\r\n';

export function renderCsvZip(report: ExportReport): Buffer {
  const views = buildViews(report);
  const mtime = new Date(report.generatedAt);
  const files: Zippable = {};
  for (const view of views) {
    files[csvFileName(view)] = [strToU8(BOM + sectionCsv(view, report)), { mtime }];
  }
  files['LEIA-ME.txt'] = [strToU8(BOM + readme(report, views)), { mtime }];
  return Buffer.from(zipSync(files, { level: 6 }));
}

export const csvFileName = (view: SectionView) =>
  `${String(view.number).padStart(2, '0')}-${view.id}.csv`;

/**
 * Seção com uma tabela só vira um CSV "puro" (cabeçalho + linhas; as
 * observações vão para o LEIA-ME). Seções com campos e tabelas (Resumo,
 * Análise) ficam em blocos separados por linha em branco, cada um com o
 * título na primeira linha.
 */
function sectionCsv(view: SectionView, report: ExportReport): string {
  const tz = report.timezone;
  const structured = view.blocks.filter((block) => block.kind !== 'list');

  if (isSingleTable(view)) {
    return tableLines(structured[0] as TableBlock, tz).join(EOL) + EOL;
  }
  if (structured.length === 0) {
    // Só observações (ex.: nenhum empréstimo informado).
    const notes = view.blocks.flatMap((block) => (block.kind === 'list' ? block.items : []));
    return [line(['Observação']), ...notes.map((note) => line([note]))].join(EOL) + EOL;
  }

  const chunks: string[][] = [];
  for (const block of view.blocks) {
    const lines: string[] = [];
    if (block.title) lines.push(line([block.title]));
    if (block.kind === 'fields') {
      lines.push(line(['Campo', 'Valor']));
      for (const field of block.fields) {
        lines.push(line([field.label, csvValue(field.value, field.type, tz)]));
      }
    } else if (block.kind === 'paragraph') {
      lines.push(line([block.text]));
    } else if (block.kind === 'table') {
      lines.push(...tableLines(block, tz));
    } else {
      lines.push(...block.items.map((item) => line([item])));
    }
    chunks.push(lines);
  }
  return chunks.map((lines) => lines.join(EOL)).join(EOL + EOL) + EOL;
}

const isSingleTable = (view: SectionView) => {
  const structured = view.blocks.filter((block) => block.kind !== 'list');
  return structured.length === 1 && structured[0]!.kind === 'table';
};

function tableLines(block: TableBlock, tz: string): string[] {
  return [
    line(block.columns.map(csvHeader)),
    ...block.rows.map((row) =>
      line(row.map((value, i) => csvValue(value, block.columns[i]!.type, tz))),
    ),
  ];
}

const csvHeader = (column: { header: string; type: CellType }) =>
  column.type === 'money' ? `${column.header} (R$)` : column.header;

/** Valor no formato que o Excel pt-BR reconhece (número com vírgula, data dd/mm/aaaa). */
export function csvValue(value: CellValue, type: CellType, timeZone: string): string {
  if (value === null || value === '') return '';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'number') {
    if (type === 'money') return formatDecimal(value);
    if (type === 'pct') return `${(Math.round(value * 1000) / 10).toFixed(1).replace('.', ',')}%`;
    return String(value);
  }
  switch (type) {
    case 'date':
      return formatDate(value);
    case 'month':
      return formatMonthNumeric(value);
    case 'datetime':
      return formatDateTime(value, timeZone);
    default:
      return protectFormula(value);
  }
}

/** Texto que começaria com fórmula no Excel ganha um apóstrofo (CSV injection). */
function protectFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function line(values: string[]): string {
  return values.map(quote).join(SEPARATOR);
}

function quote(value: string): string {
  return /[";\r\n]|^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function readme(report: ExportReport, views: SectionView[]): string {
  const header = reportHeader(report);
  const lines: string[] = [
    `${REPORT_TITLE} (CSV)`,
    '',
    `Período: ${header.period}`,
    `Gerado em: ${header.generatedAt}`,
    `Última sincronização: ${header.lastSync}`,
    '',
    'COMO ABRIR',
    '- Excel em português: dê dois cliques no .csv (UTF-8 com BOM, separador ";" e vírgula decimal: as colunas e os números já entram certos).',
    '- Google Planilhas: Arquivo > Importar > Fazer upload; separador "Ponto e vírgula".',
    "- Python (pandas): pd.read_csv('14-transacoes.csv', sep=';', decimal=',', encoding='utf-8-sig', dayfirst=True)",
    '',
    'FORMATO',
    '- Separador ponto e vírgula (;), vírgula decimal, sem separador de milhar.',
    '- Valores em reais sem "R$": as colunas de dinheiro têm "(R$)" no nome. Negativos = saídas.',
    '- Datas dd/mm/aaaa; meses mm/aaaa; data e hora dd/mm/aaaa hh:mm (fuso America/Sao_Paulo).',
    '- Porcentagens com uma casa e "%", ex.: 45,3%. Marcações em "Sim"/"Não".',
    '- Textos que começariam com =, +, - ou @ ganham um apóstrofo na frente, para o Excel não tratar como fórmula.',
    '- Resumo e Análise têm mais de um bloco (campos e tabelas), separados por uma linha em branco; as outras seções são uma tabela só.',
    '',
    'CONVENÇÕES',
    ...CONVENTIONS.map((text) => `- ${text}`),
    '',
    'ARQUIVOS',
  ];
  for (const view of views) {
    lines.push(`${csvFileName(view)} — ${view.title}: ${SECTIONS[view.id].description}`);
    const table = view.blocks.find((block) => block.kind === 'table');
    if (table && isSingleTable(view)) {
      lines.push(`  Colunas: ${table.columns.map(csvHeader).join('; ')}`);
    }
  }
  const notes = views.flatMap((view) =>
    view.blocks.flatMap((block) =>
      block.kind === 'list' && isSingleTable(view)
        ? block.items.map((item) => `- ${view.title}: ${item}`)
        : [],
    ),
  );
  if (notes.length > 0) lines.push('', 'OBSERVAÇÕES DESTA EXPORTAÇÃO', ...notes);
  return lines.join(EOL) + EOL;
}
