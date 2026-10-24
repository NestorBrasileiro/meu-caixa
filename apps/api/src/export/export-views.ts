import { categoryLabel } from '../domain/categories.js';
import type { IsoDate } from '../domain/finance.js';
import { SECTION_IDS, SECTIONS, type SectionId } from './export.catalog.js';
import {
  accountTypeLabel,
  budgetKindLabel,
  confidenceLabel,
  connectionStatusLabel,
  formatDate,
  formatDateTime,
  formatInt,
  formatMoney,
  formatMonth,
  formatPct,
  insightKindLabel,
  kindLabel,
  paymentMethodLabel,
  recurrencePatternLabel,
  syncStatusLabel,
  syncTriggerLabel,
  transactionStatusLabel,
} from './export-format.js';
import type { ExportReport, ExportSectionData } from './export-report.js';

/**
 * Camada de apresentação comum a todos os formatos: cada seção do relatório
 * vira blocos (campos, tabelas, listas, parágrafos) com colunas tipadas. Os
 * renderizadores só decidem a aparência; o conteúdo é o mesmo em xlsx, pdf,
 * csv e md.
 */

/**
 * Tipo da célula. `money` em centavos; `pct` como fração (0,45 = 45%);
 * `date` `YYYY-MM-DD`; `month` `YYYY-MM`; `datetime` instante ISO.
 */
export type CellType = 'text' | 'money' | 'date' | 'datetime' | 'month' | 'int' | 'pct' | 'bool';
export type CellValue = string | number | boolean | null;

export interface ViewColumn {
  header: string;
  type: CellType;
  /** Soma a coluna na linha de total. */
  sum?: boolean;
  /** Fora do PDF (que tem pouca largura); continua nos outros formatos. */
  hideInPdf?: boolean;
  /** Texto longo: quebra linha no Excel e ganha mais largura no PDF. */
  wide?: boolean;
}

export interface TableBlock {
  kind: 'table';
  title?: string;
  columns: ViewColumn[];
  rows: CellValue[][];
  /** Mensagem quando não há linhas. */
  empty: string;
  /** No Excel, total com SUBTOTAL (respeita o filtro) em vez de SUM. */
  filteredTotal?: boolean;
}

export interface FieldsBlock {
  kind: 'fields';
  title?: string;
  fields: { label: string; value: CellValue; type: CellType }[];
}

export interface ListBlock {
  kind: 'list';
  title?: string;
  items: string[];
  tone: 'info' | 'warning';
}

export interface ParagraphBlock {
  kind: 'paragraph';
  title?: string;
  text: string;
}

export type ViewBlock = TableBlock | FieldsBlock | ListBlock | ParagraphBlock;

export interface SectionView {
  id: SectionId;
  /** Posição canônica (1 = resumo), usada nos nomes dos CSVs. */
  number: number;
  title: string;
  description: string;
  blocks: ViewBlock[];
}

export const REPORT_TITLE = 'Meu Caixa — Exportação financeira';

/** Linhas fixas de cabeçalho (todas as saídas). */
export function reportHeader(report: ExportReport) {
  const sync = report.lastSync;
  return {
    title: REPORT_TITLE,
    period: `${formatDate(report.period.from)} a ${formatDate(report.period.to)}`,
    generatedAt: `${formatDateTime(report.generatedAt, report.timezone)} (${report.timezone})`,
    lastSync: sync
      ? `${formatDateTime(sync.startedAt, report.timezone)} — ${syncStatusLabel(sync.status)} (${syncTriggerLabel(sync.trigger)})`
      : 'nenhuma ainda',
  };
}

export const CONVENTIONS = [
  'Valores em reais (R$). Negativos são saídas de dinheiro; positivos, entradas.',
  'Pagamento de fatura e transferência entre contas próprias não são gasto nem renda (as compras do cartão já contam como gasto na data da compra): nas transações, aparecem com "Interna = Sim".',
  'Nos cartões, "dívida" é o valor em aberto (quanto se deve), não um saldo negativo.',
  'Datas em dd/mm/aaaa, no fuso de Brasília. Meses marcados como parciais não estão completos no período.',
  'Categoria: a escolhida no Meu Caixa quando você editou; a original do banco aparece em "Categoria original".',
];

