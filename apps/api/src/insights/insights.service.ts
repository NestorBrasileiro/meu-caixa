import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, ilike, lte, or, sql, type SQL } from 'drizzle-orm';
import { AccountsService } from '../accounts/accounts.service.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { accounts, syncRuns, transactions } from '../database/schema.js';
import { categoryLabel } from '../domain/categories.js';
import { addDays, today } from '../domain/dates.js';
import type { Cents, IsoDate, PaymentMethod, TransactionStatus } from '../domain/finance.js';
import { formatBRL } from '../domain/money.js';
import { monthOf, monthRange, monthsBetween, shiftMonth, type IsoMonth } from '../domain/months.js';
import { isActiveIn } from '../domain/planning.js';
import { PlanningService } from '../planning/planning.service.js';
import {
  type AnalyzedTransaction,
  detectRecurrences,
  kindOf,
  monthlyTotals,
  monthsInRange,
  spendingByCategory,
  type TransactionKind,
} from './aggregate.js';

/** Erro de uso da ferramenta (filtro inválido etc.): a mensagem vai para o Claude. */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolInputError';
  }
}

export const TRANSACTION_TYPES = [
  'todas',
  'gastos',
  'receitas',
  'pagamentos_fatura',
  'transferencias_proprias',
] as const;
export type TransactionTypeFilter = (typeof TRANSACTION_TYPES)[number];

const KIND_BY_FILTER: Record<Exclude<TransactionTypeFilter, 'todas'>, TransactionKind> = {
  gastos: 'GASTO',
  receitas: 'RECEITA',
  pagamentos_fatura: 'PAGAMENTO_FATURA',
  transferencias_proprias: 'TRANSFERENCIA_PROPRIA',
};

export interface SearchTransactionsInput {
  de?: IsoDate;
  ate?: IsoDate;
  conta_id?: string;
  categoria?: string;
  texto?: string;
  tipo: TransactionTypeFilter;
  ordenar: 'recentes' | 'maior_valor';
  limite: number;
}

export interface PeriodInput {
  de?: IsoDate;
  ate?: IsoDate;
}

/** Dinheiro nas respostas: centavos (para contas) e o texto em reais (para ler). */
export interface Money {
  centavos: Cents;
  brl: string;
}

export const money = (cents: Cents): Money => ({ centavos: cents, brl: formatBRL(cents) });

const pct = (part: number, whole: number): number | null =>
  whole === 0 ? null : Math.round((part / whole) * 1000) / 10;

/** Meses fechados usados como base das médias. */
const BASE_MONTHS = 3;
/** Teto de itens devolvidos pela detecção de recorrências. */
const MAX_RECURRENCES = 60;

type LoadedTransaction = AnalyzedTransaction & {
  status: TransactionStatus;
  paymentMethod: PaymentMethod | null;
  originalCategory: string | null;
};

/**
 * Dados para a análise financeira do Claude, já agregados e formatados.
 * Não conhece MCP nem a API da Anthropic: as ferramentas (`tools.ts`) chamam
 * estes métodos e cada protocolo só embrulha o resultado.
 */
