"use client"

import { useRouter } from "next/navigation"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useTransition,
  type ReactNode,
} from "react"
import { toast } from "sonner"
import { syncRequestErrorMessage as requestErrorMessage } from "@/components/shell/sync-run"
import { apiRequest, ClientApiError } from "@/lib/api/client"
import type { AnalysisRun, AnalysisStatus } from "@/lib/api/analysis"
import {
  failedRunNotice,
  generationReducer,
  POLL_INTERVAL_MS,
  POLL_TIMEOUT_MS,
  type AppAvailability,
  type GenerationState,
} from "./generation"

/**
 * "Gerar análise": o botão do cabeçalho (ou do estado vazio) e o aviso de andamento no topo da
 * página compartilham o mesmo acompanhamento por este contexto.
 */

interface GenerationContextValue {
  state: GenerationState
  availability: AppAvailability
  hasReport: boolean
  start: () => void
  dismiss: () => void
}

const GenerationContext = createContext<GenerationContextValue | null>(null)

export function useGeneration(): GenerationContextValue {
  const value = useContext(GenerationContext)
  if (!value) throw new Error("useGeneration fora de <GenerationProvider>")
  return value
}

const runPath = (id: string) => `/api/analysis/runs/${encodeURIComponent(id)}`

export function GenerationProvider({
  initial,
  availability,
  hasReport,
  children,
}: {
  /** Estado ao abrir a tela (`initialGeneration`): já acompanhando, se havia uma geração rodando. */
  initial: GenerationState
  availability: AppAvailability
  hasReport: boolean
  children: ReactNode
}) {
  const router = useRouter()
  const [state, dispatch] = useReducer(generationReducer, initial)
  const [refreshing, startTransition] = useTransition()
  const refreshRequested = useRef(false)
  /** Desde quando (relógio do browser) a tela acompanha a execução atual. */
  const followingSince = useRef<number | null>(null)

  const start = useCallback(async () => {
    if (state.phase !== "idle") return
    dispatch({ type: "start" })
    try {
      dispatch({ type: "started", run: await apiRequest<AnalysisRun>("/api/analysis/runs", { method: "POST" }) })
    } catch (error) {
      if (error instanceof ClientApiError && error.status === 401) return
      if (!(error instanceof ClientApiError && error.status === 409)) {
        dispatch({ type: "startFailed", message: requestErrorMessage(error) })
        return
      }
      // Já havia uma rodando: passa a acompanhar essa.
      try {
        const status = await apiRequest<AnalysisStatus>("/api/analysis/status")
        dispatch({ type: "adopted", run: status.latestRun })
      } catch (statusError) {
        dispatch({ type: "startFailed", message: requestErrorMessage(statusError) })
      }
    }
  }, [state.phase])

  // Consulta a execução a cada POLL_INTERVAL_MS enquanto ela roda.
  useEffect(() => {
    if (state.phase !== "running") {
      followingSince.current = null
      return
    }
    followingSince.current ??= Date.now()
    const { runId } = state
    let cancelled = false
    const timer = setTimeout(async () => {
      if (Date.now() - (followingSince.current ?? Date.now()) > POLL_TIMEOUT_MS) {
        dispatch({ type: "timedOut" })
        return
      }
      try {
        const run = await apiRequest<AnalysisRun>(runPath(runId))
        if (cancelled) return
        if (run.status === "FAILED") {
          const notice = failedRunNotice(run)
          toast.error(notice.title, { description: notice.message })
        }
        dispatch({ type: "polled", run })
      } catch (error) {
        if (cancelled || (error instanceof ClientApiError && error.status === 401)) return
        if (error instanceof ClientApiError && error.status === 404) dispatch({ type: "lost" })
        else dispatch({ type: "pollFailed", message: requestErrorMessage(error) })
      }
    }, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [state])

  // Terminou bem: busca a página de novo (relatório novo) e só então avisa.
  useEffect(() => {
    if (state.phase !== "refreshing") return
    if (!refreshRequested.current) {
      refreshRequested.current = true
      startTransition(() => router.refresh())
      return
    }
    if (refreshing) return
    refreshRequested.current = false
    dispatch({ type: "refreshed" })
    toast.success("Análise pronta", { description: "O relatório novo já está na tela." })
  }, [state.phase, refreshing, router])

  const dismiss = useCallback(() => dispatch({ type: "dismiss" }), [])

  return (
    <GenerationContext.Provider value={{ state, availability, hasReport, start: () => void start(), dismiss }}>
      {children}
    </GenerationContext.Provider>
  )
}
