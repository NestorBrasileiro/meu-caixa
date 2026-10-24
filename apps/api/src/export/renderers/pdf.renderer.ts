import { dirname } from 'node:path';
import { createRequire } from 'node:module';
import pdfmake from 'pdfmake';
import type {
  Content,
  CustomTableLayout,
  TableCell,
  TDocumentDefinitions,
} from 'pdfmake/interfaces.js';
import { formatInt } from '../export-format.js';
import type { ExportReport } from '../export-report.js';
import {
  buildViews,
  type CellType,
  type CellValue,
  columnTotal,
  CONVENTIONS,
  formatCell,
  hasTotals,
  REPORT_TITLE,
  reportHeader,
  type SectionView,
  type TableBlock,
  type ViewBlock,
  type ViewColumn,
} from '../export-views.js';

/**
 * PDF com pdfmake (layout declarativo sobre o pdfkit, sem browser): A4,
 * capa com os números principais, uma seção por vez com tabelas que repetem o
 * cabeçalho na quebra de página, linhas zebradas, dinheiro alinhado à direita
 * e "Página X de Y" no rodapé. Fonte Roboto (embutida no pdfmake), que cobre
 * os acentos do português.
 */

const require = createRequire(import.meta.url);
const FONT_DIR = dirname(require.resolve('pdfmake/build/fonts/Roboto/Roboto-Regular.ttf'));

pdfmake.setFonts({
  Roboto: {
    normal: `${FONT_DIR}/Roboto-Regular.ttf`,
    bold: `${FONT_DIR}/Roboto-Medium.ttf`,
    italics: `${FONT_DIR}/Roboto-Italic.ttf`,
    bolditalics: `${FONT_DIR}/Roboto-MediumItalic.ttf`,
  },
});
// Nada de baixar recursos nem ler arquivos além das fontes.
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((path) => path.startsWith(FONT_DIR));

const COLORS = {
  text: '#1f2a30',
  muted: '#5f6b70',
  accent: '#1f4e5f',
  zebra: '#f3f6f7',
  total: '#e8eef0',
  line: '#d5dde0',
  negative: '#b42318',
  warning: '#9a5b00',
};

/** Área útil (A4 = 595 × 842 pt, menos as margens). */
const MARGIN = 36;
const CONTENT_WIDTH = { portrait: 595 - 2 * MARGIN, landscape: 842 - 2 * MARGIN };
const CELL_PADDING = 8;
/** Acima disso a tabela leva só as linhas mais recentes (tempo e memória do pdfmake). */
export const PDF_MAX_ROWS = 5_000;
const BOTTOM_MARGIN = 40;

const TABLE_LAYOUT: CustomTableLayout = {
  hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : 0.5),
  vLineWidth: () => 0,
  hLineColor: () => COLORS.line,
  paddingLeft: () => CELL_PADDING / 2,
  paddingRight: () => CELL_PADDING / 2,
  paddingTop: () => 2.5,
  paddingBottom: () => 2.5,
  fillColor: (row) => (row === 0 ? COLORS.accent : row % 2 === 0 ? COLORS.zebra : null),
};

const FIELDS_LAYOUT: CustomTableLayout = {
  ...TABLE_LAYOUT,
  fillColor: (row) => (row % 2 === 1 ? COLORS.zebra : null),
};

