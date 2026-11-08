import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, gte, lte, or } from 'drizzle-orm';
import { AccountsService } from '../accounts/accounts.service.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { accounts, connections, transactions } from '../database/schema.js';
import { today } from '../domain/dates.js';
import type { Cents, IsoDate } from '../domain/finance.js';
import { monthOf, monthRange, monthsBetween, shiftMonth, type IsoMonth } from '../domain/months.js';
import { isActiveIn } from '../domain/planning.js';
import {
  type AnalyzedTransaction,
  detectRecurrences,
  kindOf,
  monthlyTotals,
  monthsInRange,
  spendingByCategory,
} from '../insights/aggregate.js';
import { AnalysisService } from '../insights/analysis.service.js';
import { LoansService } from '../loans/loans.service.js';
import { PlanningService } from '../planning/planning.service.js';
import { SyncService } from '../sync/sync.service.js';
import { TransactionsService } from '../transactions/transactions.service.js';
import type { SectionId } from './export.catalog.js';
import { formatDate, formatDateTime, syncStatusLabel } from './export-format.js';
import type {
  AccountInfo,
  CardInfo,
  CardInstallmentInfo,
  CashFlowMonth,
  CashFlowTotals,
  ExportReport,
  ExportSectionData,
  InvoiceInfo,
  LastSyncInfo,
  TransactionInfo,
} from './export-report.js';

/** Transações lidas por página (keyset), para não segurar um resultado gigante de uma vez. */
const TRANSACTION_PAGE_SIZE = 2_000;
/** Janela mínima (meses, contando o último) para detectar recorrências. */
const RECURRENCE_WINDOW_MONTHS = 6;
const RECURRENCE_MIN_MONTHS = 3;
/** Sem atualização há mais que isso, a conexão ganha um aviso. */
const STALE_CONNECTION_DAYS = 3;
const STALE_SYNC_HOURS = 48;

type LoadedTransaction = AnalyzedTransaction & TransactionInfo;

export interface ExportDataRequest {
  from: IsoDate;
  to: IsoDate;
  sections: SectionId[];
  adjustments?: string[];
}

/** Guarda o resultado da 1ª chamada: cada fonte é lida uma vez por exportação. */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | undefined;
  return () => (promise ??= load());
}

/**
 * Monta o `ExportReport` a partir dos serviços que já existem (contas,
 * transações, faturas, planejamento, empréstimos, análises, sincronização).
 * Só lê o que as seções pedidas precisam. Mesmas regras do app: pagamento de
 * fatura e transferência entre contas próprias não são gasto nem renda.
 */