@Injectable()
export class InsightsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly accounts: AccountsService,
    private readonly planning: PlanningService,
  ) {}

  today(): IsoDate {
    return today(this.env.TIMEZONE);
  }

  // ------------------------------------------------------------------ resumo

  async summary() {
    const todayDate = this.today();
    const month = monthOf(todayDate);
    const previous = shiftMonth(month, -1);
    const [accountRows, connectionRows, txs, lastSync] = await Promise.all([
      this.accounts.listAccounts(),
      this.accounts.listConnections(),
      this.loadTransactions({ from: monthRange(previous).from, to: todayDate }),
      this.lastSync(),
    ]);
    const cash = accountRows.filter((account) => account.type !== 'CREDIT_CARD');
    const cards = accountRows.filter((account) => account.type === 'CREDIT_CARD');
    const sum = (values: (number | null)[]) => values.reduce<number>((t, v) => t + (v ?? 0), 0);
    const cashTotal = sum(cash.map((account) => account.balance));
    const cardDebt = sum(cards.map((account) => account.balance));
    const [previousTotals, currentTotals] = monthlyTotals(txs, [previous, month]);

    return {
      hoje: todayDate,
      saldo_em_contas: money(cashTotal),
      divida_cartoes: money(cardDebt),
      saldo_menos_divida_cartoes: money(cashTotal - cardDebt),
      limite_total_cartoes: money(sum(cards.map((account) => account.creditLimit))),
      limite_disponivel_cartoes: money(sum(cards.map((account) => account.availableCredit))),
      quantidade_de_contas: { contas: cash.length, cartoes: cards.length },
      mes_atual: {
        mes: month,
        periodo: { de: monthRange(month).from, ate: todayDate },
        parcial: true,
        ...monthResult(currentTotals!),
      },
      mes_anterior: {
        mes: previous,
        periodo: monthRange(previous),
        ...monthResult(previousTotals!),
      },
      conexoes: connectionRows.map((connection) => ({
        banco: connection.institutionName,
        status: connection.status,
        atualizada_no_banco_em: connection.lastRefreshedAt?.toISOString() ?? null,
      })),
      ultima_sincronizacao: lastSync,
    };
  }

  // ------------------------------------------------------------------ contas

  async listAccounts() {
    const rows = await this.accounts.listAccounts();
    return {
      contas: rows.map((account) => ({
        id: account.id,
        banco: account.institutionName,
        tipo: account.type,
        nome: account.name,
        numero: account.number,
        moeda: account.currency,
        saldo: money(account.balance),
        limite: account.creditLimit === null ? null : money(account.creditLimit),
        limite_disponivel: account.availableCredit === null ? null : money(account.availableCredit),
        transacoes_sincronizadas_ate: account.transactionsSyncedThrough,
        status_da_conexao: account.connectionStatus,
      })),
      observacao:
        'Em CREDIT_CARD, "saldo" é o valor em aberto no cartão (quanto se deve); nas demais, o saldo disponível.',
    };
  }

  // -------------------------------------------------------------- transações

  async searchTransactions(input: SearchTransactionsInput) {
    const period = this.period(input, (to) => addDays(to, -30));
    const rows = await this.loadTransactions(period, {
      accountId: input.conta_id,
      category: input.categoria,
      text: input.texto,
    });
    const wanted = input.tipo === 'todas' ? null : KIND_BY_FILTER[input.tipo];
    const matched = wanted ? rows.filter((tx) => kindOf(tx) === wanted) : rows;
    const ordered =
      input.ordenar === 'maior_valor'
        ? [...matched].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
        : matched;
    const returned = ordered.slice(0, input.limite);
    const spending = matched.filter((tx) => kindOf(tx) === 'GASTO');
    const income = matched.filter((tx) => kindOf(tx) === 'RECEITA');

    return {
      periodo: { de: period.from, ate: period.to },
      filtros: {
        conta_id: input.conta_id ?? null,
        categoria: input.categoria ?? null,
        texto: input.texto ?? null,
        tipo: input.tipo,
        ordenar: input.ordenar,
      },
      encontradas: matched.length,
      retornadas: returned.length,
      truncado: matched.length > returned.length,
      soma_gastos: money(spending.reduce((sum, tx) => sum - tx.amount, 0)),
      soma_receitas: money(income.reduce((sum, tx) => sum + tx.amount, 0)),
      transacoes: returned.map((tx) => ({
        id: tx.id,
        data: tx.date,
        descricao: tx.description,
        contraparte: tx.counterpartyName,
        valor: money(tx.amount),
        tipo: kindOf(tx),
        categoria: tx.category,
        categoria_nome: categoryLabel(tx.category),
        categoria_editada_pelo_usuario: tx.category !== tx.originalCategory,
        conta: tx.accountName,
        tipo_conta: tx.accountType,
        forma_pagamento: tx.paymentMethod,
        parcela: tx.installment ? `${tx.installment.number}/${tx.installment.total}` : null,
        status: tx.status,
      })),
    };
  }

  // -------------------------------------------------------------- categorias

  async spendingByCategory(input: PeriodInput) {
    // Padrão: os últimos 3 meses fechados.
    const lastClosed = shiftMonth(monthOf(this.today()), -1);
    const period = this.period(
      input,
      (to) => monthRange(shiftMonth(monthOf(to), 1 - BASE_MONTHS)).from,
      input.de ? undefined : monthRange(lastClosed).to,
    );
    const months = monthsInRange(period.from, period.to);
    const txs = await this.loadTransactions(period);
    const categories = spendingByCategory(txs, months);
    const total = categories.reduce((sum, category) => sum + category.total, 0);

    return {
      periodo: { de: period.from, ate: period.to },
      meses: months,
      periodo_inclui_mes_incompleto: !isWholeMonths(period),
      total_gastos: money(total),
      media_mensal_gastos: money(Math.round(total / months.length)),
      categorias: categories.map((category) => {
        const [before, last] = category.byMonth.slice(-2);
        return {
          categoria: category.category,
          categoria_nome: categoryLabel(category.category),
          total: money(category.total),
          transacoes: category.count,
          participacao_pct: pct(category.total, total),
          media_mensal: money(Math.round(category.total / months.length)),
          por_mes: category.byMonth.map((entry) => ({
            mes: entry.month,
            total: money(entry.total),
          })),
          variacao_ultimo_mes:
            before && last
              ? {
                  mes_anterior: before.month,
                  mes: last.month,
                  diferenca: money(last.total - before.total),
                  variacao_pct: pct(last.total - before.total, before.total),
                }
              : null,
        };
      }),
    };
  }

  // ----------------------------------------------------------- fluxo de caixa

  async cashFlow(input: { meses: number; incluir_mes_atual: boolean }) {
    const todayDate = this.today();
    const current = monthOf(todayDate);
    const lastMonth = input.incluir_mes_atual ? current : shiftMonth(current, -1);
    const months = Array.from({ length: input.meses }, (_, i) =>
      shiftMonth(lastMonth, i - input.meses + 1),
    );
    const period = {
      from: monthRange(months[0]!).from,
      to: lastMonth === current ? todayDate : monthRange(lastMonth).to,
    };
    const totals = monthlyTotals(await this.loadTransactions(period), months);
    const closed = totals.filter((row) => row.month !== current);
    const average = (pick: (row: (typeof totals)[number]) => number) =>
      closed.length === 0
        ? null
        : money(Math.round(closed.reduce((sum, row) => sum + pick(row), 0) / closed.length));

    return {
      periodo: { de: period.from, ate: period.to },
      meses: totals.map((row) => ({
        mes: row.month,
        parcial: row.month === current,
        receitas: money(row.income),
        gastos: money(row.spending),
        resultado: money(row.net),
        taxa_de_poupanca_pct: pct(row.net, row.income),
        fora_da_conta: {
          pagamentos_de_fatura: money(row.cardPayments),
          transferencias_para_contas_proprias: money(row.ownTransfersOut),
        },
      })),
      media_meses_fechados: {
        meses: closed.length,
        receitas: average((row) => row.income),
        gastos: average((row) => row.spending),
        resultado: average((row) => row.net),
      },
    };
  }

  // ------------------------------------------------------------ recorrências

  async recurrences(input: { meses: number; minimo_meses: number }) {
    const todayDate = this.today();
    const current = monthOf(todayDate);
    const period = { from: monthRange(shiftMonth(current, 1 - input.meses)).from, to: todayDate };
    const minMonths = Math.min(input.minimo_meses, input.meses);
    const found = detectRecurrences(await this.loadTransactions(period), {
      today: todayDate,
      minMonths,
    });
    const items = found.slice(0, MAX_RECURRENCES);
    const activeMonthly = found.filter((r) => r.active && r.pattern !== 'PARCELAMENTO');

    return {
      periodo: { de: period.from, ate: period.to },
      criterio: `Mesma origem (contraparte ou descrição normalizada) com gasto em pelo menos ${minMonths} meses distintos. "ativa" = cobrada nos últimos 40 dias.`,
      encontradas: found.length,
      truncado: found.length > items.length,
      custo_mensal_estimado_ativas: money(
        activeMonthly.reduce((sum, r) => sum + r.estimatedMonthlyCost, 0),
      ),
      recorrencias: items.map((r) => ({
        descricao: r.label,
        contraparte: r.counterpartyName,
        categoria: r.category,
        categoria_nome: categoryLabel(r.category),
        padrao: r.pattern,
        ativa: r.active,
        ocorrencias: r.occurrences,
        meses_com_cobranca: r.monthsSeen,
        media_cobrancas_por_mes: r.averagePerMonth,
        valor_tipico: money(r.typicalAmount),
        valor_minimo: money(r.minAmount),
        valor_maximo: money(r.maxAmount),
        ultimo_valor: money(r.lastAmount),
        valor_estavel: r.stableAmount,
        primeira_cobranca: r.firstDate,
        ultima_cobranca: r.lastDate,
        total_no_periodo: money(r.total),
        custo_mensal_estimado: money(r.estimatedMonthlyCost),
        custo_anual_estimado: r.installment ? null : money(r.estimatedMonthlyCost * 12),
        parcelas: r.installment
          ? {
              atual: r.installment.current,
              total: r.installment.total,
              restantes: r.installment.remaining,
              falta_pagar: money(r.installment.remaining * r.lastAmount),
            }
          : null,
        contas: r.accounts,
      })),
    };
  }

  // ------------------------------------------------------------ planejamento

  async planningOverview() {
    const todayDate = this.today();
    const current = monthOf(todayDate);
    const closed = Array.from({ length: BASE_MONTHS }, (_, i) =>
      shiftMonth(current, i - BASE_MONTHS),
    );
    const [overview, txs] = await Promise.all([
      this.planning.overview(),
      this.loadTransactions({ from: monthRange(closed[0]!).from, to: todayDate }),
    ]);
    const spending = spendingByCategory(txs, [...closed, current]);
    const spentIn = (sources: Set<string | null>, months: IsoMonth[]) =>
      spending
        .filter((category) => sources.has(category.category))
        .flatMap((category) => category.byMonth)
        .filter((entry) => months.includes(entry.month))
        .reduce((sum, entry) => sum + entry.total, 0);
    const average = (sources: Set<string | null>) =>
      Math.round(spentIn(sources, closed) / BASE_MONTHS);

    const categoryNames = new Map(overview.categories.map((c) => [c.id, c.name]));
    const budgeted = new Set<string | null>(overview.categories.flatMap((c) => c.sourceCategories));
    const unbudgeted = new Set(
      spending.map((c) => c.category).filter((category) => !budgeted.has(category)),
    );
    const byKind = (kind: 'ESSENTIAL' | 'DISCRETIONARY') =>
      average(
        new Set(
          overview.categories.filter((c) => c.kind === kind).flatMap((c) => c.sourceCategories),
        ),
      );
    const activeCommitments = overview.commitments.filter((commitment) =>
      isActiveIn({ ...commitment, installmentsTotal: null }, current),
    );

    return {
      hoje: todayDate,
      meses_base_das_medias: closed,
      compromissos_fixos: overview.commitments.map((commitment) => ({
        nome: commitment.name,
        valor: money(commitment.amount),
        dia_do_mes: commitment.dayOfMonth,
        forma_pagamento: commitment.paymentMethod,
        categoria: commitment.categoryId
          ? (categoryNames.get(commitment.categoryId) ?? null)
          : null,
        inicio: commitment.startsOn,
        fim: commitment.endsOn,
        parcelas: commitment.installments
          ? { pagas: commitment.installments.paid, total: commitment.installments.total }
          : null,
        ativo_no_mes_atual: activeCommitments.includes(commitment),
        observacoes: commitment.notes,
      })),
      total_compromissos_mes_atual: money(activeCommitments.reduce((sum, c) => sum + c.amount, 0)),
      metas: overview.goals.map((goal) => {
        const remaining = Math.max(0, goal.target - goal.saved);
        const monthsLeft = Math.max(0, monthsBetween(current, monthOf(goal.targetDate)));
        const needed = remaining === 0 ? 0 : Math.ceil(remaining / Math.max(1, monthsLeft));
        return {
          nome: goal.name,
          alvo: money(goal.target),
          guardado: money(goal.saved),
          falta: money(remaining),
          progresso_pct: pct(goal.saved, goal.target),
          data_alvo: goal.targetDate,
          meses_ate_a_data_alvo: monthsLeft,
          aporte_mensal_planejado: money(goal.monthlyContribution),
          aporte_mensal_necessario: money(needed),
          no_ritmo: goal.monthlyContribution >= needed,
        };
      }),
      categorias_de_orcamento: overview.categories.map((category) => {
        const sources = new Set<string | null>(category.sourceCategories);
        const thisMonth = spentIn(sources, [current]);
        const avg = average(sources);
        return {
          nome: category.name,
          tipo: category.kind === 'ESSENTIAL' ? 'ESSENCIAL' : 'DISCRICIONARIO',
          categorias_do_agregador: category.sourceCategories,
          teto_mensal: category.monthlyBudget === null ? null : money(category.monthlyBudget),
          gasto_mes_atual: money(thisMonth),
          media_mensal_meses_base: money(avg),
          uso_do_teto_mes_atual_pct:
            category.monthlyBudget === null ? null : pct(thisMonth, category.monthlyBudget),
          media_acima_do_teto:
            category.monthlyBudget === null ? null : avg > category.monthlyBudget,
        };
      }),
      gasto_medio_por_tipo: {
        essencial: money(byKind('ESSENTIAL')),
        discricionario: money(byKind('DISCRETIONARY')),
        sem_categoria_de_orcamento: money(average(unbudgeted)),
        categorias_sem_orcamento: [...unbudgeted].map(categoryLabel),
      },
      projecao_proximos_meses: overview.projections.map((projection) => ({
        mes: projection.month,
        renda_esperada: money(projection.expectedIncome),
        compromissos: money(projection.commitments),
        aportes_em_metas: money(projection.goalContributions),
        gasto_variavel_esperado: money(projection.expectedVariableSpending),
        saldo_projetado: money(projection.projectedBalance),
      })),
      como_a_projecao_e_calculada:
        'Renda média dos 3 meses fechados − compromissos ativos no mês − aportes das metas ainda não atingidas − gasto variável médio (gasto total médio menos os compromissos).',
    };
  }

  // ---------------------------------------------------------------- suporte

  /** Período pedido ou o padrão (`ate` padrão = hoje), validado. */
  private period(
    input: PeriodInput,
    defaultFrom: (to: IsoDate) => IsoDate,
    defaultTo: IsoDate = this.today(),
  ): { from: IsoDate; to: IsoDate } {
    const to = input.ate ?? defaultTo;
    const from = input.de ?? defaultFrom(to);
    if (from > to) throw new ToolInputError('"de" deve ser anterior ou igual a "ate"');
    return { from, to };
  }

  /** Transações do período com a categoria efetiva e a conta, mais recentes primeiro. */
  private async loadTransactions(
    period: { from: IsoDate; to: IsoDate },
    filters: { accountId?: string; category?: string; text?: string } = {},
  ): Promise<LoadedTransaction[]> {
    const effectiveCategory = sql<
      string | null
    >`coalesce(${transactions.userCategory}, ${transactions.category})`;
    const conditions: (SQL | undefined)[] = [
      gte(transactions.date, period.from),
      lte(transactions.date, period.to),
      filters.accountId ? eq(transactions.accountId, filters.accountId) : undefined,
      filters.category ? ilike(effectiveCategory, escapeLike(filters.category)) : undefined,
    ];
    if (filters.text) {
      const pattern = `%${escapeLike(filters.text)}%`;
      conditions.push(
        or(ilike(transactions.description, pattern), ilike(transactions.counterpartyName, pattern)),
      );
    }
    const rows = await this.db
      .select({
        id: transactions.id,
        date: transactions.date,
        description: transactions.description,
        counterpartyName: transactions.counterpartyName,
        amount: transactions.amount,
        category: transactions.category,
        userCategory: transactions.userCategory,
        installmentNumber: transactions.installmentNumber,
        installmentTotal: transactions.installmentTotal,
        status: transactions.status,
        paymentMethod: transactions.paymentMethod,
        accountId: transactions.accountId,
        accountName: accounts.name,
        accountType: accounts.type,
      })
      .from(transactions)
      .innerJoin(accounts, eq(transactions.accountId, accounts.id))
      .where(and(...conditions))
      .orderBy(desc(transactions.date), desc(transactions.id));

    return rows.map((row) => ({
      id: row.id,
      date: row.date,
      description: row.description,
      counterpartyName: row.counterpartyName,
      amount: row.amount,
      category: row.userCategory ?? row.category,
      originalCategory: row.category,
      installment:
        row.installmentNumber !== null && row.installmentTotal !== null
          ? { number: row.installmentNumber, total: row.installmentTotal }
          : null,
      status: row.status,
      paymentMethod: row.paymentMethod,
      accountId: row.accountId,
      accountName: row.accountName,
      accountType: row.accountType,
    }));
  }

  private async lastSync() {
    const [run] = await this.db.select().from(syncRuns).orderBy(desc(syncRuns.startedAt)).limit(1);
    if (!run) return null;
    return {
      status: run.status,
      origem: run.trigger,
      iniciada_em: run.startedAt.toISOString(),
      terminada_em: run.finishedAt?.toISOString() ?? null,
      erros: run.errors,
    };
  }
}

function monthResult(totals: { income: Cents; spending: Cents; net: Cents }) {
  return {
    receitas: money(totals.income),
    gastos: money(totals.spending),
    resultado: money(totals.net),
    taxa_de_poupanca_pct: pct(totals.net, totals.income),
  };
}

function isWholeMonths(period: { from: IsoDate; to: IsoDate }): boolean {
  return period.from.endsWith('-01') && monthRange(monthOf(period.to)).to === period.to;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