export async function renderPdf(report: ExportReport): Promise<Buffer> {
  const header = reportHeader(report);
  const views = buildViews(report);
  const content: Content[] = [...cover(report, views)];

  let orientation: 'portrait' | 'landscape' = 'portrait';
  views.forEach((view, index) => {
    const wanted = needsLandscape(view, report.timezone) ? 'landscape' : 'portrait';
    const heading: Content = {
      text: `${index + 1}. ${view.title}`,
      style: 'h1',
      headlineLevel: 1,
      // Cada troca de orientação começa página nova (tabela larga em paisagem).
      ...(wanted !== orientation || index === 0
        ? { pageBreak: 'before' as const, pageOrientation: wanted }
        : {}),
    };
    orientation = wanted;
    content.push(heading, { text: view.description, style: 'description' });
    // As convenções já estão na capa.
    const blocks = view.blocks.filter(
      (block) => !(block.kind === 'list' && block.items === CONVENTIONS),
    );
    for (const block of blocks) content.push(...renderBlock(block, report, CONTENT_WIDTH[wanted]));
  });

  const doc: TDocumentDefinitions = {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [MARGIN, 44, MARGIN, BOTTOM_MARGIN],
    info: {
      title: REPORT_TITLE,
      author: 'Meu Caixa',
      creator: 'Meu Caixa',
      producer: 'Meu Caixa',
      subject: `Período ${header.period}`,
      keywords: 'finanças pessoais, exportação',
    },
    defaultStyle: { font: 'Roboto', fontSize: 8.5, color: COLORS.text, lineHeight: 1.15 },
    styles: {
      title: { fontSize: 22, bold: true, color: COLORS.accent },
      subtitle: { fontSize: 11, color: COLORS.muted },
      h1: { fontSize: 15, bold: true, color: COLORS.accent, margin: [0, 14, 0, 2] },
      h2: { fontSize: 10.5, bold: true, margin: [0, 10, 0, 4] },
      description: { italics: true, color: COLORS.muted, margin: [0, 0, 0, 4] },
      tableHeader: { bold: true, color: '#ffffff' },
      note: { color: COLORS.muted, fontSize: 8 },
      warning: { color: COLORS.warning, fontSize: 8.5 },
      figureLabel: { fontSize: 8, color: COLORS.muted },
      figureValue: { fontSize: 13, bold: true },
    },
    header: (currentPage) =>
      currentPage === 1
        ? null
        : {
            text: `${REPORT_TITLE} · ${header.period}`,
            alignment: 'right',
            fontSize: 7.5,
            color: COLORS.muted,
            margin: [MARGIN, 18, MARGIN, 0],
          },
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: `Gerado em ${header.generatedAt}`, alignment: 'left' },
        { text: `Página ${currentPage} de ${pageCount}`, alignment: 'right' },
      ],
      fontSize: 7.5,
      color: COLORS.muted,
      margin: [MARGIN, 12, MARGIN, 0],
    }),
    // Título (de seção ou de bloco) não fica sozinho no fim da página.
    pageBreakBefore: (node, queries) => {
      if (!node.headlineLevel) return false;
      // Cabeçalho e rodapé da página também contam como "nós seguintes": ficam de fora.
      const position = node.startPosition;
      const bottom = (position.pageOrientation === 'landscape' ? 595 : 842) - BOTTOM_MARGIN;
      const below = queries
        .getFollowingNodesOnPage()
        .filter((next) => next.startPosition.top > position.top && next.startPosition.top < bottom);
      return below.length < 2;
    },
    content,
  };

  return pdfmake.createPdf(doc).getBuffer();
}

