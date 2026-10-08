import { toLocalDate } from '../../domain/dates.js';
import type {
  Account,
  AccountType,
  Connection,
  ConnectionStatus,
  Invoice,
  PaymentMethod,
  Profile,
  Transaction,
} from '../../domain/finance.js';
import { toCents } from '../../domain/money.js';
import type {
  PluggyAccount,
  PluggyBill,
  PluggyIdentity,
  PluggyItem,
  PluggyTransaction,
} from './pluggy.schemas.js';

/**
 * Anticorruption layer: traduz o formato da Pluggy para o modelo de domínio.
 * É o único lugar que conhece os nomes e convenções do agregador.
 */

const ITEM_STATUS: Record<string, ConnectionStatus> = {
  UPDATED: 'ACTIVE',
  UPDATING: 'UPDATING',
  MERGING: 'UPDATING',
  WAITING_USER_INPUT: 'ACTION_REQUIRED',
  WAITING_USER_ACTION: 'ACTION_REQUIRED',
  LOGIN_ERROR: 'ACTION_REQUIRED',
  OUTDATED: 'ERROR',
};

const ACCOUNT_SUBTYPE: Record<string, AccountType> = {
  CHECKING_ACCOUNT: 'CHECKING',
  SAVINGS_ACCOUNT: 'SAVINGS',
  CREDIT_CARD: 'CREDIT_CARD',
};

/** Tipos de operação do Open Finance Brasil que viram meio de pagamento. */
const PAYMENT_METHOD: Record<string, PaymentMethod> = {
  PIX: 'PIX',
  TED: 'TED',
  DOC: 'DOC',
  BOLETO: 'BOLETO',
  CARTAO: 'CARD',
};

export function mapItem(item: PluggyItem): Connection {
  return {
    externalId: item.id,
    institutionName: item.connector.name,
    institutionLogoUrl: item.connector.imageUrl ?? null,
    status: ITEM_STATUS[item.status] ?? 'ERROR',
    lastRefreshedAt: item.lastUpdatedAt ? new Date(item.lastUpdatedAt) : null,
  };
}

export function mapIdentity(identity: PluggyIdentity): Profile {
  return {
    fullName: identity.fullName ?? null,
    document: identity.document ?? identity.taxNumber ?? null,
    email: identity.emails?.[0]?.value ?? null,
  };
}

export function mapAccount(account: PluggyAccount): Account {
  const type: AccountType =
    (account.subtype && ACCOUNT_SUBTYPE[account.subtype]) ||
    (account.type === 'CREDIT' ? 'CREDIT_CARD' : 'OTHER');
  const credit = account.creditData;

  return {
    externalId: account.id,
    connectionExternalId: account.itemId,
    type,
    name: account.marketingName || account.name,
    number: account.number || null,
    currency: account.currencyCode ?? 'BRL',
    balance: toCents(account.balance),
    creditLimit: credit?.creditLimit != null ? toCents(credit.creditLimit) : null,
    availableCredit:
      credit?.availableCreditLimit != null ? toCents(credit.availableCreditLimit) : null,
  };
}

export function mapTransaction(transaction: PluggyTransaction, timeZone: string): Transaction {
  // O sinal de `amount` varia por tipo de conta na Pluggy; a direção confiável é `type`.
  const value = Math.abs(transaction.amountInAccountCurrency ?? transaction.amount);
  const isOutflow = transaction.type === 'DEBIT';
  const card = transaction.creditCardMetadata;

  return {
    externalId: transaction.id,
    accountExternalId: transaction.accountId,
    date: toLocalDate(transaction.date, timeZone),
    description: (transaction.description || transaction.descriptionRaw || '').trim(),
    amount: toCents(isOutflow ? -value : value),
    status: transaction.status === 'PENDING' ? 'PENDING' : 'POSTED',
    category: transaction.category ?? null,
    paymentMethod: paymentMethodOf(transaction),
    counterpartyName: counterpartyOf(transaction, isOutflow),
    installment:
      card?.installmentNumber && card.totalInstallments && card.totalInstallments > 1
        ? { number: card.installmentNumber, total: card.totalInstallments }
        : null,
    invoiceExternalId: card?.billId ?? null,
  };
}

export function mapBill(bill: PluggyBill, accountId: string, timeZone: string): Invoice {
  return {
    externalId: bill.id,
    accountExternalId: accountId,
    dueDate: toLocalDate(bill.dueDate, timeZone),
    closingDate: bill.billClosingDate ? toLocalDate(bill.billClosingDate, timeZone) : null,
    total: toCents(bill.totalAmount),
    minimumPayment: bill.minimumPaymentAmount != null ? toCents(bill.minimumPaymentAmount) : null,
    currency: bill.totalAmountCurrencyCode ?? 'BRL',
  };
}

function paymentMethodOf(transaction: PluggyTransaction): PaymentMethod | null {
  const candidates = [transaction.paymentData?.paymentMethod, transaction.operationType];
  for (const candidate of candidates) {
    const method = candidate && PAYMENT_METHOD[candidate.toUpperCase()];
    if (method) return method;
  }
  if (transaction.creditCardMetadata) return 'CARD';
  return candidates.some(Boolean) ? 'OTHER' : null;
}

function counterpartyOf(transaction: PluggyTransaction, isOutflow: boolean): string | null {
  const merchant = transaction.merchant?.name || transaction.merchant?.businessName;
  if (merchant) return merchant;
  const participant = isOutflow
    ? transaction.paymentData?.receiver
    : transaction.paymentData?.payer;
  return participant?.name || null;
}