@Injectable()
export class ExportDataService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly accounts: AccountsService,
    private readonly transactions: TransactionsService,
    private readonly planning: PlanningService,
    private readonly analysis: AnalysisService,
    private readonly loans: LoansService,
    private readonly sync: SyncService,
  ) {}

  today(): IsoDate {
    return today(this.env.TIMEZONE);
  }

  /** Relatório só com os dados de `userId`: cada fonte abaixo filtra pelo dono. */
  async build(
    userId: string,
    request: ExportDataRequest,
    now: Date = new Date(),
  ): Promise<ExportReport> {
    const todayDate = today(this.env.TIMEZONE, now);
    const timezone = this.env.TIMEZONE;
    const period = { from: request.from, to: request.to };
    const months = monthsInRange(period.from, period.to);
    const wants = (id: SectionId) => request.sections.includes(id);

    const recurrenceFrom = minDate(
      period.from,
      monthRange(shiftMonth(monthOf(period.to), 1 - RECURRENCE_WINDOW_MONTHS)).from,
    );
    const loadAccounts = once(() => this.accounts.listAccounts(userId));
    const loadConnections = once(() => this.accounts.listConnections(userId));
    const loadInvoices = once(() => this.transactions.listInvoices(userId, {}));
    const loadPlanning = once(() => this.planning.overview(userId));
    const loadLoans = once(() => this.loans.list(userId));
    const loadLastSync = once(() => this.lastSync(userId));
    // Com recorrências, lê a janela maior uma vez e filtra o período em memória.
    const loadWindow = once(() =>
      this.loadTransactions(
        userId,
        wants('recorrencias') ? recurrenceFrom : period.from,
        period.to,
      ),
    );
    const loadPeriod = once(async () =>
      (await loadWindow()).filter((tx) => tx.date >= period.from),
    );

    const cardsInfo = once(async () =>
      buildCards(await loadAccounts(), await loadInvoices(), todayDate),
    );
    const installmentsInfo = once(async () =>
      (await loadPlanning()).cardInstallments.map((item): CardInstallmentInfo => ({
        description: item.description,
        cardName: item.cardName,
        amount: item.amount,
        paid: item.installments.paid,
        total: item.installments.total,
        current: Math.min(item.installments.paid + 1, item.installments.total),
        remaining: item.installments.total - item.installments.paid,
        remainingAmount: (item.installments.total - item.installments.paid) * item.amount,
        nextDueDate: item.nextDueDate,
        endsOn: item.endsOn,
      })),
    );
    const flowInfo = once(async () => cashFlow(await loadPeriod(), months, period.from, period.to));

    const builders: { [K in SectionId]: () => Promise<ExportSectionData[K]> } = {
      resumo: async () => {
        const [accountRows, connectionRows, invoiceRows, planning, loans, flow, txs, lastSync] =
          await Promise.all([
            loadAccounts(),
            loadConnections(),
            loadInvoices(),
            loadPlanning(),
            loadLoans(),
            flowInfo(),
            loadPeriod(),
            loadLastSync(),
          ]);
        const installments = await installmentsInfo();
        const cash = accountRows.filter((account) => account.type !== 'CREDIT_CARD');
        const cards = accountRows.filter((account) => account.type === 'CREDIT_CARD');
        const loansWithBalance = loans.filter((loan) => loan.outstandingBalance !== null);
        const current = monthOf(todayDate);
        return {
          totals: {
            cashBalance: sum(cash.map((account) => account.balance)),
            cardDebt: sum(cards.map((account) => account.balance)),
            cardLimit: sum(cards.map((account) => account.creditLimit)),
            cardAvailable: sum(cards.map((account) => account.availableCredit)),
            openInstallmentsRemaining: sum(installments.map((item) => item.remainingAmount)),
            loansOutstanding:
              loansWithBalance.length === 0
                ? null
                : sum(loansWithBalance.map((loan) => loan.outstandingBalance)),
            monthlyCommitments: sum(
              planning.commitments
                .filter((c) => isActiveIn({ ...c, installmentsTotal: null }, current))
                .map((c) => c.amount),
            ),
          },
          periodResult: sumFlow(flow),
          counts: {
            connections: connectionRows.length,
            accounts: cash.length,
            cards: cards.length,
            transactions: txs.length,
            invoices: invoiceRows.length,
            openInstallments: installments.length,
            loans: loans.length,
            commitments: planning.commitments.length,
            goals: planning.goals.length,
          },
          connections: connectionRows.map((connection) => ({
            institutionName: connection.institutionName,
            status: connection.status,
            lastRefreshedAt: connection.lastRefreshedAt?.toISOString() ?? null,
          })),
          warnings: freshnessWarnings({
            connections: connectionRows,
            accounts: accountRows,
            lastSync,
            periodTo: period.to,
            now,
            timezone,
          }),
        };
      },

      contas: async () =>
        (await loadAccounts()).map((account): AccountInfo => ({
          institutionName: account.institutionName,
          type: account.type,
          name: account.name,
          number: account.number,
          currency: account.currency,
          balance: account.balance,
          creditLimit: account.creditLimit,
          availableCredit: account.availableCredit,
          transactionsSyncedThrough: account.transactionsSyncedThrough,
          connectionStatus: account.connectionStatus,
        })),

      cartoes: cardsInfo,

      faturas: async () => {
        const [accountRows, invoiceRows] = await Promise.all([loadAccounts(), loadInvoices()]);
        const byId = new Map(accountRows.map((account) => [account.id, account]));
        return invoiceRows
          .filter((invoice) => invoice.dueDate >= period.from)
          .map((invoice): InvoiceInfo => {
            const card = byId.get(invoice.accountId);
            return {
              institutionName: card?.institutionName ?? '',
              cardName: card?.name ?? '',
              closingDate: invoice.closingDate,
              dueDate: invoice.dueDate,
              total: invoice.total,
              minimumPayment: invoice.minimumPayment,
              upcoming: invoice.dueDate >= todayDate,
            };
          })
          .sort(
            (a, b) =>
              a.institutionName.localeCompare(b.institutionName) ||
              a.cardName.localeCompare(b.cardName) ||
              b.dueDate.localeCompare(a.dueDate),
          );
      },

      parcelamentos: installmentsInfo,

      emprestimos: () => loadLoans(),

      compromissos: async () => {
        const planning = await loadPlanning();
        const categoryNames = new Map(planning.categories.map((c) => [c.id, c.name]));
        const current = monthOf(todayDate);
        return planning.commitments.map((commitment) => {
          const remaining = commitment.installments
            ? Math.max(0, commitment.installments.total - commitment.installments.paid)
            : 0;
          return {
            name: commitment.name,
            amount: commitment.amount,
            dayOfMonth: commitment.dayOfMonth,
            paymentMethod: commitment.paymentMethod,
            category: commitment.categoryId
              ? (categoryNames.get(commitment.categoryId) ?? null)
              : null,
            startsOn: commitment.startsOn,
            endsOn: commitment.endsOn,
            installments: commitment.installments
              ? {
                  paid: commitment.installments.paid,
                  total: commitment.installments.total,
                  remaining,
                  remainingAmount: remaining * commitment.amount,
                }
              : null,
            activeThisMonth: isActiveIn({ ...commitment, installmentsTotal: null }, current),
            notes: commitment.notes,
          };
        });
      },

      metas: async () => {
        const current = monthOf(todayDate);
        return (await loadPlanning()).goals.map((goal) => {
          const remaining = Math.max(0, goal.target - goal.saved);
          const monthsLeft = Math.max(0, monthsBetween(current, monthOf(goal.targetDate)));
          const needed = remaining === 0 ? 0 : Math.ceil(remaining / Math.max(1, monthsLeft));
          return {
            name: goal.name,
            target: goal.target,
            saved: goal.saved,
            remaining,
            progress: goal.target === 0 ? null : goal.saved / goal.target,
            targetDate: goal.targetDate,
            monthsLeft,
            monthlyContribution: goal.monthlyContribution,
            monthlyNeeded: needed,
            onTrack: goal.monthlyContribution >= needed,
          };
        });
      },

      orcamento: async () => {
        const [planning, txs] = await Promise.all([loadPlanning(), loadPeriod()]);
        const spending = spendingByCategory(txs, months);
        const spentIn = (sources: Set<string | null>, month: IsoMonth) =>
          spending
            .filter((category) => sources.has(category.category))
            .reduce(
              (total, category) =>
                total + (category.byMonth.find((entry) => entry.month === month)?.total ?? 0),
              0,
            );
        const budgeted = new Set<string | null>(
          planning.categories.flatMap((c) => c.sourceCategories),
        );
        const unbudgeted = new Set(
          spending.map((c) => c.category).filter((category) => !budgeted.has(category)),
        );
        const rows = months.flatMap((month) => {
          const partialMonth = isPartialMonth(month, period.from, period.to);
          const budgetRows = planning.categories.map((category) => {
            const spent = spentIn(new Set(category.sourceCategories), month);
            const budget = category.monthlyBudget;
            return {
              month,
              category: category.name,
              kind: category.kind,
              budget,
              spent,
              difference: budget === null ? null : budget - spent,
              usage: budget === null || budget === 0 ? null : spent / budget,
              partialMonth,
            };
          });
          const other = spentIn(unbudgeted, month);
          return other > 0 || planning.categories.length === 0
            ? [
                ...budgetRows,
                {
                  month,
                  category: 'Sem categoria de orçamento',
                  kind: null,
                  budget: null,
                  spent: other,
                  difference: null,
                  usage: null,
                  partialMonth,
                },
              ]
            : budgetRows;
        });
        return {
          categories: planning.categories.map((category) => ({
            name: category.name,
            kind: category.kind,
            sourceCategories: category.sourceCategories,
            monthlyBudget: category.monthlyBudget,
          })),
          rows,
        };
      },

      projecao: async () => (await loadPlanning()).projections,

      fluxo: flowInfo,

      categorias: async () => {
        const categories = spendingByCategory(await loadPeriod(), months);
        const total = sum(categories.map((category) => category.total));
        return {
          total,
          monthCount: months.length,
          rows: categories.map((category) => ({
            category: category.category,
            total: category.total,
            count: category.count,
            share: total === 0 ? null : category.total / total,
            monthlyAverage: Math.round(category.total / months.length),
          })),
        };
      },

      recorrencias: async () => {
        const found = detectRecurrences(await loadWindow(), {
          today: period.to,
          minMonths: RECURRENCE_MIN_MONTHS,
        });
        const active = found.filter((r) => r.active && r.pattern !== 'PARCELAMENTO');
        return {
          window: { from: recurrenceFrom, to: period.to },
          minMonths: RECURRENCE_MIN_MONTHS,
          activeMonthlyCost: sum(active.map((r) => r.estimatedMonthlyCost)),
          items: found.map((r) => ({
            label: r.label,
            counterpartyName: r.counterpartyName,
            category: r.category,
            pattern: r.pattern,
            active: r.active,
            occurrences: r.occurrences,
            monthsSeen: r.monthsSeen.length,
            typicalAmount: r.typicalAmount,
            lastAmount: r.lastAmount,
            lastDate: r.lastDate,
            estimatedMonthlyCost: r.estimatedMonthlyCost,
            estimatedYearlyCost: r.installment ? null : r.estimatedMonthlyCost * 12,
            installment: r.installment,
            accounts: r.accounts,
          })),
        };
      },

      transacoes: async () => ({
        items: (await loadPeriod()).map(
          ({ id: _id, accountId: _account, ...tx }): TransactionInfo => tx,
        ),
      }),

      analise: () => this.analysis.latest(userId),
    };

    const data: Partial<ExportSectionData> = {};
    const assign = async <K extends SectionId>(id: K) => {
      data[id] = await builders[id]();
    };
    await Promise.all(request.sections.map((id) => assign(id)));

    return {
      generatedAt: now.toISOString(),
      timezone,
      today: todayDate,
      period: { ...period, months },
      sections: request.sections,
      lastSync: await loadLastSync(),
      adjustments: request.adjustments ?? [],
      data,
    };
  }

  /** Última sincronização registrada (qualquer status). */
  private async lastSync(userId: string): Promise<LastSyncInfo | null> {
    const [run] = await this.sync.listRuns(userId, 1);
    if (!run) return null;
    return {
      status: run.status,
      trigger: run.trigger,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      errors: run.errors,
    };
  }

  /** Transações do período em ordem cronológica, lidas em páginas (keyset por data e id). */
  private async loadTransactions(
    userId: string,
    from: IsoDate,
    to: IsoDate,
  ): Promise<LoadedTransaction[]> {
    const result: LoadedTransaction[] = [];
    let cursor: { date: IsoDate; id: string } | null = null;
    for (;;) {
      const page = await this.db
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
          institutionName: connections.institutionName,
        })
        .from(transactions)
        .innerJoin(accounts, eq(transactions.accountId, accounts.id))
        .innerJoin(connections, eq(accounts.connectionId, connections.id))
        .where(
          and(
            eq(transactions.userId, userId),
            gte(transactions.date, from),
            lte(transactions.date, to),
            cursor
              ? or(
                  gt(transactions.date, cursor.date),
                  and(eq(transactions.date, cursor.date), gt(transactions.id, cursor.id)),
                )
              : undefined,
          ),
        )
        .orderBy(asc(transactions.date), asc(transactions.id))
        .limit(TRANSACTION_PAGE_SIZE);

      for (const row of page) {
        const category = row.userCategory ?? row.category;
        const kind = kindOf({ amount: row.amount, category });
        result.push({
          id: row.id,
          accountId: row.accountId,
          date: row.date,
          institutionName: row.institutionName,
          accountName: row.accountName,
          accountType: row.accountType,
          description: row.description,
          counterpartyName: row.counterpartyName,
          category,
          originalCategory: row.userCategory === null ? null : row.category,
          edited: row.userCategory !== null,
          paymentMethod: row.paymentMethod,
          installment:
            row.installmentNumber !== null && row.installmentTotal !== null
              ? { number: row.installmentNumber, total: row.installmentTotal }
              : null,
          status: row.status,
          amount: row.amount,
          kind,
          internal: kind === 'PAGAMENTO_FATURA' || kind === 'TRANSFERENCIA_PROPRIA',
        });
      }
      if (page.length < TRANSACTION_PAGE_SIZE) return result;
      const last: { date: IsoDate; id: string } = page[page.length - 1]!;
      cursor = { date: last.date, id: last.id };
    }
  }
}

