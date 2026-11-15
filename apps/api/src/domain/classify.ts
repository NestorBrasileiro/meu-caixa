import type { AccountType } from './finance.js';

/**
 * Classificação compartilhada (a interface usa o `kind` que a API devolve):
 * cada real gasto conta uma vez só.
 *
 * - Pagamento de fatura não é gasto (as compras já contaram no cartão) nem
 *   renda (no cartão, é a conta quitando a dívida).
 * - Transferência entre contas próprias não é gasto nem renda.
 * - Dinheiro emprestado (liberação de empréstimo) não é renda: é dívida.
 *
 * A categoria do agregador nem sempre acerta: a Pluggy manda o débito da
 * fatura como "Loans and financing" ou "Transfers" e o crédito no cartão como
 * "Transfers". Por isso a descrição e o tipo da conta também contam.
 */
export type TransactionKind =
  | 'GASTO'
  | 'RECEITA'
  | 'PAGAMENTO_FATURA'
  | 'TRANSFERENCIA_PROPRIA'
  | 'CREDITO_RECEBIDO'
  | 'NEUTRA';

const OWN_TRANSFER_CATEGORIES = new Set([
  'Transfer - Savings',
  'Same person transfer',
  'Same person transfer - PIX',
  'Same person transfer - TED',
  'Same person transfer - CASH',
]);
const CARD_PAYMENT_CATEGORIES = new Set(['Credit card payment']);
const LOAN_CATEGORIES = new Set(['Loans and financing']);

/**
 * Débito da fatura numa conta: "PAGAMENTO DE FATURA CARTAO CREDITO VIA DEBITO",
 * "Pagamento de fatura | Cartão de crédito", "Pagamento Cartão de crédito".
 * Boleto de cartão não conectado ("PAGAMENTO BOLETO … HIPERCARD") não casa e
 * segue como gasto: as compras dele não estão em nenhum cartão do app.
 */
const BILL_PAYMENT = /\bfatura\b|\bpagamento\b.{0,20}\bcart[aã]o\s+(de\s+)?cr[eé]dito/i;
/** Crédito num cartão que é o pagamento chegando: "Pagamento recebido", "TRA-<n>-<data>-UT…" (Sicredi). */
const CARD_CREDIT_PAYMENT = /^TRA-\d|\bpagamento\b|\bpagto\b/i;
/** Crédito no cartão que é devolução de compra: continua sendo dinheiro voltando, não pagamento. */
const REFUND = /estorno|reembolso|cancelamento|devolu[cç][aã]o/i;
/** Liberação de crédito: "Depósito do Empréstimo Pessoal", "LIBERAÇÃO DE CRÉDITO <contrato>", "Empréstimos". */
const LOAN_RELEASE = /empr[eé]stimo|libera[cç][aã]o de cr[eé]dito/i;
/** Parcela de empréstimo: "Pagamento de parcela | Empréstimos Mercado Pago", "PAGAMENTO DE CRÉDITO <contrato>". */
const LOAN_PAYMENT = /empr[eé]stimo|financiamento|pagamento de cr[eé]dito/i;
/** Juros e IOF do cheque especial: "CHEQUE ESPECIAL-JUROS", "CHEQUE ESPECIAL-IOF". */
const OVERDRAFT_CHARGE = /cheque especial/i;

export interface Classifiable {
  amount: number;
  category: string | null;
  /** Com descrição e tipo de conta, a regra corrige categorias erradas do agregador. */
  description?: string | null;
  accountType?: AccountType | null;
}

export function isOwnTransfer(tx: Classifiable): boolean {
  return tx.category !== null && OWN_TRANSFER_CATEGORIES.has(tx.category);
}

export function isCardPayment(tx: Classifiable): boolean {
  if (tx.category !== null && CARD_PAYMENT_CATEGORIES.has(tx.category)) return true;
  const description = tx.description ?? '';
  if (tx.accountType === 'CREDIT_CARD') {
    // No cartão, a única transferência que entra é o pagamento da fatura.
    const transfer = tx.category?.startsWith('Transfer') ?? false;
    return (
      tx.amount > 0 &&
      !REFUND.test(description) &&
      (transfer || CARD_CREDIT_PAYMENT.test(description))
    );
  }
  return tx.amount < 0 && BILL_PAYMENT.test(description);
}

/** Entrada que é dinheiro emprestado: aumenta a dívida, não a renda. */
export function isLoanCredit(tx: Classifiable): boolean {
  if (tx.amount <= 0 || isCardPayment(tx) || isOwnTransfer(tx)) return false;
  return (
    (tx.category !== null && LOAN_CATEGORIES.has(tx.category)) ||
    LOAN_RELEASE.test(tx.description ?? '')
  );
}

/** Saída que é parcela de empréstimo (segue sendo gasto; serve para achar dívidas que o banco não informa). */
export function isLoanPayment(tx: Classifiable): boolean {
  if (tx.amount >= 0 || isCardPayment(tx) || isOwnTransfer(tx)) return false;
  return (
    (tx.category !== null && LOAN_CATEGORIES.has(tx.category)) ||
    LOAN_PAYMENT.test(tx.description ?? '')
  );
}

/** Juros ou IOF de cheque especial (o agregador costuma mandar como "Transfer - Check"). */
export function isOverdraftCharge(tx: Classifiable): boolean {
  return tx.amount < 0 && OVERDRAFT_CHARGE.test(tx.description ?? '');
}

export function isSpending(tx: Classifiable): boolean {
  return tx.amount < 0 && !isOwnTransfer(tx) && !isCardPayment(tx);
}

export function isIncome(tx: Classifiable): boolean {
  return tx.amount > 0 && !isOwnTransfer(tx) && !isCardPayment(tx) && !isLoanCredit(tx);
}

export function kindOf(tx: Classifiable): TransactionKind {
  if (isCardPayment(tx)) return 'PAGAMENTO_FATURA';
  if (isOwnTransfer(tx)) return 'TRANSFERENCIA_PROPRIA';
  if (isLoanCredit(tx)) return 'CREDITO_RECEBIDO';
  if (isSpending(tx)) return 'GASTO';
  if (isIncome(tx)) return 'RECEITA';
  return 'NEUTRA';
}

/** Movimentação entre as próprias contas: nem dinheiro novo entrando nem gasto novo saindo. */
export function isInternalKind(kind: TransactionKind): boolean {
  return kind === 'PAGAMENTO_FATURA' || kind === 'TRANSFERENCIA_PROPRIA';
}
