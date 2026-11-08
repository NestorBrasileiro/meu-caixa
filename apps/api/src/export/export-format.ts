import type { SyncStatus, SyncTrigger } from '../database/schema.js';
import type {
  AccountType,
  Cents,
  ConnectionStatus,
  IsoDate,
  PaymentMethod,
  TransactionStatus,
} from '../domain/finance.js';
import { formatBRL } from '../domain/money.js';
import type { IsoMonth } from '../domain/months.js';
import type { RecurrencePattern, TransactionKind } from '../insights/aggregate.js';

/** Formatação pt-BR compartilhada pelos renderizadores (valores para leitura humana). */

/** `-123456` → `"-R$ 1.234,56"` (mesmo formato do resto do app). */
export const formatMoney = (cents: Cents): string => formatBRL(cents);

/** `2026-10-23` → `23/10/2026`. */
export function formatDate(date: IsoDate): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

const MONTH_NAMES = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

/** `2026-10` → `out/2026`. */
export function formatMonth(month: IsoMonth): string {
  const [year, m] = month.split('-');
  return `${MONTH_NAMES[Number(m) - 1]}/${year}`;
}

/** `2026-10` → `10/2026` (o Excel em pt-BR entende como data). */
export function formatMonthNumeric(month: IsoMonth): string {
  const [year, m] = month.split('-');
  return `${m}/${year}`;
}

const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();

/** Partes de data e hora de um instante no fuso informado. */
export function localParts(instant: string | Date, timeZone: string) {
  let formatter = dateTimeFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    dateTimeFormatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(instant)).map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Instante → `23/10/2026 14:05` no fuso do usuário. */
export function formatDateTime(instant: string | Date, timeZone: string): string {
  const p = localParts(instant, timeZone);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(p.day)}/${two(p.month)}/${p.year} ${two(p.hour)}:${two(p.minute)}`;
}

const pctFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Fração → `45,3%`. */
export const formatPct = (fraction: number): string =>
  pctFormatter.format(fraction).replace(/\s/g, '');

const intFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
export const formatInt = (value: number): string => intFormatter.format(value);

/** Centavos → número decimal com vírgula, sem "R$" nem separador de milhar (CSV). */
export function formatDecimal(cents: Cents): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

// ------------------------------------------------------------------ rótulos

const ACCOUNT_TYPES: Record<AccountType, string> = {
  CHECKING: 'Conta corrente',
  SAVINGS: 'Poupança',
  CREDIT_CARD: 'Cartão de crédito',
  OTHER: 'Outra',
};
export const accountTypeLabel = (type: AccountType) => ACCOUNT_TYPES[type] ?? type;

const CONNECTION_STATUSES: Record<ConnectionStatus, string> = {
  ACTIVE: 'Ativa',
  UPDATING: 'Atualizando',
  ACTION_REQUIRED: 'Precisa reconectar',
  ERROR: 'Com erro',
};
export const connectionStatusLabel = (status: ConnectionStatus) =>
  CONNECTION_STATUSES[status] ?? status;

const PAYMENT_METHODS: Record<PaymentMethod, string> = {
  PIX: 'Pix',
  TED: 'TED',
  DOC: 'DOC',
  BOLETO: 'Boleto',
  CARD: 'Cartão',
  OTHER: 'Outra',
};
export const paymentMethodLabel = (method: PaymentMethod | null) =>
  method ? (PAYMENT_METHODS[method] ?? method) : null;

const TRANSACTION_STATUSES: Record<TransactionStatus, string> = {
  POSTED: 'Efetivada',
  PENDING: 'Pendente',
};
export const transactionStatusLabel = (status: TransactionStatus) =>
  TRANSACTION_STATUSES[status] ?? status;

const KINDS: Record<TransactionKind, string> = {
  GASTO: 'Gasto',
  RECEITA: 'Receita',
  PAGAMENTO_FATURA: 'Pagamento de fatura',
  TRANSFERENCIA_PROPRIA: 'Transferência própria',
  NEUTRA: 'Neutra',
};
export const kindLabel = (kind: TransactionKind) => KINDS[kind] ?? kind;

const SYNC_STATUSES: Record<SyncStatus, string> = {
  RUNNING: 'Em andamento',
  SUCCEEDED: 'Concluída',
  PARTIAL: 'Parcial (com erros)',
  FAILED: 'Falhou',
};
export const syncStatusLabel = (status: SyncStatus) => SYNC_STATUSES[status] ?? status;

const SYNC_TRIGGERS: Record<SyncTrigger, string> = {
  SCHEDULED: 'automática',
  STARTUP: 'na subida da API',
  MANUAL: 'manual',
};
export const syncTriggerLabel = (trigger: SyncTrigger) => SYNC_TRIGGERS[trigger] ?? trigger;

const PATTERNS: Record<RecurrencePattern, string> = {
  ASSINATURA_OU_CONTA_FIXA: 'Assinatura ou conta fixa',
  HABITO_FREQUENTE: 'Hábito frequente',
  PARCELAMENTO: 'Parcelamento',
  RECORRENTE_VARIAVEL: 'Mensal variável',
};
export const recurrencePatternLabel = (pattern: RecurrencePattern) => PATTERNS[pattern] ?? pattern;

const INSIGHT_KINDS: Record<string, string> = {
  CUT: 'Corte',
  SIN: 'Gasto do pecado',
  LEAK: 'Vazamento',
  SUGGESTION: 'Sugestão',
};
export const insightKindLabel = (kind: string) => INSIGHT_KINDS[kind] ?? kind;

const CONFIDENCES: Record<string, string> = { HIGH: 'Alta', MEDIUM: 'Média', LOW: 'Baixa' };
export const confidenceLabel = (confidence: string) => CONFIDENCES[confidence] ?? confidence;

export const budgetKindLabel = (kind: 'ESSENTIAL' | 'DISCRETIONARY' | null) =>
  kind === 'ESSENTIAL' ? 'Essencial' : kind === 'DISCRETIONARY' ? 'Discricionário' : null;
