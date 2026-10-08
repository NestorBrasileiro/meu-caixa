import type { Account, Transaction } from "@/lib/api/types"

/**
 * Regras de classificação compartilhadas pelas telas. A ideia central: cada
 * real gasto aparece uma vez só.
 *
 * - Pagamento de fatura e transferência entre contas próprias não são gasto
 *   (a compra já foi contada no cartão; a transferência só muda o dinheiro de lugar).
 * - Fluxo de caixa olha só as contas (corrente/poupança): ali o cartão aparece
 *   como o pagamento da fatura.
 */

const OWN_TRANSFER_CATEGORIES = new Set(["Transfer - Savings"])
const CARD_PAYMENT_CATEGORIES = new Set(["Credit card payment"])

export function isOwnTransfer(tx: Transaction): boolean {
  return tx.category !== null && OWN_TRANSFER_CATEGORIES.has(tx.category)
}

export function isCardPayment(tx: Transaction): boolean {
  return tx.category !== null && CARD_PAYMENT_CATEGORIES.has(tx.category)
}

/** Saída que conta como gasto (compra, conta, Pix para terceiros). */
export function isSpending(tx: Transaction): boolean {
  return tx.amount < 0 && !isOwnTransfer(tx) && !isCardPayment(tx)
}

/** Entrada de dinheiro novo (salário, rendimento, Pix recebido). */
export function isIncome(tx: Transaction): boolean {
  return tx.amount > 0 && !isOwnTransfer(tx)
}

export function isCashAccount(account: Pick<Account, "type">): boolean {
  return account.type !== "CREDIT_CARD"
}