/** Pedido sugerido para colar com o arquivo num chat de IA. */
export const AI_PROMPT = [
  'Este arquivo é o meu relatório financeiro exportado do Meu Caixa (valores em R$; negativos são saídas; ' +
    'pagamentos de fatura e transferências entre minhas próprias contas não são gasto novo). ' +
    'Analise meus gastos e responda em português:',
  '1. Para onde vai o meu dinheiro: categorias e estabelecimentos que mais pesam e o que mudou de um mês para o outro.',
  '2. Vazamentos: assinaturas esquecidas ou duplicadas, tarifas bancárias, juros, multas e cobranças estranhas.',
  '3. "Gastos do pecado": supérfluos recorrentes (delivery, corridas de app, compras por impulso) e quanto custam por mês e por ano.',
  '4. Gasto fixo x discricionário, como estão o orçamento, as metas e a projeção dos próximos meses.',
  '5. Parcelamentos, empréstimos e compromissos que vão apertar os próximos meses.',
  '6. Uma lista priorizada de cortes, com a economia mensal estimada de cada um e um plano simples para o próximo mês.',
  'Use só os números do arquivo, cite as transações que embasam cada ponto e diga quando faltar informação.',
].join('\n');

const LOANS_EMPTY_NOTE =
  'Nenhum empréstimo ou financiamento informado pelos bancos conectados. Nem todo banco compartilha empréstimos pelo Open Finance: se você tem algum, confira no app do banco e, se quiser, cadastre a parcela como compromisso fixo no Meu Caixa.';

type ViewBuilder<K extends SectionId> = (
  data: ExportSectionData[K],
  report: ExportReport,
) => ViewBlock[];

const table = (
  columns: ViewColumn[],
  rows: CellValue[][],
  empty: string,
  extra: Partial<TableBlock> = {},
): TableBlock => ({ kind: 'table', columns, rows, empty, ...extra });

const neg = (value: number) => (value === 0 ? 0 : -value);
const fraction = (percent: number | null) => (percent === null ? null : percent / 100);
const installmentText = (value: { number: number; total: number } | null) =>
  value ? `${value.number}/${value.total}` : null;

