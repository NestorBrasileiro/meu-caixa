/**
 * O que a exportação oferece: formatos e seções (ids estáveis, na ordem em que
 * aparecem nos arquivos). É o contrato com a interface (`GET /api/export/options`).
 */

export const EXPORT_FORMATS = ['xlsx', 'pdf', 'csv', 'md'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export interface ExportFormatInfo {
  id: ExportFormat;
  label: string;
  /** Extensão do arquivo baixado (o CSV vem compactado em .zip). */
  extension: string;
  contentType: string;
  description: string;
}

export const FORMATS: Record<ExportFormat, ExportFormatInfo> = {
  xlsx: {
    id: 'xlsx',
    label: 'Excel (.xlsx)',
    extension: 'xlsx',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    description:
      'Planilha com uma aba por seção: valores numéricos em R$, datas de verdade, filtros e totais. Abre no Excel, LibreOffice e Google Planilhas.',
  },
  pdf: {
    id: 'pdf',
    label: 'PDF',
    extension: 'pdf',
    contentType: 'application/pdf',
    description: 'Relatório A4 para ler ou imprimir, com uma tabela por seção e páginas numeradas.',
  },
  csv: {
    id: 'csv',
    label: 'CSV (.zip)',
    extension: 'zip',
    contentType: 'application/zip',
    description:
      'Um CSV por seção (separador ";", vírgula decimal, UTF-8) num .zip, com um LEIA-ME. Bom para Excel, Python ou outra ferramenta.',
  },
  md: {
    id: 'md',
    label: 'Markdown (.md)',
    extension: 'md',
    contentType: 'text/markdown; charset=utf-8',
    description:
      'Texto com tabelas, pronto para colar no ChatGPT, Claude.ai ou Gemini (com um pedido de análise sugerido) ou para ler direto.',
  },
};

export const SECTION_IDS = [
  'resumo',
  'contas',
  'cartoes',
  'faturas',
  'parcelamentos',
  'emprestimos',
  'compromissos',
  'metas',
  'orcamento',
  'projecao',
  'fluxo',
  'categorias',
  'recorrencias',
  'transacoes',
  'analise',
] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export interface SectionInfo {
  id: SectionId;
  /** Título da seção; também o nome da aba no Excel (até 31 caracteres). */
  label: string;
  description: string;
}

export const SECTIONS: Record<SectionId, SectionInfo> = {
  resumo: {
    id: 'resumo',
    label: 'Resumo',
    description:
      'Saldo em contas, dívida e limite dos cartões, resultado do período, contagens, avisos sobre dados desatualizados e convenções.',
  },
  contas: {
    id: 'contas',
    label: 'Contas',
    description:
      'Todas as contas e cartões conectados: banco, tipo, saldo (ou dívida do cartão), limite, disponível e até quando foram sincronizados.',
  },
  cartoes: {
    id: 'cartoes',
    label: 'Cartões',
    description:
      'Cada cartão de crédito: limite, usado, disponível, % de uso e a fatura em aberto.',
  },
  faturas: {
    id: 'faturas',
    label: 'Faturas',
    description: 'Histórico de faturas por cartão (fechamento, vencimento, total e mínimo).',
  },
  parcelamentos: {
    id: 'parcelamentos',
    label: 'Parcelamentos',
    description:
      'Compras parceladas no cartão ainda em aberto: parcela atual, valor, próxima, fim e quanto falta pagar.',
  },
  emprestimos: {
    id: 'emprestimos',
    label: 'Empréstimos',
    description:
      'Empréstimos e financiamentos informados pelos bancos: saldo devedor, parcelas, taxa e CET.',
  },
  compromissos: {
    id: 'compromissos',
    label: 'Compromissos fixos',
    description:
      'Gastos fixos cadastrados (ex.: parcela do terreno), com parcelas pagas, fim e valor restante.',
  },
  metas: {
    id: 'metas',
    label: 'Metas',
    description: 'Metas de economia com progresso, aporte planejado e aporte necessário.',
  },
  orcamento: {
    id: 'orcamento',
    label: 'Orçamento',
    description: 'Categorias de orçamento: teto mensal contra o gasto real em cada mês do período.',
  },
  projecao: {
    id: 'projecao',
    label: 'Projeção',
    description:
      'Projeção dos próximos 6 meses: renda esperada, compromissos, aportes e gasto variável.',
  },
  fluxo: {
    id: 'fluxo',
    label: 'Fluxo de caixa',
    description: 'Entradas, saídas e saldo de cada mês do período.',
  },
  categorias: {
    id: 'categorias',
    label: 'Gastos por categoria',
    description: 'Total gasto por categoria no período, com número de transações e participação.',
  },
  recorrencias: {
    id: 'recorrencias',
    label: 'Recorrências',
    description:
      'Cobranças que se repetem: assinaturas, contas fixas, hábitos frequentes e parcelamentos.',
  },
  transacoes: {
    id: 'transacoes',
    label: 'Transações',
    description:
      'Todas as transações do período, com conta, categoria, forma de pagamento, parcela e status.',
  },
  analise: {
    id: 'analise',
    label: 'Análise do Claude',
    description: 'A última análise salva pelo Claude (manchete, resumo e sugestões), se houver.',
  },
};

/** Limite do período exportado, em meses do calendário. */
export const MAX_EXPORT_MONTHS = 24;
