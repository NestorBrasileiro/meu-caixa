import { sampleReport } from '../testing/sample-report.js';
import { MARKDOWN_MAX_ROWS, renderMarkdown } from './markdown.renderer.js';

const render = (...args: Parameters<typeof sampleReport>) =>
  renderMarkdown(sampleReport(...args)).toString('utf8');

describe('renderMarkdown', () => {
  it('cabeçalho, como usar com o pedido para a IA e convenções', () => {
    const md = render();
    expect(md.startsWith('# Meu Caixa — Exportação financeira\n')).toBe(true);
    expect(md).toContain('- **Período:** 01/08/2026 a 23/10/2026');
    expect(md).toContain('- **Gerado em:** 23/10/2026 14:05 (America/Sao_Paulo)');
    expect(md).toMatch(/## Como usar\n\n.*ChatGPT, o Claude\.ai ou o Gemini/);
    expect(md).toMatch(
      /```text\nEste arquivo é o meu relatório financeiro[\s\S]*gastos do pecado[\s\S]*```/i,
    );
    expect(md).toContain('## Convenções');
  });

  it('cada seção com título numerado e tabelas com R$ em pt-BR', () => {
    const md = render();
    const headings = md.match(/^## \d+\. .+$/gm);
    expect(headings).toEqual([
      '## 1. Resumo',
      '## 2. Contas',
      '## 3. Cartões',
      '## 4. Faturas',
      '## 5. Parcelamentos',
      '## 6. Empréstimos',
      '## 7. Compromissos fixos',
      '## 8. Metas',
      '## 9. Orçamento',
      '## 10. Projeção',
      '## 11. Fluxo de caixa',
      '## 12. Gastos por categoria',
      '## 13. Recorrências',
      '## 14. Transações',
      '## 15. Análise do Claude',
    ]);
    expect(md).toContain('| Saldo em contas | R$ 20.950,32 |');
    expect(md).toContain(
      '| Loja Exemplo — Geladeira | Cartão Platinum | 4/10 | R$ 450,00 | 12/11/2026 | 12/05/2027 | 7 | R$ 3.150,00 |',
    );
    expect(md).toContain('| **Total** |');
    // `|` escapado dentro da célula.
    expect(md).toContain('Padaria "Pão; Café \\| Cia"');
    expect(md).toContain('-R$ 3.301,40');
  });

  it('sem análise salva, fica a observação', () => {
    const report = sampleReport({ sections: ['analise'] });
    report.data.analise = null;
    const md = renderMarkdown(report).toString('utf8');
    expect(md).toContain('## 1. Análise do Claude');
    expect(md).toContain('Nenhuma análise do Claude salva ainda');
  });

  it(`corta as transações acima de ${MARKDOWN_MAX_ROWS} e avisa`, () => {
    const md = render({ sections: ['transacoes'], transactions: MARKDOWN_MAX_ROWS + 50 });
    const rows = md.split('\n').filter((line) => /^\| \d{2}\/\d{2}\/\d{4} \|/.test(line));
    expect(rows).toHaveLength(MARKDOWN_MAX_ROWS);
    expect(md).toContain(`Mostrando as 3.000 transações mais recentes de 3.050`);
    expect(md).toContain('**Total (todas as 3.050)**');
  });
});