function cover(report: ExportReport, views: SectionView[]): Content[] {
  const header = reportHeader(report);
  const content: Content[] = [
    { text: REPORT_TITLE, style: 'title' },
    { text: `Período: ${header.period}`, style: 'subtitle', margin: [0, 6, 0, 0] },
    { text: `Gerado em ${header.generatedAt}`, style: 'subtitle' },
    { text: `Última sincronização: ${header.lastSync}`, style: 'subtitle', margin: [0, 0, 0, 14] },
  ];
  const summary = report.data.resumo;
  if (summary) {
    const figures: [string, number][] = [
      ['Saldo em contas', summary.totals.cashBalance],
      ['Dívida dos cartões', summary.totals.cardDebt],
      ['Saldo − dívida dos cartões', summary.totals.cashBalance - summary.totals.cardDebt],
      ['Entradas no período', summary.periodResult.income],
      ['Saídas no período', -summary.periodResult.spending],
      ['Saldo do período', summary.periodResult.net],
    ];
    const box = ([label, cents]: [string, number]): TableCell => ({
      stack: [
        { text: label, style: 'figureLabel' },
        {
          text: formatCell(cents, 'money', report.timezone),
          style: 'figureValue',
          color: cents < 0 ? COLORS.negative : COLORS.text,
        },
      ],
      fillColor: COLORS.zebra,
      margin: [6, 6, 6, 6],
    });
    content.push({
      table: {
        widths: ['*', '*', '*'],
        body: [figures.slice(0, 3).map(box), figures.slice(3).map(box)],
      },
      layout: {
        hLineWidth: () => 3,
        vLineWidth: () => 3,
        hLineColor: () => '#ffffff',
        vLineColor: () => '#ffffff',
      },
      margin: [-3, 0, -3, 10],
    });
    if (summary.warnings.length > 0) {
      content.push(
        { text: 'Avisos sobre os dados', style: 'h2', color: COLORS.warning },
        { ul: [...summary.warnings], style: 'warning' },
      );
    }
  }
  content.push(
    { text: 'Neste relatório', style: 'h2' },
    {
      ol: views.map((view) => ({
        text: [{ text: view.title, bold: true }, ` — ${view.description}`],
      })),
      style: 'note',
    },
    { text: 'Convenções', style: 'h2' },
    { ul: [...CONVENTIONS, ...report.adjustments], style: 'note' },
  );
  return content;
}

function renderBlock(block: ViewBlock, report: ExportReport, width: number): Content[] {
  const title: Content[] = block.title
    ? [{ text: block.title, style: 'h2', headlineLevel: 2 }]
    : [];
  switch (block.kind) {
    case 'fields':
      return [
        ...title,
        {
          table: {
            widths: [Math.min(240, width * 0.45), '*'],
            body: block.fields.map((field) => [
              { text: field.label, color: COLORS.muted },
              valueCell(field.value, field.type, report.timezone, { alignLeft: true }),
            ]),
          },
          layout: FIELDS_LAYOUT,
          margin: [0, 0, 0, 4],
        },
      ];
    case 'list':
      return [
        ...title,
        {
          // Cópia: o pdfmake altera os nós que recebe e a mesma lista aparece na capa.
          ul: [...block.items],
          style: block.tone === 'warning' ? 'warning' : 'note',
          margin: [0, 4, 0, 2],
        },
      ];
    case 'paragraph':
      return [...title, { text: block.text, margin: [0, 0, 0, 4] }];
    case 'table':
      return [...title, ...renderTable(block, report, width)];
  }
}

function renderTable(block: TableBlock, report: ExportReport, width: number): Content[] {
  if (block.rows.length === 0) {
    return [{ text: block.empty, style: 'note', italics: true, margin: [0, 2, 0, 4] }];
  }
  // Tabela gigante: as linhas mais recentes (as linhas vêm em ordem cronológica).
  const capped = block.rows.length > PDF_MAX_ROWS;
  const rows = capped ? block.rows.slice(-PDF_MAX_ROWS) : block.rows;
  const visible = visibleColumns(block);
  const fontSize = fontSizeFor(visible.length);
  const tz = report.timezone;
  const body: TableCell[][] = [
    visible.map(({ column }) => ({
      text: column.header,
      style: 'tableHeader',
      alignment: isNumeric(column.type) ? 'right' : 'left',
    })),
    ...rows.map((row) =>
      visible.map(({ column, index }) => valueCell(row[index]!, column.type, tz)),
    ),
  ];
  if (hasTotals(block)) {
    const labelAt = Math.max(
      0,
      visible.findIndex(({ column }) => !column.sum && !isNumeric(column.type)),
    );
    body.push(
      visible.map(({ column, index }, i): TableCell => {
        if (i === labelAt) {
          const label = capped ? `Total (todas as ${formatInt(block.rows.length)})` : 'Total';
          return { text: label, bold: true, fillColor: COLORS.total };
        }
        if (!column.sum) return { text: '', fillColor: COLORS.total };
        return {
          ...valueCell(columnTotal(block, index), column.type, tz),
          bold: true,
          fillColor: COLORS.total,
        };
      }),
    );
  }
  const table: Content = {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: columnWidths(block, visible, width, fontSize, tz),
      body,
    },
    layout: TABLE_LAYOUT,
    fontSize,
    margin: [0, 2, 0, 4],
  };
  if (!capped) return [table];
  return [
    {
      text: `Mostrando as ${formatInt(PDF_MAX_ROWS)} transações mais recentes de ${formatInt(block.rows.length)}. Para todas, exporte em Excel ou CSV.`,
      style: 'warning',
      margin: [0, 2, 0, 4],
    },
    table,
  ];
}

