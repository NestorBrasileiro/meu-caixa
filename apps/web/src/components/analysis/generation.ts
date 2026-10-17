import type { AnalysisRun, AnalysisStatus } from "@/lib/api/analysis"
import type { IsoDateTime } from "@/lib/api/types"
import { READ_ONLY_HINT } from "@/lib/data/mode"

/**
 * "Gerar análise" pelo app (API da Anthropic): se dá para usar, como acompanhar a execução e o que o
 * botão mostra. Módulo puro (sem React, sem relógio); quem chama a API é `generation-provider.tsx`.
 */

/** De quanto em quanto tempo perguntar à API se a geração terminou (ela leva minutos). */
export const POLL_INTERVAL_MS = 3000
/** Depois disso a tela para de esperar; a geração continua na API. */
export const POLL_TIMEOUT_MS = 20 * 60 * 1000
/** Falhas seguidas ao consultar a API antes de desistir de acompanhar. */
export const MAX_POLL_FAILURES = 5
/** "Em andamento" há mais que isso não está mais rodando (a API caiu no meio): a tela não espera por ela. */
export const STALE_RUN_MS = 60 * 60 * 1000
/** Uma falha da última geração aparece ao abrir a tela por este tempo (depois vira história antiga). */
export const RECENT_FAILURE_MS = 24 * 60 * 60 * 1000

// ------------------------------------------------------------ disponibilidade

/** Se o app pode falar com a API da Anthropic (gerar análise e responder perguntas). */
export type AppAvailability =
  | { kind: "ready"; model: string | null }
  /** `DATA_SOURCE=mock`: não há API. */
  | { kind: "readOnly" }
  /** A API não tem `ANTHROPIC_API_KEY`. */
  | { kind: "notConfigured" }
  /** Não deu para consultar GET /api/analysis/status. */
  | { kind: "unknown" }

export function appAvailability(status: AnalysisStatus | null, canWrite: boolean): AppAvailability {
  if (!canWrite) return { kind: "readOnly" }
  if (!status) return { kind: "unknown" }
  return status.app.enabled ? { kind: "ready", model: status.app.model } : { kind: "notConfigured" }
}

export const NOT_CONFIGURED_HINT =
  "O app usa a API da Anthropic, e a ANTHROPIC_API_KEY não está configurada na API. Pelo MCP funciona sem ela: conecte o seu Claude e peça a análise por lá."
export const STATUS_UNKNOWN_HINT = "Não foi possível consultar a API agora. Recarregue a página para tentar de novo."

/** Por que gerar e perguntar estão indisponíveis; null quando estão disponíveis. */
export function unavailableHint(availability: AppAvailability): string | null {
  switch (availability.kind) {
    case "ready":
      return null
    case "readOnly":
      return READ_ONLY_HINT
    case "notConfigured":
      return NOT_CONFIGURED_HINT
    case "unknown":
      return STATUS_UNKNOWN_HINT
  }
}

// ------------------------------------------------------------ acompanhamento

export interface GenerationNotice {
  tone: "error" | "info"
  title: string
  message: string
}

/**
 * Fases: `starting` (POST no ar) → `running` (consultando a execução a cada 3 s) → `refreshing`
 * (terminou bem; a tela está buscando o relatório novo) → `idle`. Em `idle`, `notice` é o que contar
 * sobre a última tentativa (falhou, demorou demais).
 */
export type GenerationState =
  | { phase: "idle"; notice: GenerationNotice | null }
  | { phase: "starting" }
  | { phase: "running"; runId: string; startedAt: IsoDateTime; failures: number }
  | { phase: "refreshing"; runId: string }

export type GenerationEvent =
  | { type: "start" }
  /** POST /api/analysis/runs respondeu 202. */
  | { type: "started"; run: AnalysisRun }
  /** Depois de um 409: a última execução segundo GET /api/analysis/status (a que já estava rodando). */
  | { type: "adopted"; run: AnalysisRun | null }
  | { type: "startFailed"; message: string }
  | { type: "polled"; run: AnalysisRun }
  | { type: "pollFailed"; message: string }
  /** GET /api/analysis/runs/:id respondeu 404. */
  | { type: "lost" }
  | { type: "timedOut" }
  /** A tela já mostra o relatório novo. */
  | { type: "refreshed" }
  | { type: "dismiss" }

export const IDLE: GenerationState = { phase: "idle", notice: null }

export function failedRunNotice(run: Pick<AnalysisRun, "error">): GenerationNotice {
  return {
    tone: "error",
    title: "A análise não foi concluída",
    message: run.error?.trim() || "A API não informou o motivo. Tente gerar de novo em instantes.",
  }
}

