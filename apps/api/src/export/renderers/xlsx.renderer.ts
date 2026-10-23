import ExcelJS from 'exceljs';
import type { Cell, Row, Worksheet } from 'exceljs';
import { localParts } from '../export-format.js';
import type { ExportReport } from '../export-report.js';
import {
  buildViews,
  type CellType,
  type CellValue,
  columnTotal,
  formatCell,
  hasTotals,
  REPORT_TITLE,
  reportHeader,
  type SectionView,
  type TableBlock,
  type ViewBlock,
} from '../export-views.js';

/**
 * Excel: uma aba por seção, com valores de verdade (números em R$, datas,
 * porcentagens), cabeçalho fixo com filtro e linha de total com fórmula.
 */

export const MONEY_FORMAT = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
const NUMBER_FORMATS: Partial<Record<CellType, string>> = {
  money: MONEY_FORMAT,
  date: 'dd/mm/yyyy',
  datetime: 'dd/mm/yyyy hh:mm',
  month: 'mm/yyyy',
  pct: '0.0%',
  int: '#,##0',
};

const HEADER_FILL = 'FF1F4E5F';
const TOTAL_FILL = 'FFE8EEF0';
const MUTED = 'FF5F6B70';
const WARNING = 'FF9A5B00';
const MIN_WIDTH = 8;
const MAX_WIDTH = 48;
const WIDE_WIDTH = 60;

export async function renderXlsx(report: ExportReport): Promise<Buffer> {
  const header = reportHeader(report);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Meu Caixa';
  workbook.lastModifiedBy = 'Meu Caixa';
  workbook.title = REPORT_TITLE;
  workbook.subject = `Período ${header.period}`;
  workbook.description = `Exportação do Meu Caixa gerada em ${header.generatedAt}.`;
  workbook.keywords = 'finanças pessoais, meu caixa, exportação';
  workbook.category = 'Finanças';
  workbook.created = new Date(report.generatedAt);
  workbook.modified = new Date(report.generatedAt);
  // O Excel recalcula as fórmulas (totais) ao abrir.
  workbook.calcProperties.fullCalcOnLoad = true;

  const views = buildViews(report);
  if (views[0]?.id !== 'resumo') addCoverSheet(workbook, report);
  for (const view of views) addSectionSheet(workbook, view, report);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Sem a seção Resumo, a primeira aba ainda diz o que é o arquivo. */
function addCoverSheet(workbook: ExcelJS.Workbook, report: ExportReport) {
  const header = reportHeader(report);
  const sheet = workbook.addWorksheet('Sobre');
  sheet.getColumn(1).width = 24;
  sheet.getColumn(2).width = 60;
  titleRow(sheet, REPORT_TITLE);
  for (const [label, value] of [
    ['Período', header.period],
    ['Gerado em', header.generatedAt],
    ['Última sincronização', header.lastSync],
  ]) {
    const row = sheet.addRow([label, value]);
    row.getCell(1).font = { bold: true };
  }
}

function addSectionSheet(workbook: ExcelJS.Workbook, view: SectionView, report: ExportReport) {
  const header = reportHeader(report);
  const sheet = workbook.addWorksheet(sheetName(view.title), {
    pageSetup: {
      paperSize: 9,
      orientation: maxColumns(view) > 8 ? 'landscape' : 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  titleRow(sheet, view.id === 'resumo' ? REPORT_TITLE : view.title);
  mutedRow(sheet, view.description);
  mutedRow(sheet, `Período: ${header.period} · Gerado em ${header.generatedAt}`);
  sheet.addRow([]);

  const widths = new Map<number, number>();
  const wideColumns = new Set<number>();
  let mainTable: { headerRow: number; lastRow: number; columns: number } | null = null;

  view.blocks.forEach((block, index) => {
    if (index > 0) sheet.addRow([]);
    const placed = addBlock(sheet, block, report, widths, wideColumns);
    if (placed && !mainTable) mainTable = placed;
  });

  // Larguras pelo conteúdo, dentro de limites (textos longos quebram linha).
  for (const [column, width] of widths) {
    const max = wideColumns.has(column) ? WIDE_WIDTH : MAX_WIDTH;
    sheet.getColumn(column).width = Math.min(max, Math.max(MIN_WIDTH, width + 2));
  }

  // Seção que começa por uma tabela: cabeçalho fixo ao rolar, filtro e
  // cabeçalho repetido na impressão.
  const table = mainTable as { headerRow: number; lastRow: number; columns: number } | null;
  if (table && view.blocks[0]?.kind === 'table') {
    sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: table.headerRow }];
    sheet.autoFilter = {
      from: { row: table.headerRow, column: 1 },
      to: { row: table.lastRow, column: table.columns },
    };
    sheet.pageSetup.printTitlesRow = `${table.headerRow}:${table.headerRow}`;
  }
}

/** Escreve o bloco; para tabelas com linhas, devolve onde ficou o cabeçalho. */
function addBlock(
  sheet: Worksheet,
  block: ViewBlock,
  report: ExportReport,
  widths: Map<number, number>,
  wideColumns: Set<number>,
): { headerRow: number; lastRow: number; columns: number } | null {
  const measure = (column: number, text: string) =>
    widths.set(column, Math.max(widths.get(column) ?? 0, text.length));

  if (block.title) {
    const row = sheet.addRow([block.title]);
    row.getCell(1).font = { bold: true, size: 12 };
  }

  switch (block.kind) {
    case 'fields': {
      for (const field of block.fields) {
        const row = sheet.addRow([field.label]);
        row.getCell(1).font = { bold: true };
        setValue(row.getCell(2), field.value, field.type, report.timezone);
        measure(1, field.label);
        measure(2, formatCell(field.value, field.type, report.timezone));
      }
      return null;
    }
    case 'list': {
      for (const item of block.items) {
        const row = sheet.addRow([`• ${item}`]);
        row.getCell(1).font = {
          italic: block.tone === 'info',
          color: { argb: block.tone === 'warning' ? WARNING : MUTED },
        };
      }
      return null;
    }
    case 'paragraph': {
      const row = sheet.addRow([block.text]);
      sheet.mergeCells(row.number, 1, row.number, 8);
      row.getCell(1).alignment = { wrapText: true, vertical: 'top' };
      row.height = Math.min(400, 15 * Math.ceil(block.text.length / 110 + 1));
      return null;
    }
    case 'table':
      return addTable(sheet, block, report, measure, wideColumns);
  }
}

function addTable(
  sheet: Worksheet,
  block: TableBlock,
  report: ExportReport,
  measure: (column: number, text: string) => void,
  wideColumns: Set<number>,
) {
  const headerRow = sheet.addRow(block.columns.map((column) => column.header));
  headerRow.height = 30;
  headerRow.eachCell((cell, column) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = {
      vertical: 'middle',
      wrapText: true,
      horizontal: isNumeric(block.columns[column - 1]!.type) ? 'right' : 'left',
    };
    // O cabeçalho quebra em até 2 linhas: basta caber a palavra mais longa.
    const words = cell.text.split(/\s+/);
    measure(
      column,
      'x'.repeat(Math.max(...words.map((w) => w.length), Math.ceil(cell.text.length / 2))),
    );
  });
  block.columns.forEach((column, i) => {
    if (column.wide) wideColumns.add(i + 1);
  });

  if (block.rows.length === 0) {
    const row = sheet.addRow([block.empty]);
    row.getCell(1).font = { italic: true, color: { argb: MUTED } };
    return null;
  }

  const firstData = headerRow.number + 1;
  for (const values of block.rows) {
    const row = sheet.addRow([]);
    values.forEach((value, i) => {
      const column = block.columns[i]!;
      const cell = row.getCell(i + 1);
      setValue(cell, value, column.type, report.timezone);
      measure(i + 1, formatCell(value, column.type, report.timezone));
      if (typeof value === 'string' && value.length > (column.wide ? WIDE_WIDTH : MAX_WIDTH)) {
        cell.alignment = { wrapText: true, vertical: 'top' };
      }
    });
  }
  const lastData = firstData + block.rows.length - 1;

  if (hasTotals(block)) addTotalsRow(sheet, block, firstData, lastData);
  return { headerRow: headerRow.number, lastRow: lastData, columns: block.columns.length };
}

function addTotalsRow(sheet: Worksheet, block: TableBlock, firstData: number, lastData: number) {
  const row: Row = sheet.addRow([]);
  const labelColumn = Math.max(
    1,
    block.columns.findIndex((column) => !column.sum && !isNumeric(column.type)) + 1,
  );
  row.getCell(labelColumn).value = block.filteredTotal ? 'Total (linhas visíveis)' : 'Total';
  block.columns.forEach((column, i) => {
    if (!column.sum) return;
    const letter = sheet.getColumn(i + 1).letter;
    const range = `${letter}${firstData}:${letter}${lastData}`;
    const total = columnTotal(block, i);
    row.getCell(i + 1).value = {
      formula: block.filteredTotal ? `SUBTOTAL(109,${range})` : `SUM(${range})`,
      result: column.type === 'money' ? total / 100 : total,
    };
    row.getCell(i + 1).numFmt = NUMBER_FORMATS[column.type] ?? 'General';
  });
  for (let column = 1; column <= block.columns.length; column++) {
    const cell = row.getCell(column);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FILL } };
    cell.border = { top: { style: 'thin', color: { argb: MUTED } } };
    cell.font = { bold: true };
  }
}