function valueCell(
  value: CellValue,
  type: CellType,
  timeZone: string,
  options: { alignLeft?: boolean } = {},
): { text: string; alignment: 'left' | 'right'; noWrap: boolean; color?: string } {
  const text = formatCell(value, type, timeZone);
  return {
    text,
    alignment: isNumeric(type) && !options.alignLeft ? 'right' : 'left',
    noWrap: isNumeric(type),
    ...(type === 'money' && typeof value === 'number' && value < 0
      ? { color: COLORS.negative }
      : {}),
  };
}

/** Largura "natural" de cada coluna (conteúdo até um teto), em pontos. */
function naturalWidths(
  block: TableBlock,
  visible: { column: ViewColumn; index: number }[],
  fontSize: number,
  tz: string,
): number[] {
  const charWidth = fontSize * 0.52;
  const sample = block.rows.length > 400 ? block.rows.slice(0, 400) : block.rows;
  return visible.map(({ column, index }) => {
    const words = column.header.split(/\s+/).map((word) => word.length);
    let longest = Math.max(...words, Math.ceil(column.header.length / 2));
    for (const row of sample) {
      longest = Math.max(longest, formatCell(row[index]!, column.type, tz).length);
    }
    const cap = column.wide ? 60 : isNumeric(column.type) ? 18 : 28;
    return Math.min(cap, longest) * charWidth;
  });
}

const visibleColumns = (block: TableBlock) =>
  block.columns.flatMap((column, index) => (column.hideInPdf ? [] : [{ column, index }]));

const fontSizeFor = (columns: number) => (columns > 10 ? 7 : columns > 7 ? 7.5 : 8.5);

/** Seção com tabela que não cabe bem em retrato vai para paisagem. */
function needsLandscape(view: SectionView, tz: string): boolean {
  return view.blocks.some((block) => {
    if (block.kind !== 'table' || block.rows.length === 0) return false;
    const visible = visibleColumns(block);
    const total = naturalWidths(block, visible, 7, tz).reduce((sum, value) => sum + value, 0);
    return total + visible.length * CELL_PADDING > CONTENT_WIDTH.portrait;
  });
}

/**
 * Larguras proporcionais ao conteúdo, escaladas para a largura útil: nada
 * transborda; se falta espaço, os números ficam inteiros e o texto quebra.
 */
function columnWidths(
  block: TableBlock,
  visible: { column: ViewColumn; index: number }[],
  width: number,
  fontSize: number,
  tz: string,
): number[] {
  const natural = naturalWidths(block, visible, fontSize, tz);
  const total = natural.reduce((sum, value) => sum + value, 0);
  // As larguras do pdfmake não incluem o padding das células.
  const available = width - visible.length * (CELL_PADDING + 0.5);
  if (total <= available) return natural.map((value) => (value * available) / total);
  // Números e textos curtos ficam inteiros; os textos longos encolhem (e quebram linha).
  const fixed = natural.map(
    (value, i) => isNumeric(visible[i]!.column.type) || value <= 12 * fontSize * 0.52,
  );
  const fixedWidth = natural.reduce((sum, value, i) => (fixed[i] ? sum + value : sum), 0);
  const textScale = Math.max(0.3, (available - fixedWidth) / Math.max(1, total - fixedWidth));
  const widths = natural.map((value, i) => (fixed[i] ? value : value * textScale));
  const scale = available / widths.reduce((sum, value) => sum + value, 0);
  return scale < 1 ? widths.map((value) => value * scale) : widths;
}

const isNumeric = (type: CellType) => type !== 'text' && type !== 'bool';