// ------------------------------------------------------------------ suporte

const sum = (values: (number | null)[]): Cents =>
  values.reduce<number>((total, value) => total + (value ?? 0), 0);

const minDate = (a: IsoDate, b: IsoDate) => (a < b ? a : b);

/** O período não cobre o mês inteiro. */
function isPartialMonth(month: IsoMonth, from: IsoDate, to: IsoDate): boolean {
  const range = monthRange(month);
  return from > range.from || to < range.to;
}

function cashFlow(
  txs: AnalyzedTransaction[],
  months: IsoMonth[],
  from: IsoDate,
  to: IsoDate,
): CashFlowMonth[] {
  return monthlyTotals(txs, months).map((row) => ({
    month: row.month,
    partial: isPartialMonth(row.month, from, to),
    income: row.income,
    spending: row.spending,
    net: row.net,
    savingsRate: row.income === 0 ? null : row.net / row.income,
    cardPayments: row.cardPayments,
    ownTransfersOut: row.ownTransfersOut,
  }));
}

function sumFlow(rows: CashFlowMonth[]): CashFlowTotals {
  const income = sum(rows.map((row) => row.income));
  const spending = sum(rows.map((row) => row.spending));
  return {
    income,
    spending,
    net: income - spending,
    savingsRate: income === 0 ? null : (income - spending) / income,
    cardPayments: sum(rows.map((row) => row.cardPayments)),
    ownTransfersOut: sum(rows.map((row) => row.ownTransfersOut)),
  };
}