const BUILDERS: { [K in SectionId]: ViewBuilder<K> } = {
  resumo: (data, report) => {
    const header = reportHeader(report);
    const blocks: ViewBlock[] = [
      {
        kind: 'fields',
        title: 'Exportação',
        fields: [
          { label: 'Período', value: header.period, type: 'text' },
          { label: 'Gerado em', value: header.generatedAt, type: 'text' },
          { label: 'Última sincronização', value: header.lastSync, type: 'text' },
        ],
      },
      {
        kind: 'fields',
        title: 'Saldos e dívidas (agora)',
        fields: [
          { label: 'Saldo em contas', value: data.totals.cashBalance, type: 'money' },
          { label: 'Dívida dos cartões (em aberto)', value: data.totals.cardDebt, type: 'money' },
          {
            label: 'Saldo em contas menos dívida dos cartões',
            value: data.totals.cashBalance - data.totals.cardDebt,
            type: 'money',
          },
          { label: 'Limite total dos cartões', value: data.totals.cardLimit, type: 'money' },
          {
            label: 'Limite disponível nos cartões',
            value: data.totals.cardAvailable,
            type: 'money',
          },
          {
            label: 'Parcelas de cartão a vencer',
            value: data.totals.openInstallmentsRemaining,
            type: 'money',
          },
          data.totals.loansOutstanding === null
            ? { label: 'Saldo devedor de empréstimos', value: 'não informado', type: 'text' }
            : {
                label: 'Saldo devedor de empréstimos',
                value: data.totals.loansOutstanding,
                type: 'money',
              },
          {
            label: 'Compromissos fixos do mês atual',
            value: data.totals.monthlyCommitments,
            type: 'money',
          },
        ],
      },
      {
        kind: 'fields',
        title: 'Resultado do período',
        fields: [
          { label: 'Entradas', value: data.periodResult.income, type: 'money' },
          { label: 'Saídas (gastos)', value: neg(data.periodResult.spending), type: 'money' },
          { label: 'Saldo do período', value: data.periodResult.net, type: 'money' },
          { label: 'Taxa de poupança', value: data.periodResult.savingsRate, type: 'pct' },
          {
            label: 'Pagamentos de fatura (não contam como gasto)',
            value: neg(data.periodResult.cardPayments),
            type: 'money',
          },
          {
            label: 'Transferências para contas próprias (não contam)',
            value: neg(data.periodResult.ownTransfersOut),
            type: 'money',
          },
        ],
      },
      {
        kind: 'fields',
        title: 'Contagens',
        fields: [
          { label: 'Bancos conectados', value: data.counts.connections, type: 'int' },
          { label: 'Contas', value: data.counts.accounts, type: 'int' },
          { label: 'Cartões de crédito', value: data.counts.cards, type: 'int' },
          { label: 'Transações no período', value: data.counts.transactions, type: 'int' },
          { label: 'Faturas', value: data.counts.invoices, type: 'int' },
          { label: 'Parcelamentos em aberto', value: data.counts.openInstallments, type: 'int' },
          { label: 'Empréstimos', value: data.counts.loans, type: 'int' },
          { label: 'Compromissos fixos', value: data.counts.commitments, type: 'int' },
          { label: 'Metas', value: data.counts.goals, type: 'int' },
        ],
      },
      table(
        [
          { header: 'Banco', type: 'text' },
          { header: 'Status da conexão', type: 'text' },
          { header: 'Atualizada no banco em', type: 'datetime' },
        ],
        data.connections.map((c) => [
          c.institutionName,
          connectionStatusLabel(c.status),
          c.lastRefreshedAt,
        ]),
        'Nenhum banco conectado.',
        { title: 'Conexões' },
      ),
      {
        kind: 'list',
        title: 'Avisos sobre os dados',
        tone: data.warnings.length > 0 ? 'warning' : 'info',
        items:
          data.warnings.length > 0
            ? data.warnings
            : ['Nenhum aviso: conexões ativas e sincronização recente.'],
      },
      { kind: 'list', title: 'Convenções', tone: 'info', items: CONVENTIONS },
    ];
    if (report.adjustments.length > 0) {
      blocks.splice(1, 0, {
        kind: 'list',
        title: 'Ajustes no pedido',
        tone: 'info',
        items: report.adjustments,
      });
    }
    return blocks;
  },

  contas: (rows) => [
    table(
      [
        { header: 'Banco', type: 'text' },
        { header: 'Tipo', type: 'text' },
        { header: 'Nome', type: 'text' },
        { header: 'Número', type: 'text' },
        { header: 'Saldo', type: 'money', sum: true },
        { header: 'Dívida do cartão', type: 'money', sum: true },
        { header: 'Limite', type: 'money', sum: true },
        { header: 'Disponível', type: 'money', sum: true },
        { header: 'Sincronizado até', type: 'date' },
        { header: 'Conexão', type: 'text' },
      ],
      rows.map((a) => {
        const card = a.type === 'CREDIT_CARD';
        return [
          a.institutionName,
          accountTypeLabel(a.type),
          a.name,
          a.number,
          card ? null : a.balance,
          card ? a.balance : null,
          a.creditLimit,
          a.availableCredit,
          a.transactionsSyncedThrough,
          connectionStatusLabel(a.connectionStatus),
        ];
      }),
      'Nenhuma conta conectada.',
    ),
  ],

  cartoes: (rows) => [
    table(
      [
        { header: 'Banco', type: 'text' },
        { header: 'Cartão', type: 'text' },
        { header: 'Final', type: 'text' },
        { header: 'Limite', type: 'money', sum: true },
        { header: 'Usado', type: 'money', sum: true },
        { header: 'Disponível', type: 'money', sum: true },
        { header: '% de uso', type: 'pct' },
        { header: 'Fatura aberta', type: 'money', sum: true },
        { header: 'Fecha em', type: 'date' },
        { header: 'Vence em', type: 'date' },
      ],
      rows.map((c) => [
        c.institutionName,
        c.name,
        c.number,
        c.limit,
        c.used,
        c.available,
        c.usage,
        c.openInvoice?.total ?? null,
        c.openInvoice?.closingDate ?? null,
        c.openInvoice?.dueDate ?? null,
      ]),
      'Nenhum cartão de crédito conectado.',
    ),
  ],

  faturas: (rows) => [
    table(
      [
        { header: 'Banco', type: 'text' },
        { header: 'Cartão', type: 'text' },
        { header: 'Fechamento', type: 'date' },
        { header: 'Vencimento', type: 'date' },
        { header: 'Total', type: 'money' },
        { header: 'Pagamento mínimo', type: 'money' },
        { header: 'Situação', type: 'text' },
      ],
      rows.map((i) => [
        i.institutionName,
        i.cardName,
        i.closingDate,
        i.dueDate,
        i.total,
        i.minimumPayment,
        i.upcoming ? 'A vencer' : 'Já venceu',
      ]),
      'Nenhuma fatura com vencimento a partir do início do período.',
    ),
    {
      kind: 'list',
      tone: 'info',
      items: ['Faturas com vencimento a partir do início do período, inclusive as futuras.'],
    },
  ],

  parcelamentos: (rows) => [
    table(
      [
        { header: 'Compra', type: 'text', wide: true },
        { header: 'Cartão', type: 'text' },
        { header: 'Parcela atual', type: 'text' },
        { header: 'Valor da parcela', type: 'money', sum: true },
        { header: 'Próxima parcela', type: 'date' },
        { header: 'Termina em', type: 'date' },
        { header: 'Parcelas restantes', type: 'int', sum: true },
        { header: 'Valor restante', type: 'money', sum: true },
      ],
      rows.map((p) => [
        p.description,
        p.cardName,
        `${p.current}/${p.total}`,
        p.amount,
        p.nextDueDate,
        p.endsOn,
        p.remaining,
        p.remainingAmount,
      ]),
      'Nenhuma compra parcelada em aberto nos cartões.',
    ),
    {
      kind: 'list',
      tone: 'info',
      items: [
        'Deduzido das parcelas que aparecem nas faturas (o Open Finance não informa o plano da compra). Valor restante = parcelas restantes × valor da parcela, contando a atual.',
      ],
    },
  ],

  emprestimos: (rows) =>
    rows.length === 0
      ? [{ kind: 'list', tone: 'info', items: [LOANS_EMPTY_NOTE] }]
      : [
          table(
            [
              { header: 'Banco', type: 'text' },
              { header: 'Produto', type: 'text' },
              { header: 'Contrato', type: 'text', hideInPdf: true },
              { header: 'Contratado', type: 'money', sum: true },
              { header: 'Saldo devedor', type: 'money', sum: true },
              { header: 'Parcelas pagas', type: 'int' },
              { header: 'Total de parcelas', type: 'int' },
              { header: 'Restantes', type: 'int' },
              { header: 'Atrasadas', type: 'int' },
              { header: 'Valor da parcela', type: 'money', sum: true },
              { header: 'Próxima parcela', type: 'date' },
              { header: 'Valor da próxima', type: 'money' },
              { header: 'Taxa a.a.', type: 'pct' },
              { header: 'CET a.a.', type: 'pct' },
              { header: 'Contratado em', type: 'date', hideInPdf: true },
              { header: 'Vencimento final', type: 'date' },
              { header: 'Periodicidade', type: 'text', hideInPdf: true },
            ],
            rows.map((l) => [
              l.institutionName,
              l.productName,
              l.contractNumber,
              l.contractedAmount,
              l.outstandingBalance,
              l.installments.paid,
              l.installments.total,
              l.installments.remaining,
              l.installments.overdue,
              l.installmentAmount,
              l.nextInstallment?.dueDate ?? null,
              l.nextInstallment?.amount ?? null,
              fraction(l.interestRateAnnual),
              fraction(l.cetAnnual),
              l.contractDate,
              l.finalDueDate,
              l.periodicity,
            ]),
            LOANS_EMPTY_NOTE,
          ),
          {
            kind: 'list',
            tone: 'info',
            items: [
              'Dados informados pelos bancos via Open Finance. Financiamentos que o banco não compartilha (ex.: com loteadora) ficam em "Compromissos fixos" quando cadastrados.',
            ],
          },
        ],

  compromissos: (rows) => [
    table(
      [
        { header: 'Compromisso', type: 'text', wide: true },
        { header: 'Valor mensal', type: 'money', sum: true },
        { header: 'Dia', type: 'int' },
        { header: 'Forma de pagamento', type: 'text' },
        { header: 'Categoria', type: 'text' },
        { header: 'Início', type: 'date' },
        { header: 'Fim', type: 'date' },
        { header: 'Parcelas pagas', type: 'text' },
        { header: 'Parcelas restantes', type: 'int' },
        { header: 'Valor restante', type: 'money', sum: true },
        { header: 'Ativo no mês', type: 'bool' },
        { header: 'Observações', type: 'text', hideInPdf: true },
      ],
      rows.map((c) => [
        c.name,
        c.amount,
        c.dayOfMonth,
        paymentMethodLabel(c.paymentMethod),
        c.category,
        c.startsOn,
        c.endsOn,
        c.installments ? `${c.installments.paid}/${c.installments.total}` : null,
        c.installments?.remaining ?? null,
        c.installments?.remainingAmount ?? null,
        c.activeThisMonth,
        c.notes,
      ]),
      'Nenhum compromisso fixo cadastrado (tela Planejamento).',
    ),
  ],

  metas: (rows) => [
    table(
      [
        { header: 'Meta', type: 'text', wide: true },
        { header: 'Alvo', type: 'money', sum: true },
        { header: 'Guardado', type: 'money', sum: true },
        { header: 'Falta', type: 'money', sum: true },
        { header: 'Progresso', type: 'pct' },
        { header: 'Data alvo', type: 'date' },
        { header: 'Meses restantes', type: 'int' },
        { header: 'Aporte planejado', type: 'money', sum: true },
        { header: 'Aporte necessário', type: 'money', sum: true },
        { header: 'No ritmo', type: 'bool' },
      ],
      rows.map((g) => [
        g.name,
        g.target,
        g.saved,
        g.remaining,
        g.progress,
        g.targetDate,
        g.monthsLeft,
        g.monthlyContribution,
        g.monthlyNeeded,
        g.onTrack,
      ]),
      'Nenhuma meta cadastrada (tela Planejamento).',
    ),
  ],

  orcamento: (data) => [
    table(
      [
        { header: 'Mês', type: 'month' },
        { header: 'Categoria', type: 'text', wide: true },
        { header: 'Tipo', type: 'text' },
        { header: 'Teto mensal', type: 'money', sum: true },
        { header: 'Gasto', type: 'money', sum: true },
        { header: 'Sobra do teto', type: 'money', sum: true },
        { header: 'Uso do teto', type: 'pct' },
        { header: 'Mês parcial', type: 'bool' },
      ],
      data.rows.map((r) => [
        r.month,
        r.category,
        budgetKindLabel(r.kind),
        r.budget,
        r.spent,
        r.difference,
        r.usage,
        r.partialMonth,
      ]),
      'Nenhuma categoria de orçamento cadastrada nem gasto no período.',
    ),
    {
      kind: 'list',
      tone: 'info',
      items: [
        'Sobra do teto = teto − gasto (negativo = estourou).',
        ...data.categories.map(
          (c) =>
            `${c.name}: ${c.sourceCategories.length > 0 ? c.sourceCategories.map(categoryLabel).join(', ') : 'sem categorias do banco associadas'}.`,
        ),
      ],
    },
  ],

  projecao: (rows) => [
    table(
      [
        { header: 'Mês', type: 'month' },
        { header: 'Renda esperada', type: 'money', sum: true },
        { header: 'Compromissos', type: 'money', sum: true },
        { header: 'Aportes em metas', type: 'money', sum: true },
        { header: 'Gasto variável esperado', type: 'money', sum: true },
        { header: 'Saldo projetado', type: 'money', sum: true },
      ],
      rows.map((p) => [
        p.month,
        p.expectedIncome,
        neg(p.commitments),
        neg(p.goalContributions),
        neg(p.expectedVariableSpending),
        p.projectedBalance,
      ]),
      'Sem dados suficientes para projetar.',
    ),
    {
      kind: 'list',
      tone: 'info',
      items: [
        'Renda média dos 3 últimos meses fechados − compromissos ativos no mês − aportes das metas ainda não atingidas − gasto variável médio (gasto total médio menos os compromissos).',
      ],
    },
  ],

  fluxo: (rows) => [
    table(
      [
        { header: 'Mês', type: 'month' },
        { header: 'Parcial', type: 'bool' },
        { header: 'Entradas', type: 'money', sum: true },
        { header: 'Saídas', type: 'money', sum: true },
        { header: 'Saldo', type: 'money', sum: true },
        { header: 'Taxa de poupança', type: 'pct' },
        { header: 'Pagamentos de fatura', type: 'money', sum: true },
        { header: 'Transferências p/ contas próprias', type: 'money', sum: true },
      ],
      rows.map((m) => [
        m.month,
        m.partial,
        m.income,
        neg(m.spending),
        m.net,
        m.savingsRate,
        neg(m.cardPayments),
        neg(m.ownTransfersOut),
      ]),
      'Nenhum mês no período.',
    ),
    {
      kind: 'list',
      tone: 'info',
      items: [
        'Saídas = gastos (compras no cartão na data da compra). Pagamentos de fatura e transferências para contas próprias ficam à parte e não entram no saldo.',
      ],
    },
  ],

  categorias: (data) => [
    table(
      [
        { header: 'Categoria', type: 'text', wide: true },
        { header: 'Total gasto', type: 'money', sum: true },
        { header: 'Transações', type: 'int', sum: true },
        { header: '% do total', type: 'pct' },
        { header: 'Média mensal', type: 'money', sum: true },
      ],
      data.rows.map((c) => [
        categoryLabel(c.category),
        c.total,
        c.count,
        c.share,
        c.monthlyAverage,
      ]),
      'Nenhum gasto no período.',
    ),
    {
      kind: 'list',
      tone: 'info',
      items: [
        `Média mensal sobre ${data.monthCount} ${data.monthCount === 1 ? 'mês' : 'meses'} do período. Pagamento de fatura e transferência própria não entram.`,
      ],
    },
  ],

  recorrencias: (data) => [
    table(
      [
        { header: 'Descrição', type: 'text', wide: true },
        { header: 'Contraparte', type: 'text' },
        { header: 'Categoria', type: 'text' },
        { header: 'Padrão', type: 'text' },
        { header: 'Ativa', type: 'bool' },
        { header: 'Cobranças', type: 'int', hideInPdf: true },
        { header: 'Meses', type: 'int' },
        { header: 'Valor típico', type: 'money' },
        { header: 'Último valor', type: 'money', hideInPdf: true },
        { header: 'Última cobrança', type: 'date' },
        { header: 'Custo mensal', type: 'money', sum: true },
        { header: 'Custo anual', type: 'money', sum: true },
        { header: 'Última parcela', type: 'text' },
        { header: 'Contas', type: 'text', hideInPdf: true },
      ],
      data.items.map((r) => [
        r.label,
        r.counterpartyName,
        categoryLabel(r.category),
        recurrencePatternLabel(r.pattern),
        r.active,
        r.occurrences,
        r.monthsSeen,
        r.typicalAmount,
        r.lastAmount,
        r.lastDate,
        r.estimatedMonthlyCost,
        r.estimatedYearlyCost,
        r.installment ? `${r.installment.current}/${r.installment.total}` : null,
        r.accounts.join(', '),
      ]),
      'Nenhuma cobrança recorrente encontrada.',
    ),
    {
      kind: 'list',
      tone: 'info',
      items: [
        `Analisado de ${formatDate(data.window.from)} a ${formatDate(data.window.to)}: mesma origem com gasto em pelo menos ${data.minMonths} meses diferentes. "Ativa" = cobrada nos últimos 40 dias.`,
        `Custo mensal estimado das recorrências ativas (sem parcelamentos): ${formatMoney(data.activeMonthlyCost)}.`,
      ],
    },
  ],

  transacoes: (data) => [
    table(
      [
        { header: 'Data', type: 'date' },
        { header: 'Banco', type: 'text', hideInPdf: true },
        { header: 'Conta', type: 'text' },
        { header: 'Descrição', type: 'text', wide: true },
        { header: 'Contraparte', type: 'text' },
        { header: 'Categoria', type: 'text' },
        { header: 'Categoria original', type: 'text', hideInPdf: true },
        { header: 'Forma de pagamento', type: 'text' },
        { header: 'Parcela', type: 'text' },
        { header: 'Status', type: 'text' },
        { header: 'Tipo', type: 'text', hideInPdf: true },
        { header: 'Interna', type: 'bool' },
        { header: 'Valor', type: 'money', sum: true },
      ],
      data.items.map((t) => [
        t.date,
        t.institutionName,
        t.accountName,
        t.description,
        t.counterpartyName,
        categoryLabel(t.category),
        t.edited ? categoryLabel(t.originalCategory) : null,
        paymentMethodLabel(t.paymentMethod),
        installmentText(t.installment),
        transactionStatusLabel(t.status),
        kindLabel(t.kind),
        t.internal,
        t.amount,
      ]),
      'Nenhuma transação no período.',
      { filteredTotal: true },
    ),
  ],

  analise: (analysis, report) => {
    if (!analysis) {
      return [
        {
          kind: 'list',
          tone: 'info',
          items: [
            'Nenhuma análise do Claude salva ainda. Gere uma na tela Análise ou pelo seu Claude via MCP — ou cole o arquivo Markdown desta exportação em qualquer chat de IA, com o pedido sugerido.',
          ],
        },
      ];
    }
    return [
      {
        kind: 'fields',
        fields: [
          {
            label: 'Gerada em',
            value: formatDateTime(analysis.generatedAt, report.timezone),
            type: 'text',
          },
          {
            label: 'Origem',
            value: analysis.source === 'MCP' ? 'Seu Claude (MCP)' : 'App (API da Anthropic)',
            type: 'text',
          },
          { label: 'Modelo', value: analysis.model, type: 'text' },
          {
            label: 'Período analisado',
            value: `${formatDate(analysis.period.from)} a ${formatDate(analysis.period.to)}`,
            type: 'text',
          },
          { label: 'Manchete', value: analysis.headline, type: 'text' },
          { label: 'Gasto fixo por mês', value: analysis.monthlyFixed, type: 'money' },
          {
            label: 'Gasto discricionário por mês',
            value: analysis.monthlyDiscretionary,
            type: 'money',
          },
          {
            label: 'Economia potencial por mês',
            value: analysis.potentialMonthlySavings,
            type: 'money',
          },
        ],
      },
      { kind: 'paragraph', title: 'Resumo', text: analysis.summary },
      table(
        [
          { header: 'Tipo', type: 'text' },
          { header: 'Título', type: 'text' },
          { header: 'Explicação', type: 'text', wide: true },
          { header: 'Economia mensal', type: 'money', sum: true },
          { header: 'Confiança', type: 'text' },
          { header: 'Evidência', type: 'text', wide: true },
        ],
        analysis.insights.map((i) => [
          insightKindLabel(i.kind),
          i.title,
          i.explanation,
          i.monthlySavings,
          confidenceLabel(i.confidence),
          i.evidence
            ? `${i.evidence.label}: ${i.evidence.occurrences} transações, ${formatMoney(i.evidence.total)} (${formatDate(i.evidence.period.from)} a ${formatDate(i.evidence.period.to)})`
            : null,
        ]),
        'A análise não tem sugestões.',
        { title: 'Sugestões' },
      ),
    ];
  },
};