/** Valor nativo do Excel (número, data) com o formato de exibição. */
function setValue(cell: Cell, value: CellValue, type: CellType, timeZone: string) {
  if (value === null || value === '') return;
  if (typeof value === 'boolean') {
    cell.value = value ? 'Sim' : 'Não';
    return;
  }
  if (typeof value === 'number') {
    cell.value = type === 'money' ? value / 100 : value;
  } else if (type === 'date' || type === 'month') {
    const [year, month, day] = value.split('-').map(Number);
    // Meia-noite UTC: o Excel guarda a data sem fuso.
    cell.value = new Date(Date.UTC(year!, month! - 1, day ?? 1));
  } else if (type === 'datetime') {
    const p = localParts(value, timeZone);
    cell.value = new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second));
  } else {
    cell.value = value;
    return;
  }
  const format = NUMBER_FORMATS[type];
  if (format) cell.numFmt = format;
}

function titleRow(sheet: Worksheet, text: string) {
  const row = sheet.addRow([text]);
  row.getCell(1).font = { bold: true, size: 16, color: { argb: HEADER_FILL } };
  row.height = 24;
}

function mutedRow(sheet: Worksheet, text: string) {
  const row = sheet.addRow([text]);
  row.getCell(1).font = { italic: true, color: { argb: MUTED } };
}

const maxColumns = (view: SectionView) =>
  Math.max(0, ...view.blocks.map((block) => (block.kind === 'table' ? block.columns.length : 0)));

const isNumeric = (type: CellType) => type !== 'text' && type !== 'bool';

/** Nome de aba válido no Excel: até 31 caracteres, sem `: \ / ? * [ ]`. */
export function sheetName(title: string): string {
  return title.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31);
}