type AccountRow = Awaited<ReturnType<AccountsService['listAccounts']>>[number];
type InvoiceRow = Awaited<ReturnType<TransactionsService['listInvoices']>>[number];
type ConnectionRow = Awaited<ReturnType<AccountsService['listConnections']>>[number];

function buildCards(accountRows: AccountRow[], invoiceRows: InvoiceRow[], todayDate: IsoDate) {
  return accountRows
    .filter((account) => account.type === 'CREDIT_CARD')
    .map((card): CardInfo => {
      const used =
        card.creditLimit !== null && card.availableCredit !== null
          ? card.creditLimit - card.availableCredit
          : card.balance;
      const open = invoiceRows
        .filter((invoice) => invoice.accountId === card.id && invoice.dueDate >= todayDate)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
      return {
        institutionName: card.institutionName,
        name: card.name,
        number: card.number,
        limit: card.creditLimit,
        used,
        available: card.availableCredit,
        usage: card.creditLimit ? used / card.creditLimit : null,
        openInvoice: open
          ? { total: open.total, closingDate: open.closingDate, dueDate: open.dueDate }
          : null,
      };
    });
}

/** Avisos para quem lê o arquivo saber se os números podem estar velhos. */
export function freshnessWarnings(input: {
  connections: Pick<ConnectionRow, 'institutionName' | 'status' | 'lastRefreshedAt'>[];
  accounts: Pick<AccountRow, 'name' | 'institutionName' | 'transactionsSyncedThrough'>[];
  lastSync: LastSyncInfo | null;
  periodTo: IsoDate;
  now: Date;
  timezone: string;
}): string[] {
  const { now, timezone } = input;
  const warnings: string[] = [];
  if (input.connections.length === 0) {
    warnings.push('Nenhum banco conectado: conecte seus bancos para ter dados na exportação.');
  }
  for (const connection of input.connections) {
    const bank = connection.institutionName;
    if (connection.status === 'ACTION_REQUIRED') {
      warnings.push(
        `${bank}: a conexão precisa de ação (reconecte no Meu Pluggy); os dados deste banco podem estar desatualizados.`,
      );
    } else if (connection.status === 'ERROR') {
      warnings.push(
        `${bank}: a última atualização no banco falhou; os dados podem estar desatualizados.`,
      );
    } else if (connection.status === 'UPDATING') {
      warnings.push(`${bank}: o banco estava atualizando os dados na hora da exportação.`);
    }
    const refreshed = connection.lastRefreshedAt;
    if (refreshed && now.getTime() - refreshed.getTime() > STALE_CONNECTION_DAYS * 24 * 3_600_000) {
      warnings.push(
        `${bank}: dados atualizados no banco pela última vez em ${formatDateTime(refreshed, timezone)}.`,
      );
    }
  }
  for (const account of input.accounts) {
    const through = account.transactionsSyncedThrough;
    if (through && through < input.periodTo) {
      warnings.push(
        `${account.institutionName} — ${account.name}: transações sincronizadas só até ${formatDate(through)}.`,
      );
    }
  }
  const sync = input.lastSync;
  if (!sync) {
    if (input.connections.length > 0) warnings.push('Nenhuma sincronização registrada ainda.');
  } else {
    const when = formatDateTime(sync.startedAt, timezone);
    if (sync.status === 'FAILED' || sync.status === 'PARTIAL') {
      const errors = sync.errors.slice(0, 3).join('; ');
      warnings.push(
        `A última sincronização (${when}) terminou como "${syncStatusLabel(sync.status)}"${errors ? `: ${errors}` : ''}.`,
      );
    }
    if (now.getTime() - new Date(sync.startedAt).getTime() > STALE_SYNC_HOURS * 3_600_000) {
      warnings.push(
        `A última sincronização foi em ${when}: use "Sincronizar agora" para dados mais novos.`,
      );
    }
  }
  return warnings;
}
