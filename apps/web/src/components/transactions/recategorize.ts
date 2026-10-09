import { ClientApiError } from "@/lib/api/client"
import type { Transaction } from "@/lib/api/types"

/**
 * Regras puras da recategorização: o que mandar para a API, como sobrepor as
 * respostas e os pedidos em andamento às linhas do servidor, e que motivo
 * mostrar quando o salvamento falha.
 */

/**
 * Categorias do agregador que o menu sempre oferece, mesmo sem nenhum
 * lançamento nelas ainda (todas com nome em português em `categoryLabel`).
 * Sem isso, só daria para mover um lançamento para categorias que já existem
 * nos dados — com um banco só, umas dez.
 */
export const KNOWN_CATEGORIES: readonly string[] = [
  "Salary",
  "Investment income",
  "Housing",
  "Electricity",
  "Internet",
  "Telecommunications",
  "Groceries",
  "Restaurants",
  "Food delivery",
  "Pharmacy",
  "Gyms and fitness centers",
  "Taxi and ride-hailing",
  "Gas stations",
  "Shopping",
  "Online shopping",
  "Video streaming",
  "Music streaming",
  "Bank fees",
  "Transfers",
  "Transfer - Savings",
  "Credit card payment",
]

/** Corpo do PATCH /api/transactions/:id. Voltar para a categoria do banco é `null` (remove a escolha). */
export function recategorizeBody(target: string | null, original: string | null): { category: string | null } {
  return { category: target === original ? null : target }
}

/** id do lançamento → categoria pedida, enquanto o PATCH não volta. */
export type PendingEdits = Readonly<Record<string, string | null>>
/** id do lançamento → lançamento como a API devolveu depois de salvar. */
export type SavedEdits = Readonly<Record<string, Transaction>>

/**
 * Linhas como a tela deve mostrá-las: a resposta da API (quando o servidor
 * ainda não mandou a página atualizada) e, por cima, o pedido em andamento.
 * Sem edições, devolve o próprio array (os `useMemo` seguintes não recalculam).
 */
export function applyEdits(transactions: Transaction[], saved: SavedEdits, pending: PendingEdits): Transaction[] {
  if (Object.keys(saved).length === 0 && Object.keys(pending).length === 0) return transactions
  return transactions.map((tx) => {
    const base = saved[tx.id] ?? tx
    return tx.id in pending ? { ...base, category: pending[tx.id] } : base
  })
}

/**
 * Quando chega uma página nova do servidor, as respostas guardadas que ela
 * já reflete saem (a página passa a mandar). As que ela ainda não reflete
 * ficam: vêm de um salvamento posterior ao pedido dessa página.
 * Devolve o mesmo objeto quando nada muda.
 */
export function pruneSaved(saved: SavedEdits, transactions: Transaction[]): SavedEdits {
  const ids = Object.keys(saved)
  if (ids.length === 0) return saved
  const server = new Map(transactions.map((tx) => [tx.id, tx]))
  const next: Record<string, Transaction> = {}
  for (const id of ids) {
    const row = server.get(id)
    if (!row) continue
    const edit = saved[id]
    if (row.category !== edit.category || row.originalCategory !== edit.originalCategory) next[id] = edit
  }
  return Object.keys(next).length === ids.length ? saved : next
}

/** Sem uma das chaves (cópia rasa). */
export function without<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  if (!(key in record)) return record
  const next = { ...record }
  delete next[key]
  return next
}

/**
 * Motivo legível de uma falha ao salvar. As mensagens de validação da API
 * vêm em inglês (class-validator) e as de erro interno não dizem nada útil:
 * essas viram texto em português; as demais (já em português) passam.
 */
export function saveErrorMessage(error: unknown): string {
  if (error instanceof ClientApiError) {
    if (error.status === 400) return "A API recusou a categoria escolhida."
    if (error.status === 403) return "Sua sessão não tem permissão para alterar lançamentos."
    if (error.status === 404) return "Este lançamento não existe mais: a última sincronização pode tê-lo removido."
    if (error.status >= 500) return "A API não conseguiu salvar agora. Tente de novo em instantes."
    return error.message
  }
  // `fetch` rejeita com TypeError quando não há resposta (rede, servidor fora do ar).
  if (error instanceof TypeError) return "Sem conexão com a API. Verifique a rede e tente de novo."
  return "Erro inesperado. Tente de novo."
}

/**
 * Texto do toast de falha: o motivo e onde o lançamento ficou. Quando ele não
 * existe mais (404), não há categoria que "continue".
 */
export function saveFailureDescription(error: unknown, description: string, previousLabel: string): string {
  const reason = saveErrorMessage(error)
  if (error instanceof ClientApiError && error.status === 404) return reason
  return `${reason} “${description}” continua em ${previousLabel}.`
}
