import type { Account, Transaction } from "@/lib/api/types"

/**
 * Regras de classificação das telas. A ideia central: cada real gasto aparece
 * uma vez só. Quem decide o tipo de cada lançamento é a API (`kind`), com as
 * mesmas regras da exportação e do MCP; aqui só se lê esse tipo.
 *
 * - Pagamento de fatura e transferência entre contas próprias não são gasto
 *   (a compra já foi contada no cartão; a transferência só muda o dinheiro de lugar).
 * - Dinheiro emprestado que entra não é renda: é dívida.
 * - Fluxo de caixa olha só as contas (corrente/poupança): ali o cartão aparece
 *   como o pagamento da fatura.
 */

export function isOwnTransfer(tx: Pick<Transaction, "kind">): boolean {
  return tx.kind === "TRANSFERENCIA_PROPRIA"
}

export function isCardPayment(tx: Pick<Transaction, "kind">): boolean {
  return tx.kind === "PAGAMENTO_FATURA"
}

/** Dinheiro emprestado que entrou (liberação de empréstimo): nem renda nem gasto. */
export function isLoanCredit(tx: Pick<Transaction, "kind">): boolean {
  return tx.kind === "CREDITO_RECEBIDO"
}

/** Saída que conta como gasto (compra, conta, Pix para terceiros). */
export function isSpending(tx: Pick<Transaction, "kind">): boolean {
  return tx.kind === "GASTO"
}

/**
 * Entrada de dinheiro novo (salário, rendimento, Pix recebido). O crédito do
 * pagamento de fatura no cartão não é renda: é o dinheiro da conta quitando a dívida.
 */
export function isIncome(tx: Pick<Transaction, "kind">): boolean {
  return tx.kind === "RECEITA"
}

export function isCashAccount(account: Pick<Account, "type">): boolean {
  return account.type !== "CREDIT_CARD"
}
