import ExcelJS from 'exceljs';
import { sampleReport } from '../testing/sample-report.js';
import { MONEY_FORMAT, renderXlsx, sheetName } from './xlsx.renderer.js';

async function load(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
}

/** Linha do cabeçalho da tabela principal (a primeira com fundo preenchido). */
function headerRow(sheet: ExcelJS.Worksheet): ExcelJS.Row {
  for (let i = 1; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const fill = row.getCell(1).fill;
    if (fill?.type === 'pattern' && fill.pattern === 'solid') return row;
  }
  throw new Error(`sem cabeçalho em ${sheet.name}`);
}

describe('renderXlsx', () => {
  it('tem uma aba por seção, a primeira é o Resumo, com propriedades do documento', async () => {
    const workbook = await load(await renderXlsx(sampleReport()));
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Resumo',
      'Contas',
      'Cartões',
      'Faturas',
      'Parcelamentos',
      'Empréstimos',
      'Compromissos fixos',
      'Metas',
      'Orçamento',
      'Projeção',
      'Fluxo de caixa',
      'Gastos por categoria',
      'Recorrências',
      'Transações',
      'Análise do Claude',
    ]);
    expect(workbook.creator).toBe('Meu Caixa');
    expect(workbook.title).toBe('Meu Caixa — Exportação financeira');

    const resumo = workbook.getWorksheet('Resumo')!;
    expect(resumo.getCell('A1').value).toBe('Meu Caixa — Exportação financeira');
    const values = resumo.getSheetValues().flat();
    expect(values).toContain('Saldo em contas');
    expect(values).toContain(20_950.32);
  });

  it('transações: datas reais, R$ numérico, cabeçalho fixo, filtro e total com fórmula', async () => {
    const report = sampleReport({ transactions: 30 });
    const workbook = await load(await renderXlsx(report));
    const sheet = workbook.getWorksheet('Transações')!;
    const header = headerRow(sheet);
    expect(header.getCell(1).value).toBe('Data');
    expect(header.getCell(1).font?.bold).toBe(true);
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: header.number });
    const lastRow = header.number + report.data.transacoes!.items.length;
    expect(sheet.autoFilter).toBe(`A${header.number}:M${lastRow}`);

    const first = sheet.getRow(header.number + 1);
    expect(first.getCell(1).value).toEqual(new Date(Date.UTC(2026, 7, 5)));
    expect(first.getCell(1).numFmt).toBe('dd/mm/yyyy');
    const value = first.getCell(13);
    expect(typeof value.value).toBe('number');
    expect(value.numFmt).toBe(MONEY_FORMAT);
    expect(MONEY_FORMAT).toContain('[Red]');

    const totals = sheet.getRow(header.number + report.data.transacoes!.items.length + 1);
    const formula = totals.getCell(13).value as ExcelJS.CellFormulaValue;
    expect(formula.formula).toMatch(/^SUBTOTAL\(109,M\d+:M\d+\)$/);
    const expected = report.data.transacoes!.items.reduce((sum, tx) => sum + tx.amount, 0) / 100;
    expect(formula.result).toBeCloseTo(expected, 2);
  });

  it('contas: soma com SUM, porcentagem e largura das colunas', async () => {
    const workbook = await load(await renderXlsx(sampleReport()));
    const cards = workbook.getWorksheet('Cartões')!;
    const header = headerRow(cards);
    const usage = cards.getRow(header.number + 1).getCell(7);
    expect(usage.numFmt).toBe('0.0%');
    expect(usage.value).toBeCloseTo(3_124_80 / 15_000_00, 5);
    const total = cards.getRow(header.number + 3).getCell(4).value as ExcelJS.CellFormulaValue;
    expect(total.formula).toBe(`SUM(D${header.number + 1}:D${header.number + 2})`);
    expect(total.result).toBe(23_000);
    expect(cards.getColumn(2).width).toBeGreaterThanOrEqual(8);
  });

  it('sem o Resumo, a primeira aba é "Sobre"', async () => {
    const workbook = await load(await renderXlsx(sampleReport({ sections: ['contas'] })));
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Sobre', 'Contas']);
  });

  it('nomes de aba válidos', () => {
    expect(sheetName('A/B: [c]*?')).toBe('A B   c   ');
    expect(sheetName('x'.repeat(40))).toHaveLength(31);
  });
});