/** Passa a acompanhar `run`, ou encerra conforme o resultado dela. */
function follow(run: AnalysisRun, failures = 0): GenerationState {
  switch (run.status) {
    case "RUNNING":
      return { phase: "running", runId: run.id, startedAt: run.startedAt, failures }
    case "SUCCEEDED":
      return { phase: "refreshing", runId: run.id }
    case "FAILED":
      return { phase: "idle", notice: failedRunNotice(run) }
  }
}

export function generationReducer(state: GenerationState, event: GenerationEvent): GenerationState {
  switch (event.type) {
    case "start":
      return state.phase === "idle" ? { phase: "starting" } : state
    case "started":
      return state.phase === "starting" ? follow(event.run) : state
    case "adopted":
      if (state.phase !== "starting") return state
      return event.run
        ? follow(event.run)
        : {
            phase: "idle",
            notice: {
              tone: "error",
              title: "Não foi possível gerar a análise",
              message: "A API disse que já havia uma análise em andamento, mas ela não aparece mais. Tente de novo.",
            },
          }
    case "startFailed":
      return state.phase === "starting"
        ? { phase: "idle", notice: { tone: "error", title: "Não foi possível gerar a análise", message: event.message } }
        : state
    case "polled":
      // Resposta atrasada de uma execução que a tela não acompanha mais: ignora.
      return state.phase === "running" && state.runId === event.run.id ? follow(event.run) : state
    case "pollFailed": {
      if (state.phase !== "running") return state
      const failures = state.failures + 1
      if (failures < MAX_POLL_FAILURES) return { ...state, failures }
      return {
        phase: "idle",
        notice: {
          tone: "error",
          title: "Não foi possível acompanhar a análise",
          message: `${event.message} Ela pode continuar em segundo plano: recarregue a página mais tarde para ver o resultado.`,
        },
      }
    }
    case "lost":
      return state.phase === "running"
        ? {
            phase: "idle",
            notice: {
              tone: "error",
              title: "A análise não foi concluída",
              message: "A API não encontrou mais esta execução (talvez tenha reiniciado). Tente gerar de novo.",
            },
          }
        : state
    case "timedOut":
      return state.phase === "running"
        ? {
            phase: "idle",
            notice: {
              tone: "info",
              title: "A análise está demorando mais que o normal",
              message: "Ela continua em segundo plano. Recarregue a página daqui a pouco para ver o resultado.",
            },
          }
        : state
    case "refreshed":
      return state.phase === "refreshing" ? IDLE : state
    case "dismiss":
      return state.phase === "idle" ? IDLE : state
  }
}

/**
 * Estado ao abrir a tela, pelo que o servidor viu: uma geração rodando já abre acompanhada; uma que
 * falhou há pouco (e depois do relatório mostrado) aparece como aviso. Uma "em andamento" velha
 * demais ficou para trás e é ignorada.
 */
export function initialGeneration(
  latestRun: AnalysisRun | null,
  reportGeneratedAt: IsoDateTime | null,
  now: IsoDateTime,
): GenerationState {
  if (!latestRun) return IDLE
  const age = Date.parse(now) - Date.parse(latestRun.startedAt)
  if (latestRun.status === "RUNNING") {
    return age <= STALE_RUN_MS
      ? { phase: "running", runId: latestRun.id, startedAt: latestRun.startedAt, failures: 0 }
      : IDLE
  }
  if (latestRun.status === "FAILED") {
    const finishedAt = latestRun.finishedAt ?? latestRun.startedAt
    const recent = Date.parse(now) - Date.parse(finishedAt) <= RECENT_FAILURE_MS
    const afterReport = reportGeneratedAt === null || Date.parse(finishedAt) > Date.parse(reportGeneratedAt)
    if (recent && afterReport) {
      return { phase: "idle", notice: { ...failedRunNotice(latestRun), title: "A última análise pedida falhou" } }
    }
  }
  return IDLE
}

export function isBusy(state: GenerationState): boolean {
  return state.phase !== "idle"
}

// ------------------------------------------------------------ botão

export interface GenerateButtonState {
  label: string
  /** Gerando: o botão fica indisponível (aria-disabled) e mostra o spinner. */
  busy: boolean
  /** Indisponível (dica no tooltip); null quando dá para clicar. */
  hint: string | null
}

export function generateButton(
  availability: AppAvailability,
  state: GenerationState,
  hasReport: boolean,
): GenerateButtonState {
  const label = hasReport ? "Gerar nova análise" : "Gerar análise"
  const hint = unavailableHint(availability)
  if (hint) return { label, busy: false, hint }
  if (isBusy(state)) return { label: "Analisando…", busy: true, hint: null }
  return { label, busy: false, hint: null }
}
