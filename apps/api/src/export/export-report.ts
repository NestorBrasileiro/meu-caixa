import type { SyncStatus, SyncTrigger } from '../database/schema.js';
import type {
  AccountType,
  Cents,
  ConnectionStatus,
  IsoDate,
  PaymentMethod,
  TransactionStatus,
} from '../domain/finance.js';
import type { IsoMonth } from '../domain/months.js';
import type { RecurrencePattern, TransactionKind } from '../insights/aggregate.js';
import type { StoredAnalysis } from '../insights/analysis.service.js';
import type { LoanDto } from '../loans/loan.dto.js';
import type { SectionId } from './export.catalog.js';

/**
 * Tudo o que a exportação leva, montado uma vez pelo `ExportDataService` e
 * lido pelos renderizadores (xlsx, pdf, csv, md). Valores em centavos, datas
 * `YYYY-MM-DD` no fuso do usuário e instantes em ISO 8601; os textos para
 * leitura (rótulos em português, R$) ficam com `export-views.ts`.
 */
export interface ExportReport {
  /** Instante da geração (ISO 8601). */
  generatedAt: string;
  timezone: string;
  /** "Hoje" no fuso do usuário. */
  today: IsoDate;
  period: { from: IsoDate; to: IsoDate; months: IsoMonth[] };
  /** Seções pedidas, na ordem canônica. */
  sections: SectionId[];
  lastSync: LastSyncInfo | null;
  /** Ajustes feitos no pedido (ex.: data futura limitada a hoje). */
  adjustments: string[];
  data: Partial<ExportSectionData>;
}

export interface LastSyncInfo {
  status: SyncStatus;
  trigger: SyncTrigger;
  startedAt: string;
  finishedAt: string | null;
  errors: string[];
}

export interface ExportSectionData {
  resumo: SummaryData;
  contas: AccountInfo[];
  cartoes: CardInfo[];
  faturas: InvoiceInfo[];
  parcelamentos: CardInstallmentInfo[];
  emprestimos: LoanDto[];
  compromissos: CommitmentInfo[];
  metas: GoalInfo[];
  orcamento: BudgetData;
  projecao: ProjectionInfo[];
  fluxo: CashFlowMonth[];
  categorias: CategoryData;
  recorrencias: RecurrenceData;
  transacoes: TransactionData;
  analise: StoredAnalysis | null;
}

export interface ConnectionInfo {
  institutionName: string;
  status: ConnectionStatus;
  lastRefreshedAt: string | null;
}

export interface SummaryData {
  totals: {
    /** Soma dos saldos das contas (sem cartões). */
    cashBalance: Cents;
    /** Soma do valor em aberto nos cartões (positivo = dívida). */
    cardDebt: Cents;
    cardLimit: Cents;
    cardAvailable: Cents;
    /** Parcelas de cartão ainda a vencer (soma do valor restante). */
    openInstallmentsRemaining: Cents;
    /** Saldo devedor somado dos empréstimos; `null` sem empréstimos informados. */
    loansOutstanding: Cents | null;
    /** Compromissos fixos ativos no mês atual. */
    monthlyCommitments: Cents;
  };
  periodResult: CashFlowTotals;
  counts: {
    connections: number;
    accounts: number;
    cards: number;
    transactions: number;
    invoices: number;
    openInstallments: number;
    loans: number;
    commitments: number;
    goals: number;
  };
  connections: ConnectionInfo[];
  /** Avisos de frescor dos dados (conexões com problema, sincronização antiga). */
  warnings: string[];
}

export interface AccountInfo {
  institutionName: string;
  type: AccountType;
  name: string;
  number: string | null;
  currency: string;
  /** Conta: saldo disponível. Cartão: valor em aberto (quanto se deve). */
  balance: Cents;
  creditLimit: Cents | null;
  availableCredit: Cents | null;
  transactionsSyncedThrough: IsoDate | null;
  connectionStatus: ConnectionStatus;
}

export interface CardInfo {
  institutionName: string;
  name: string;
  number: string | null;
  limit: Cents | null;
  used: Cents;
  available: Cents | null;
  /** Fração usada do limite (0,45 = 45%). */
  usage: number | null;
  /** Próxima fatura a vencer (a partir de hoje). */
  openInvoice: { total: Cents; closingDate: IsoDate | null; dueDate: IsoDate } | null;
}

