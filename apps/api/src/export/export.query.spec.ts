import { SECTION_IDS } from './export.catalog.js';
import { defaultPeriod, ExportQueryError, parseExportQuery } from './export.query.js';

const TODAY = '2026-10-23';
const parse = (query: Record<string, unknown>) => parseExportQuery(query, TODAY);
const message = (query: Record<string, unknown>) => {
  try {
    parse(query);
  } catch (error) {
    expect(error).toBeInstanceOf(ExportQueryError);
    return (error as Error).message;
  }
  throw new Error('esperava erro');
};

describe('parseExportQuery', () => {
  it('usa os padrões: 1º dia de 2 meses atrás até hoje e todas as seções', () => {
    expect(defaultPeriod(TODAY)).toEqual({ from: '2026-08-01', to: TODAY });
    expect(parse({ format: 'xlsx' })).toEqual({
      format: 'xlsx',
      from: '2026-08-01',
      to: TODAY,
      sections: [...SECTION_IDS],
      adjustments: [],
    });
  });

  it('com só a data final, começa 2 meses antes dela', () => {
    expect(parse({ format: 'md', to: '2026-03-15' })).toMatchObject({
      from: '2026-01-01',
      to: '2026-03-15',
    });
  });

  it('filtra seções e devolve na ordem canônica, sem repetir', () => {
    expect(parse({ format: 'pdf', sections: 'transacoes, resumo,resumo' }).sections).toEqual([
      'resumo',
      'transacoes',
    ]);
  });

  it('troca datas futuras por hoje e avisa', () => {
    const request = parse({ format: 'csv', from: '2026-10-01', to: '2027-01-31' });
    expect(request.to).toBe(TODAY);
    expect(request.adjustments[0]).toMatch(/futuro/);
  });

  it.each([
    [{}, /Informe o formato/],
    [{ format: 'docx' }, /Formato "docx" inválido/],
    [{ format: ['xlsx', 'pdf'] }, /uma vez só/],
    [{ format: 'xlsx', from: '2026-02-30' }, /Data inicial inválida/],
    [{ format: 'xlsx', to: '23/10/2026' }, /Data final inválida/],
    [
      { format: 'xlsx', from: '2026-10-10', to: '2026-10-01' },
      /data final deve ser igual ou posterior/,
    ],
    [{ format: 'xlsx', from: '2024-10-01', to: '2026-10-23' }, /no máximo 24 meses/],
    [{ format: 'xlsx', sections: 'contas,xpto' }, /Seção desconhecida: xpto/],
    [{ format: 'xlsx', sections: ' , ' }, /pelo menos uma seção/],
  ])('recusa %o', (query, expected) => {
    expect(message(query)).toMatch(expected);
  });

  it('aceita exatamente 24 meses do calendário', () => {
    expect(parse({ format: 'xlsx', from: '2024-11-01' }).from).toBe('2024-11-01');
  });
});