/** As seções pedidas, na ordem canônica, prontas para renderizar. */
export function buildViews(report: ExportReport): SectionView[] {
  return report.sections.flatMap((id) => {
    if (!(id in report.data)) return [];
    const build = BUILDERS[id] as ViewBuilder<typeof id>;
    const info = SECTIONS[id];
    return [
      {
        id,
        number: SECTION_IDS.indexOf(id) + 1,
        title: info.label,
        description: info.description,
        blocks: build(report.data[id] as ExportSectionData[typeof id], report),
      },
    ];
  });
}

/** Soma de uma coluna (para as linhas de total fora do Excel). */
export function columnTotal(block: TableBlock, index: number): number {
  return block.rows.reduce<number>((total, row) => {
    const value = row[index];
    return typeof value === 'number' ? total + value : total;
  }, 0);
}

export function hasTotals(block: TableBlock): boolean {
  return block.rows.length > 1 && block.columns.some((column) => column.sum);
}

/** Nome de arquivo do download: `meu-caixa_<de>_a_<ate>.<ext>`. */
export function exportFileName(period: { from: IsoDate; to: IsoDate }, extension: string): string {
  return `meu-caixa_${period.from}_a_${period.to}.${extension}`;
}

/** Texto da célula para leitura humana (PDF e Markdown). */
export function formatCell(value: CellValue, type: CellType, timeZone: string): string {
  if (value === null || value === '') return '';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'number') {
    switch (type) {
      case 'money':
        return formatMoney(value);
      case 'pct':
        return formatPct(value);
      default:
        return formatInt(value);
    }
  }
  switch (type) {
    case 'date':
      return formatDate(value);
    case 'month':
      return formatMonth(value);
    case 'datetime':
      return formatDateTime(value, timeZone);
    default:
      return value;
  }
}
