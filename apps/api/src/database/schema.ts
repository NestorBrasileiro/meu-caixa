import { sql } from 'drizzle-orm';
import {
  bigint,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
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

/**
 * Usuários do app (quem entra pelo Keycloak). Todo dado pertence a um
 * usuário e some junto com ele (on delete cascade).
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  /**
   * `sub` do Keycloak. Nulo só no usuário criado pela migration 0007 para os
   * dados de antes do multiusuário, até o primeiro login assumi-lo.
   */
  keycloakId: text('keycloak_id').unique(),
  username: text('username'),
  name: text('name'),
  email: text('email'),
  ...timestamps,
});

/** Dono do registro. */
const ownerId = () =>
  uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });

export const connections = pgTable(
  'connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: ownerId(),
    ...providerRef,
    institutionName: text('institution_name').notNull(),
    institutionLogoUrl: text('institution_logo_url'),
    status: connectionStatus('status').notNull(),
    lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('connections_user_id_provider_external_id_key').on(
      t.userId,
      t.provider,
      t.externalId,
    ),
    // Alvo das chaves compostas: o filho só aponta para um pai do mesmo usuário.
    unique('connections_id_user_id_key').on(t.id, t.userId),
  ],
);

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: ownerId(),
    connectionId: uuid('connection_id').notNull(),
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
    uniqueIndex('accounts_user_id_provider_external_id_key').on(t.userId, t.provider, t.externalId),
    unique('accounts_id_user_id_key').on(t.id, t.userId),
    foreignKey({
      name: 'accounts_connection_id_user_id_fkey',
      columns: [t.connectionId, t.userId],
      foreignColumns: [connections.id, connections.userId],
    }).onDelete('cascade'),
    index('accounts_connection_id_idx').on(t.connectionId),
  ],
);

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: ownerId(),
    accountId: uuid('account_id').notNull(),
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
    uniqueIndex('transactions_user_id_provider_external_id_key').on(
      t.userId,
      t.provider,
      t.externalId,
    ),
    foreignKey({
      name: 'transactions_account_id_user_id_fkey',
      columns: [t.accountId, t.userId],
      foreignColumns: [accounts.id, accounts.userId],
    }).onDelete('cascade'),
    index('transactions_account_id_date_idx').on(t.accountId, t.date),
    index('transactions_user_id_date_idx').on(t.userId, t.date),
  ],
);

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: ownerId(),
    accountId: uuid('account_id').notNull(),
    ...providerRef,
    dueDate: date('due_date', { mode: 'string' }).notNull(),
    closingDate: date('closing_date', { mode: 'string' }),
    total: money('total').notNull(),
    minimumPayment: money('minimum_payment'),
    currency: text('currency').notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('invoices_user_id_provider_external_id_key').on(t.userId, t.provider, t.externalId),
    foreignKey({
      name: 'invoices_account_id_user_id_fkey',
      columns: [t.accountId, t.userId],
      foreignColumns: [accounts.id, accounts.userId],
    }).onDelete('cascade'),
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
    userId: ownerId(),
    provider: text('provider').notNull(),
    trigger: syncTrigger('trigger').notNull(),
    status: syncRunStatus('status').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    stats: jsonb('stats').$type<SyncStats>(),
    errors: jsonb('errors').$type<string[]>().notNull().default([]),
  },
  (t) => [index('sync_runs_user_id_started_at_idx').on(t.userId, t.startedAt)],
);

// ------------------------------------------------------------- planejamento

export const BUDGET_CATEGORY_KINDS = ['ESSENTIAL', 'DISCRETIONARY'] as const;
export const budgetCategoryKind = pgEnum('budget_category_kind', BUDGET_CATEGORY_KINDS);

/** Categoria de orçamento: agrupa categorias do agregador e tem um teto mensal. */
export const budgetCategories = pgTable('budget_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: ownerId(),
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
    userId: ownerId(),
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
  (t) => [
    index('commitments_user_id_idx').on(t.userId),
    index('commitments_category_id_idx').on(t.categoryId),
  ],
);

