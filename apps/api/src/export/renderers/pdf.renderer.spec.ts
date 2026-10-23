import { extractText, getDocumentProxy } from 'unpdf';
import { sampleReport } from '../testing/sample-report.js';
import { renderPdf } from './pdf.renderer.js';

async function pdfText(buffer: Buffer) {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  return { totalPages, text };
}

describe('renderPdf', () => {
  it('gera um PDF A4 com títulos acentuados, valores em R$ e páginas numeradas', async () => {
    const buffer = await renderPdf(sampleReport());
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const { totalPages, text } = await pdfText(buffer);
    expect(totalPages).toBeGreaterThan(3);
    for (const title of [
      'Meu Caixa — Exportação financeira',
      '1. Resumo',
      '6. Empréstimos',
      '9. Orçamento',
      '10. Projeção',
      '13. Recorrências',
      '14. Transações',
      '15. Análise do Claude',
    ]) {
      expect(text).toContain(title);
    }
    expect(text).toContain('R$ 20.950,32');
    expect(text).toContain('Ótica São João');
    expect(text).toContain(`Página 1 de ${totalPages}`);
    expect(text).toContain(`Página ${totalPages} de ${totalPages}`);
  }, 30_000);

  it('só as seções pedidas', async () => {
    const { text } = await pdfText(await renderPdf(sampleReport({ sections: ['metas'] })));
    expect(text).toContain('1. Metas');
    expect(text).toContain('Entrada do carro');
    expect(text).not.toContain('Transações');
  });
});
