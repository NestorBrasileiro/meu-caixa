import {
  bigint,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  ACCOUNT_TYPES,
  CONNECTION_STATUSES,
  PAYMENT_METHODS,
  TRANSACTION_STATUSES,
} from '../domain/finance.js';

/**
 * Postgres é a fonte de verdade do app: o provedor só alimenta estas tabelas
 * via sincronização. Valores monetários em centavos (bigint).
 */

export const connectionStatus = pgEnum('connection_status', CONNECTION_STATUSES);
export const accountType = pgEnum('account_type', ACCOUNT_TYPES);
export const transactionStatus = pgEnum('transaction_status', TRANSACTION_STATUSES);
export const paymentMethod = pgEnum('payment_method', PAYMENT_METHODS);

export const SYNC_RUN_STATUSES = ['RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED'] as const;
export const SYNC_TRIGGERS = ['SCHEDULED', 'STARTUP', 'MANUAL'] as const;
export const syncRunStatus = pgEnum('sync_run_status', SYNC_RUN_STATUSES);
export const syncTrigger = pgEnum('sync_trigger', SYNC_TRIGGERS);

const money = (name: string) => bigint(name, { mode: 'number' });

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

/** Identificação do registro no provedor de origem. */
const providerRef = {
  provider: text('provider').notNull(),
  externalId: text('external_id').notNull(),
};

export const connections = pgTable(
  'connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...providerRef,
    institutionName: text('institution_name').notNull(),
    institutionLogoUrl: text('institution_logo_url'),
    status: connectionStatus('status').notNull(),
    lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex('connections_provider_external_id_key').on(t.provider, t.externalId)],
);

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'cascade' }),
    ...providerRef,
    type: accountType('type').notNull(),
    name: text('name').notNull(),
    number: text('number'),
    currency: text('currency').notNull(),
    balance: money('balance').notNull(),
    creditLimit: money('credit_limit'),
    availableCredit: money('available_credit'),
    /** Até que dia as transações já foram sincronizadas (base do incremental). */
    transactionsSyncedThrough: date('transactions_synced_through', { mode: 'string' }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('accounts_provider_external_id_key').on(t.provider, t.externalId),
    index('accounts_connection_id_idx').on(t.connectionId),
  ],
);

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    ...providerRef,
    date: date('date', { mode: 'string' }).notNull(),
    description: text('description').notNull(),
    amount: money('amount').notNull(),
    status: transactionStatus('status').notNull(),
    category: text('category'),
    paymentMethod: paymentMethod('payment_method'),
    counterpartyName: text('counterparty_name'),
    installmentNumber: integer('installment_number'),
    installmentTotal: integer('installment_total'),
    invoiceExternalId: text('invoice_external_id'),
    /** Categoria escolhida pelo usuário; o sync nunca sobrescreve. */
    userCategory: text('user_category'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('transactions_provider_external_id_key').on(t.provider, t.externalId),
    index('transactions_account_id_date_idx').on(t.accountId, t.date),
    index('transactions_date_idx').on(t.date),
  ],
);

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    ...providerRef,
    dueDate: date('due_date', { mode: 'string' }).notNull(),
    closingDate: date('closing_date', { mode: 'string' }),
    total: money('total').notNull(),
    minimumPayment: money('minimum_payment'),
    currency: text('currency').notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('invoices_provider_external_id_key').on(t.provider, t.externalId),
    index('invoices_account_id_due_date_idx').on(t.accountId, t.dueDate),
  ],
);

export interface SyncStats {
  connections: number;
  accounts: number;
  transactions: number;
  removedPendingTransactions: number;
  invoices: number;
}

export const syncRuns = pgTable(
  'sync_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    provider: text('provider').notNull(),
    trigger: syncTrigger('trigger').notNull(),
    status: syncRunStatus('status').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    stats: jsonb('stats').$type<SyncStats>(),
    errors: jsonb('errors').$type<string[]>().notNull().default([]),
  },
  (t) => [index('sync_runs_started_at_idx').on(t.startedAt)],
);

// ------------------------------------------------------------- planejamento

export const BUDGET_CATEGORY_KINDS = ['ESSENTIAL', 'DISCRETIONARY'] as const;
export const budgetCategoryKind = pgEnum('budget_category_kind', BUDGET_CATEGORY_KINDS);

/** Categoria de orçamento: agrupa categorias do agregador e tem um teto mensal. */
export const budgetCategories = pgTable('budget_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  kind: budgetCategoryKind('kind').notNull(),
  /** Categorias do agregador (ex.: "Groceries") que caem aqui. */
  sourceCategories: jsonb('source_categories').$type<string[]>().notNull().default([]),
  monthlyBudget: money('monthly_budget'),
  position: integer('position').notNull().default(0),
  ...timestamps,
});

/** Compromisso fixo recorrente (ex.: parcela do terreno). */
export const commitments = pgTable(
  'commitments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    amount: money('amount').notNull(),
    dayOfMonth: integer('day_of_month').notNull(),
    paymentMethod: paymentMethod('payment_method').notNull(),
    categoryId: uuid('category_id').references(() => budgetCategories.id, { onDelete: 'set null' }),
    startsOn: date('starts_on', { mode: 'string' }).notNull(),
    endsOn: date('ends_on', { mode: 'string' }),
    /** Total de parcelas, para financiamentos; as pagas são derivadas da data. */
    installmentsTotal: integer('installments_total'),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [index('commitments_category_id_idx').on(t.categoryId)],
);

/** Meta de economia (ex.: entrada do carro). */
export const goals = pgTable('goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  target: money('target').notNull(),
  saved: money('saved').notNull().default(0),
  targetDate: date('target_date', { mode: 'string' }).notNull(),
  monthlyContribution: money('monthly_contribution').notNull(),
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  ...timestamps,
});

export type ConnectionRow = typeof connections.$inferSelect;
export type AccountRow = typeof accounts.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
export type InvoiceRow = typeof invoices.$inferSelect;
export type SyncRunRow = typeof syncRuns.$inferSelect;
export type BudgetCategoryRow = typeof budgetCategories.$inferSelect;
export type CommitmentRow = typeof commitments.$inferSelect;
export type GoalRow = typeof goals.$inferSelect;
export type SyncStatus = (typeof SYNC_RUN_STATUSES)[number];
export type SyncTrigger = (typeof SYNC_TRIGGERS)[number];

/** Sessões do express-session (login via Keycloak). */
export const sessions = pgTable(
  'sessions',
  {
    sid: text('sid').primaryKey(),
    data: jsonb('data').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('sessions_expires_at_idx').on(t.expiresAt)],
);