/** Meta de economia (ex.: entrada do carro). */
export const goals = pgTable('goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: ownerId(),
  name: text('name').notNull(),
  target: money('target').notNull(),
  saved: money('saved').notNull().default(0),
  targetDate: date('target_date', { mode: 'string' }).notNull(),
  monthlyContribution: money('monthly_contribution').notNull(),
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  ...timestamps,
});

export type UserRow = typeof users.$inferSelect;
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

// ------------------------------------------------------------------ análise

/** Quem gerou a análise: o Claude via MCP ou a própria interface (API da Anthropic). */
export const ANALYSIS_SOURCES = ['MCP', 'APP'] as const;
export const analysisSource = pgEnum('analysis_source', ANALYSIS_SOURCES);

/** Relatórios de análise do Claude; o conteúdo segue `analysisReportSchema`. */
export const analysisReports = pgTable(
  'analysis_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: ownerId(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    source: analysisSource('source').notNull(),
    model: text('model'),
    periodFrom: date('period_from', { mode: 'string' }).notNull(),
    periodTo: date('period_to', { mode: 'string' }).notNull(),
    report: jsonb('report').notNull(),
  },
  (t) => [index('analysis_reports_user_id_generated_at_idx').on(t.userId, t.generatedAt)],
);

export type AnalysisReportRow = typeof analysisReports.$inferSelect;
export type AnalysisSource = (typeof ANALYSIS_SOURCES)[number];

export const ANALYSIS_RUN_STATUSES = ['RUNNING', 'SUCCEEDED', 'FAILED'] as const;
export const analysisRunStatus = pgEnum('analysis_run_status', ANALYSIS_RUN_STATUSES);

/** Tokens gastos numa execução (somados de todas as chamadas à API da Anthropic). */
export interface AnalysisRunUsage {
  /** Chamadas à API (uma por volta do loop de ferramentas). */
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

/**
 * Execuções do botão "Gerar análise" (API da Anthropic). O índice único
 * parcial garante no banco que cada usuário tem no máximo uma RUNNING.
 */
export const analysisRuns = pgTable(
  'analysis_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: ownerId(),
    status: analysisRunStatus('status').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    /** Mensagem em português, segura para mostrar na interface. */
    error: text('error'),
    reportId: uuid('report_id').references(() => analysisReports.id, { onDelete: 'set null' }),
    model: text('model'),
    usage: jsonb('usage').$type<AnalysisRunUsage>(),
  },
  (t) => [
    index('analysis_runs_user_id_started_at_idx').on(t.userId, t.startedAt),
    uniqueIndex('analysis_runs_single_running_key')
      .on(t.userId)
      .where(sql`${t.status} = 'RUNNING'`),
  ],
);

export type AnalysisRunRow = typeof analysisRuns.$inferSelect;
export type AnalysisRunStatus = (typeof ANALYSIS_RUN_STATUSES)[number];

// ----------------------------------------------------------- configurações

/** Credenciais da Pluggy de cada usuário (tela Configurações). */
export const pluggySettings = pgTable('pluggy_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  clientId: text('client_id').notNull(),
  /** Cifrado com SETTINGS_ENCRYPTION_KEY (`common/secret-box.ts`). */
  clientSecret: text('client_secret').notNull(),
  itemIds: jsonb('item_ids').$type<string[]>().notNull(),
  ...timestamps,
});

export type PluggySettingsRow = typeof pluggySettings.$inferSelect;

/** Chave e modelo da Anthropic de cada usuário. Sem linha = análise pelo app desligada. */
export const anthropicSettings = pgTable('anthropic_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** Cifrada com SETTINGS_ENCRYPTION_KEY (`common/secret-box.ts`). */
  apiKey: text('api_key').notNull(),
  model: text('model').notNull(),
  ...timestamps,
});

export type AnthropicSettingsRow = typeof anthropicSettings.$inferSelect;

/**
 * Token pessoal do MCP (Claude Code/Desktop sem OAuth), um por usuário. Só o
 * sha256 fica no banco; o token aparece uma vez, quando é gerado.
 */
export const mcpTokens = pgTable('mcp_tokens', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  /** Últimos caracteres, para o usuário reconhecer o token na tela. */
  hint: text('hint').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
});

export type McpTokenRow = typeof mcpTokens.$inferSelect;
