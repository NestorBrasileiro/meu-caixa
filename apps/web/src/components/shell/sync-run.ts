import type { SyncRun } from "@/lib/api/types"

/**
 * "Sincronizar agora": como acompanhar a execução e o que dizer quando ela termina.
 * Módulo puro; quem faz as chamadas e mostra os avisos é `sync-tracker.ts`.
 */

/** De quanto em quanto tempo perguntar à API se a execução terminou. */
export const POLL_INTERVAL_MS = 1500
/** Depois disso a tela para de esperar (a execução continua na API). */
export const POLL_TIMEOUT_MS = 2 * 60 * 1000
/** Falhas seguidas ao consultar a API antes de desistir de acompanhar. */
export const MAX_POLL_FAILURES = 3
/** Quantas execuções pedir em cada consulta (a nossa é das mais recentes). */
export const POLL_RUNS_LIMIT = 5

export type PollStep = { done: false; runId: string | null } | { done: true; run: SyncRun }

/**
 * Um passo do acompanhamento. Com `runId`, espera essa execução terminar. Sem ele (a API respondeu
 * 409: já havia uma rodando), adota a mais recente se ela está em andamento; se não está, a que
 * estava rodando terminou entre o clique e a consulta e o resultado é o dela. Só a mais recente
 * conta: uma em andamento mais antiga, com outra mais nova depois dela, ficou para trás (a API caiu
 * no meio) e esperar por ela seria esperar para sempre.
 */
export function pollStep(runs: SyncRun[], runId: string | null): PollStep {
  if (runId === null) {
    const [latest] = runs
    if (!latest) return { done: false, runId: null }
    return latest.status === "RUNNING" ? { done: false, runId: latest.id } : { done: true, run: latest }
  }
  const run = runs.find((candidate) => candidate.id === runId)
  // Fora da lista (muitas execuções novas de uma vez) ou ainda rodando: continua esperando.
  if (!run || run.status === "RUNNING") return { done: false, runId }
  return { done: true, run }
}

/** Como terminou o acompanhamento. */
export type TrackResult =
  | { kind: "finished"; run: SyncRun }
  | { kind: "timeout" }
  | { kind: "error"; message: string }
  /** Sessão expirou: o browser já está indo para o login, não há o que avisar. */
  | { kind: "unauthorized" }

/**
 * O acompanhamento terminou sem ver a execução acabar (tempo esgotado, API fora do ar, sessão
 * expirada): a tela deixa essa execução de lado e não volta a esperar por ela, senão o botão e o
 * cabeçalho ficariam em "Sincronizando…" até recarregar a página.
 */
export function abandonsRun(result: TrackResult): boolean {
  return result.kind !== "finished"
}

export interface SyncNotice {
  tone: "success" | "info" | "warning" | "error"
  title: string
  description: string
}

const COUNT = new Intl.NumberFormat("pt-BR")
const MAX_DESCRIPTION = 160

function clip(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ")
  return clean.length > MAX_DESCRIPTION ? `${clean.slice(0, MAX_DESCRIPTION - 1).trimEnd()}…` : clean
}

function transactionsUpdated(run: SyncRun): string {
  const count = run.stats?.transactions
  if (count === undefined) return "Contas e saldos atualizados."
  if (count === 0) return "Nenhuma transação nova."
  return count === 1 ? "1 transação atualizada." : `${COUNT.format(count)} transações atualizadas.`
}

function errorCount(count: number): string {
  return count === 1 ? "1 erro" : `${COUNT.format(count)} erros`
}

/** Aviso (toast) do fim do acompanhamento; null quando não há o que dizer. */
export function trackNotice(result: TrackResult): SyncNotice | null {
  switch (result.kind) {
    case "unauthorized":
      return null
    case "timeout":
      return {
        tone: "info",
        title: "A sincronização está demorando",
        description: "Ela continua em segundo plano. O histórico mostra o resultado quando terminar.",
      }
    case "error":
      return { tone: "error", title: "Não foi possível acompanhar a sincronização", description: result.message }
    case "finished":
      return runNotice(result.run)
  }
}

/** Resultado de uma execução terminada. */
export function runNotice(run: SyncRun): SyncNotice {
  switch (run.status) {
    case "SUCCEEDED":
      return { tone: "success", title: "Sincronização concluída", description: transactionsUpdated(run) }
    case "PARTIAL": {
      const [first] = run.errors
      const count = errorCount(Math.max(1, run.errors.length))
      return {
        tone: "warning",
        title: "Sincronização parcial",
        description: first ? clip(`${count}: ${first}`) : `${count}. Os detalhes estão no histórico.`,
      }
    }
    case "FAILED":
      return {
        tone: "error",
        title: "A sincronização falhou",
        description: run.errors[0] ? clip(run.errors[0]) : "O banco não informou o motivo.",
      }
    case "RUNNING":
      return { tone: "info", title: "Sincronizando…", description: "A execução ainda está em andamento." }
  }
}

/**
 * Mensagem para quando a chamada à API falha (iniciar ou consultar). A API responde em pt-BR nos
 * erros de negócio; para o resto (rede, 5xx) uma frase nossa.
 */
export function syncRequestErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "status" in error && typeof error.status === "number") {
    if (error.status >= 500) return "A API não respondeu como esperado. Tente de novo em instantes."
    const message = "message" in error && typeof error.message === "string" ? error.message.trim() : ""
    if (message && !/^Erro \d+$/.test(message)) return message
    return `A API recusou o pedido (erro ${error.status}).`
  }
  return "Sem conexão com a API. Verifique se ela está no ar e tente de novo."
}
