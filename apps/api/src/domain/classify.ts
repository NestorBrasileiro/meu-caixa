/**
 * Classificação compartilhada (mesmas regras da interface): cada real gasto
 * conta uma vez só.
 *
 * - Pagamento de fatura não é gasto (as compras já contaram no cartão) nem
 *   renda (no cartão, é a conta quitando a dívida).
 * - Transferência entre contas próprias não é gasto nem renda.
 *
 * As categorias vêm do agregador; estas listas cobrem os nomes usados pela
 * Pluggy e pelo provedor fake.
 */
const OWN_TRANSFER_CATEGORIES = new Set([
  'Transfer - Savings',
  'Same person transfer',
  'Same person transfer - PIX',
  'Same person transfer - TED',
]);
const CARD_PAYMENT_CATEGORIES = new Set(['Credit card payment']);

export interface Classifiable {
  amount: number;
  category: string | null;
}

export function isOwnTransfer(tx: Classifiable): boolean {
  return tx.category !== null && OWN_TRANSFER_CATEGORIES.has(tx.category);
}

export function isCardPayment(tx: Classifiable): boolean {
  return tx.category !== null && CARD_PAYMENT_CATEGORIES.has(tx.category);
}

export function isSpending(tx: Classifiable): boolean {
  return tx.amount < 0 && !isOwnTransfer(tx) && !isCardPayment(tx);
}

export function isIncome(tx: Classifiable): boolean {
  return tx.amount > 0 && !isOwnTransfer(tx) && !isCardPayment(tx);
}
