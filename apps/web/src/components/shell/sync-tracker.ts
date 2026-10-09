"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useSyncExternalStore, useTransition } from "react"
import { toast } from "sonner"
import { apiRequest, ClientApiError } from "@/lib/api/client"
import type { SyncRun } from "@/lib/api/types"
import {
  MAX_POLL_FAILURES,
  POLL_INTERVAL_MS,
  POLL_RUNS_LIMIT,
  POLL_TIMEOUT_MS,
  pollStep,
  syncRequestErrorMessage,
  trackNotice,
  type TrackResult,
} from "./sync-run"

/**
 * Acompanhamento da sincronização no browser, compartilhado entre o botão "Sincronizar agora" (tela
 * de contas) e o indicador do cabeçalho: um só acompanhamento por vez, e os dois mostram o mesmo
 * estado sem precisar de um provider no layout.
 *
 * Fases: `starting` (POST /api/sync no ar) → `running` (consultando /api/sync/runs) → `refreshing`
 * (terminou; `router.refresh()` trazendo saldos, histórico e cabeçalho novos) → `idle`.
 */

export type SyncPhase = "idle" | "starting" | "running" | "refreshing"

export interface SyncTrackerState {
  phase: SyncPhase
  /** Execuções que deixamos de acompanhar por tempo (continuam na API; não voltamos a esperar por elas). */
  abandoned: ReadonlySet<string>
}

const INITIAL: SyncTrackerState = { phase: "idle", abandoned: new Set() }
/** Se a atualização da tela não terminar nisso, a fase volta a `idle` mesmo assim. */
const REFRESH_TIMEOUT_MS = 15_000

let state: SyncTrackerState = INITIAL
const listeners = new Set<() => void>()

function update(patch: Partial<SyncTrackerState>) {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Acompanhamento em curso: a execução (null até descobrir qual, depois de um 409) e se avisa no fim. */
let job: { runId: string | null; announce: boolean } | null = null

/** "Sincronizar agora". Um 409 (já há uma rodando) não é erro: passa a acompanhar a que está rodando. */
export async function startSync(): Promise<void> {
  if (state.phase !== "idle") return
  update({ phase: "starting" })
  let runId: string | null = null
  try {
    runId = (await apiRequest<SyncRun>("/api/sync", { method: "POST" })).id
  } catch (error) {
    if (!(error instanceof ClientApiError && error.status === 409)) {
      update({ phase: "idle" })
      if (!(error instanceof ClientApiError && error.status === 401)) {
        toast.error("Não foi possível iniciar a sincronização", { description: syncRequestErrorMessage(error) })
      }
      return
    }
  }
  await track(runId, true)
}

/**
 * Passa a acompanhar uma execução que o servidor viu rodando. `announce`: avisar o resultado no fim
 * (a tela de contas avisa; o cabeçalho só atualiza os dados em silêncio).
 */
export function followRun(runId: string, announce: boolean): void {
  if (state.abandoned.has(runId)) return
  if (job) {
    job.announce ||= announce
    return
  }
  if (state.phase !== "idle") return
  void track(runId, announce)
}

async function track(runId: string | null, announce: boolean): Promise<void> {
  const current = { runId, announce }
  job = current
  update({ phase: "running" })
  const result = await poll(current)
  job = null

  if (result.kind === "timeout" && current.runId) {
    update({ abandoned: new Set(state.abandoned).add(current.runId) })
  }
  // Com a API fora do ar, atualizar a tela só trocaria os dados por uma página de erro.
  if (result.kind === "finished" || result.kind === "timeout") {
    update({ phase: "refreshing" })
    await refreshScreen()
  }
  update({ phase: "idle" })

  // O aviso sai junto com os dados novos na tela, não antes.
  const notice = current.announce ? trackNotice(result) : null
  if (notice) toast[notice.tone](notice.title, { description: notice.description })
}

async function poll(current: { runId: string | null }): Promise<TrackResult> {
  const deadline = Date.now() + POLL_TIMEOUT_MS
  let failures = 0
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)
    let runs: SyncRun[]
    try {
      runs = await apiRequest<SyncRun[]>(`/api/sync/runs?limit=${POLL_RUNS_LIMIT}`)
      failures = 0
    } catch (error) {
      if (error instanceof ClientApiError && error.status === 401) return { kind: "unauthorized" }
      failures += 1
      if (failures >= MAX_POLL_FAILURES) return { kind: "error", message: syncRequestErrorMessage(error) }
      continue
    }
    const step = pollStep(runs, current.runId)
    if (step.done) return { kind: "finished", run: step.run }
    current.runId = step.runId
  }
  return { kind: "timeout" }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/** Quem sabe atualizar os dados do servidor (um `router.refresh()` dentro de uma transição). */
type Refresher = () => Promise<void>
const refreshers: Refresher[] = []

async function refreshScreen(): Promise<void> {
  const refresher = refreshers.at(-1)
  if (!refresher) return
  await Promise.race([refresher(), sleep(REFRESH_TIMEOUT_MS)])
}

/**
 * Estado do acompanhamento para um componente. Também registra o componente como capaz de atualizar
 * a tela: a fase só volta a `idle` quando os dados novos já estão na tela.
 */
export function useSyncTracker(): SyncTrackerState {
  const router = useRouter()
  const [refreshing, startTransition] = useTransition()
  const settle = useRef<(() => void) | null>(null)

  useEffect(() => {
    const refresher: Refresher = () =>
      new Promise<void>((resolve) => {
        settle.current = resolve
        startTransition(() => router.refresh())
      })
    refreshers.push(refresher)
    return () => {
      const index = refreshers.indexOf(refresher)
      if (index >= 0) refreshers.splice(index, 1)
      // Desmontou no meio da atualização: não deixa ninguém esperando.
      settle.current?.()
      settle.current = null
    }
  }, [router])

  useEffect(() => {
    if (refreshing || !settle.current) return
    settle.current()
    settle.current = null
  }, [refreshing])

  return useSyncExternalStore(subscribe, getState, getInitialState)
}

function getState() {
  return state
}

function getInitialState() {
  return INITIAL
}
