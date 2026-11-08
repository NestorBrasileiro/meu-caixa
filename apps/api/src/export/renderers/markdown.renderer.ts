import type { ExportReport } from '../export-report.js';
import { formatInt } from '../export-format.js';
import {
  AI_PROMPT,
  buildViews,
  type CellType,
  columnTotal,
  CONVENTIONS,
  formatCell,
  hasTotals,
  reportHeader,
  type TableBlock,
  type ViewBlock,
} from '../export-views.js';

/**
 * Markdown: um arquivo para ler direto ou colar num chat de IA (ChatGPT,
 * Claude.ai, Gemini). Compacto: cabeçalho, "Como usar" com o pedido sugerido,
 * convenções e uma tabela por seção.
 */

/** Acima disso, a tabela leva só as linhas mais recentes (o total continua de todas). */
export const MARKDOWN_MAX_ROWS = 3_000;

export function renderMarkdown(report: ExportReport): Buffer {
  const header = reportHeader(report);
  const views = buildViews(report);
  const out: string[] = [
    `# ${header.title}`,
    '',
    `- **Período:** ${header.period}`,
    `- **Gerado em:** ${header.generatedAt}`,
    `- **Última sincronização:** ${header.lastSync}`,
    `- **Seções:** ${views.map((view) => view.title).join(', ')}`,
    '',
    '## Como usar',
    '',
    'Anexe este arquivo (ou cole o conteúdo) numa conversa com o ChatGPT, o Claude.ai ou o Gemini e mande o pedido abaixo — ou leia direto: cada seção é uma tabela.',
    '',
    '```text',
    AI_PROMPT,
    '```',
    '',
    '## Convenções',
    '',
    ...CONVENTIONS.map((text) => `- ${text}`),
    ...report.adjustments.map((text) => `- ${text}`),
  ];

  views.forEach((view, index) => {
    out.push('', `## ${index + 1}. ${view.title}`, '', `_${view.description}_`);
    for (const block of view.blocks) {
      // As convenções já estão no topo do arquivo.
      if (block.kind === 'list' && block.items === CONVENTIONS) continue;
      out.push('', ...renderBlock(block, report.timezone));
    }
  });

  return Buffer.from(out.join('\n') + '\n', 'utf8');
}

function renderBlock(block: ViewBlock, timeZone: string): string[] {
  const title = block.title ? [`### ${block.title}`, ''] : [];
  switch (block.kind) {
    case 'fields':
      return [
        ...title,
        '| Item | Valor |',
        '| --- | ---: |',
        ...block.fields.map(
          (field) =>
            `| ${cell(field.label)} | ${cell(formatCell(field.value, field.type, timeZone) || '—')} |`,
        ),
      ];
    case 'list':
      return [
        ...title,
        ...block.items.map((item) =>
          block.tone === 'warning' ? `- **Atenção:** ${item}` : `- ${item}`,
        ),
      ];
    case 'paragraph':
      return [...title, block.text.trim()];
    case 'table':
      return [...title, ...renderTable(block, timeZone)];
  }
}

function renderTable(block: TableBlock, timeZone: string): string[] {
  if (block.rows.length === 0) return [`_${block.empty}_`];
  const capped = block.rows.length > MARKDOWN_MAX_ROWS;
  // As linhas vêm em ordem cronológica: com corte, ficam as mais recentes.
  const rows = capped ? block.rows.slice(-MARKDOWN_MAX_ROWS) : block.rows;
  const lines = [
    `| ${block.columns.map((column) => cell(column.header)).join(' | ')} |`,
    `| ${block.columns.map((column) => (isNumeric(column.type) ? '---:' : '---')).join(' | ')} |`,
    ...rows.map(
      (row) =>
        `| ${row.map((value, i) => cell(formatCell(value, block.columns[i]!.type, timeZone))).join(' | ')} |`,
    ),
  ];
  if (hasTotals(block)) {
    const label = capped ? `**Total (todas as ${formatInt(block.rows.length)})**` : '**Total**';
    const labelIndex = Math.max(
      0,
      block.columns.findIndex((column) => !column.sum && !isNumeric(column.type)),
    );
    lines.push(
      `| ${block.columns
        .map((column, i) =>
          i === labelIndex
            ? label
            : column.sum
              ? `**${formatCell(columnTotal(block, i), column.type, timeZone)}**`
              : '',
        )
        .join(' | ')} |`,
    );
  }
  if (capped) {
    lines.push(
      '',
      `_Mostrando as ${formatInt(MARKDOWN_MAX_ROWS)} transações mais recentes de ${formatInt(block.rows.length)}. Para todas, exporte em Excel ou CSV._`,
    );
  }
  return lines;
}

const isNumeric = (type: CellType) => type !== 'text' && type !== 'bool';

/** Célula de tabela markdown: sem quebra de linha e com `|` escapado. */
function cell(text: string): string {
  return text
    .replace(/\r?\n+/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();
}
