import { strFromU8, unzipSync } from 'fflate';
import { sampleReport } from '../testing/sample-report.js';
import { csvValue, renderCsvZip } from './csv.renderer.js';

const unzip = (buffer: Buffer) => unzipSync(new Uint8Array(buffer));
/** O TextDecoder do fflate já descarta o BOM. */
const text = (bytes: Uint8Array) => strFromU8(bytes);

/** Parser mínimo de CSV com ";" e aspas, para conferir o arquivo. */
function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < content.length; i++) {
    const char = content[i]!;
    if (quoted) {
      if (char === '"' && content[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ';') {
      row.push(field);
      field = '';
    } else if (char === '\r') continue;
    else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  return rows;
}

describe('renderCsvZip', () => {
  it('um CSV por seção com nome numerado e um LEIA-ME', () => {
    const files = unzip(renderCsvZip(sampleReport()));
    expect(Object.keys(files)).toEqual([
      '01-resumo.csv',
      '02-contas.csv',
      '03-cartoes.csv',
      '04-faturas.csv',
      '05-parcelamentos.csv',
      '06-emprestimos.csv',
      '07-compromissos.csv',
      '08-metas.csv',
      '09-orcamento.csv',
      '10-projecao.csv',
      '11-fluxo.csv',
      '12-categorias.csv',
      '13-recorrencias.csv',
      '14-transacoes.csv',
      '15-analise.csv',
      'LEIA-ME.txt',
    ]);
    const readme = text(files['LEIA-ME.txt']!);
    expect(readme).toContain("sep=';', decimal=','");
    expect(readme).toContain('14-transacoes.csv — Transações');
  });

  it('UTF-8 com BOM, ";" e vírgula decimal, datas dd/mm/aaaa', () => {
    const files = unzip(renderCsvZip(sampleReport()));
    const raw = files['14-transacoes.csv']!;
    expect(Array.from(raw.subarray(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const rows = parseCsv(text(raw));
    expect(rows[0]).toEqual([
      'Data',
      'Banco',
      'Conta',
      'Descrição',
      'Contraparte',
      'Categoria',
      'Categoria original',
      'Forma de pagamento',
      'Parcela',
      'Status',
      'Tipo',
      'Interna',
      'Valor (R$)',
    ]);
    expect(rows[1]).toEqual([
      '05/08/2026',
      'Banco Exemplo',
      'Conta corrente',
      'Salário',
      'Empresa Exemplo Ltda',
      'Salário',
      '',
      'TED',
      '',
      'Efetivada',
      'Receita',
      'Não',
      '9000,00',
    ]);
    const padaria = rows.find((row) => row[3]?.startsWith('Padaria'))!;
    expect(padaria[3]).toBe('Padaria "Pão; Café | Cia"');
    expect(padaria[5]).toBe('Restaurantes');
    expect(padaria[6]).toBe('Mercado');
    // Texto que parece fórmula ganha apóstrofo.
    expect(rows.find((row) => row[3]?.includes('HYPERLINK'))![3]).toBe(`'=HYPERLINK("x")`);
    expect(rows.find((row) => row[3] === 'Pagamento fatura cartão')!.slice(10)).toEqual([
      'Pagamento de fatura',
      'Sim',
      '-3301,40',
    ]);
  });

  it('resumo em blocos e seção sem tabela vira observação', () => {
    const files = unzip(renderCsvZip(sampleReport()));
    const resumo = text(files['01-resumo.csv']!);
    expect(resumo).toContain('Saldo em contas;20950,32');
    expect(resumo).toContain('Taxa de poupança;20,9%');
    expect(resumo).toContain('precisa de ação');

    const report = sampleReport({ sections: ['emprestimos'] });
    report.data.emprestimos = [];
    const loans = parseCsv(text(unzip(renderCsvZip(report))['06-emprestimos.csv']!));
    expect(loans[0]).toEqual(['Observação']);
    expect(loans[1]![0]).toMatch(/Open Finance/);
  });

  it.each([
    [-123456, 'money', '-1234,56'],
    [5, 'money', '0,05'],
    [0.4532, 'pct', '45,3%'],
    ['2026-10', 'month', '10/2026'],
    [true, 'bool', 'Sim'],
    [null, 'text', ''],
  ] as const)('csvValue(%o, %s) = %s', (value, type, expected) => {
    expect(csvValue(value, type, 'America/Sao_Paulo')).toBe(expected);
  });
});