export interface InvoiceInfo {
  institutionName: string;
  cardName: string;
  closingDate: IsoDate | null;
  dueDate: IsoDate;
  total: Cents;
  minimumPayment: Cents | null;
  /** Vence hoje ou depois. */
  upcoming: boolean;
}

export interface CardInstallmentInfo {
  description: string;
  cardName: string;
  /** Valor de cada parcela (positivo). */
  amount: Cents;
  paid: number;
  total: number;
  /** Número da próxima parcela a ser cobrada. */
  current: number;
  /** Parcelas que faltam, contando a atual. */
  remaining: number;
  remainingAmount: Cents;
  nextDueDate: IsoDate;
  endsOn: IsoDate;
}

export interface CommitmentInfo {
  name: string;
  amount: Cents;
  dayOfMonth: number;
  paymentMethod: PaymentMethod | null;
  category: string | null;
  startsOn: IsoDate;
  endsOn: IsoDate | null;
  installments: { paid: number; total: number; remaining: number; remainingAmount: Cents } | null;
  activeThisMonth: boolean;
  notes: string | null;
}

export interface GoalInfo {
  name: string;
  target: Cents;
  saved: Cents;
  remaining: Cents;
  /** Fração atingida (0 a 1+). */
  progress: number | null;
  targetDate: IsoDate;
  monthsLeft: number;
  monthlyContribution: Cents;
  monthlyNeeded: Cents;
  onTrack: boolean;
}

export interface BudgetData {
  categories: {
    name: string;
    kind: 'ESSENTIAL' | 'DISCRETIONARY';
    sourceCategories: string[];
    monthlyBudget: Cents | null;
  }[];
  /** Uma linha por mês × categoria (mais "Sem categoria de orçamento"). */
  rows: {
    month: IsoMonth;
    category: string;
    kind: 'ESSENTIAL' | 'DISCRETIONARY' | null;
    budget: Cents | null;
    spent: Cents;
    /** Teto − gasto (negativo = estourou). */
    difference: Cents | null;
    usage: number | null;
    partialMonth: boolean;
  }[];
}

export interface ProjectionInfo {
  month: IsoMonth;
  expectedIncome: Cents;
  commitments: Cents;
  goalContributions: Cents;
  expectedVariableSpending: Cents;
  projectedBalance: Cents;
}

export interface CashFlowTotals {
  income: Cents;
  /** Positivo: quanto saiu em gastos. */
  spending: Cents;
  net: Cents;
  savingsRate: number | null;
  cardPayments: Cents;
  ownTransfersOut: Cents;
}

export interface CashFlowMonth extends CashFlowTotals {
  month: IsoMonth;
  /** O período não cobre o mês inteiro (início no meio ou mês corrente). */
  partial: boolean;
}

export interface CategoryData {
  total: Cents;
  monthCount: number;
  rows: {
    category: string | null;
    total: Cents;
    count: number;
    share: number | null;
    monthlyAverage: Cents;
  }[];
}

export interface RecurrenceData {
  window: { from: IsoDate; to: IsoDate };
  minMonths: number;
  /** Custo mensal somado das recorrências ativas (sem parcelamentos). */
  activeMonthlyCost: Cents;
  items: {
    label: string;
    counterpartyName: string | null;
    category: string | null;
    pattern: RecurrencePattern;
    active: boolean;
    occurrences: number;
    monthsSeen: number;
    typicalAmount: Cents;
    lastAmount: Cents;
    lastDate: IsoDate;
    estimatedMonthlyCost: Cents;
    estimatedYearlyCost: Cents | null;
    installment: { current: number; total: number; remaining: number } | null;
    accounts: string[];
  }[];
}

export interface TransactionInfo {
  date: IsoDate;
  institutionName: string;
  accountName: string;
  accountType: AccountType;
  description: string;
  counterpartyName: string | null;
  /** Categoria efetiva (a do usuário, se houver). */
  category: string | null;
  /** Categoria do agregador quando o usuário trocou; `null` se não foi editada. */
  originalCategory: string | null;
  edited: boolean;
  paymentMethod: PaymentMethod | null;
  installment: { number: number; total: number } | null;
  status: TransactionStatus;
  amount: Cents;
  kind: TransactionKind;
  /** Pagamento de fatura ou transferência entre contas próprias: não é gasto nem renda. */
  internal: boolean;
}

export interface TransactionData {
  items: TransactionInfo[];
}
