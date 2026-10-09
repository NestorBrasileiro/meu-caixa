"use client"

import { CheckCircle2, CircleDashed, CircleX, RefreshCw, TriangleAlert, type LucideIcon } from "lucide-react"
import { useEffect } from "react"
import { cn } from "@/lib/utils"
import { liveRunId, syncIndicatorView, type SyncSummary, type SyncTone } from "./sync-status"
import { followRun, useSyncTracker } from "./sync-tracker"

export type { SyncSummary } from "./sync-status"

const TONE_ICON: Record<SyncTone, { icon: LucideIcon; className: string }> = {
  running: { icon: RefreshCw, className: "animate-spin" },
  good: { icon: CheckCircle2, className: "text-status-good" },
  neutral: { icon: CircleDashed, className: "" },
  warning: { icon: TriangleAlert, className: "text-status-warning" },
  critical: { icon: CircleX, className: "text-status-critical" },
}

const FRAME =
  "text-muted-foreground hover:bg-accent hover:text-accent-foreground flex h-8 min-w-0 items-center gap-1.5 rounded-md px-2 text-xs whitespace-nowrap transition-colors"

/**
 * Estado da sincronização no cabeçalho: ícone + texto (nunca só cor). No celular cabe só o essencial
 * (ou só o ícone, quando está tudo certo); o texto completo continua lá para leitores de tela.
 *
 * Também reflete o "Sincronizar agora" da tela de contas na hora do clique e, se o servidor viu uma
 * execução rodando, acompanha até o fim e atualiza os dados.
 */
export function SyncIndicator({ summary, className }: { summary: SyncSummary; className?: string }) {
  const tracker = useSyncTracker()
  // Uma execução que a tela desistiu de acompanhar (API fora do ar, demora demais) não prende o cabeçalho
  // em "Sincronizando…" até recarregar.
  const runningRunId = liveRunId(summary.runningRunId, tracker.abandoned)

  useEffect(() => {
    if (runningRunId) followRun(runningRunId, false)
  }, [runningRunId])

  const view = syncIndicatorView({ ...summary, runningRunId }, tracker.phase !== "idle")
  const { icon: Icon, className: iconClass } = TONE_ICON[view.tone]
  // Problema (falha, erros, conexão pedindo atenção): o texto também ganha destaque, não só o ícone.
  const problem = view.tone === "warning" || view.tone === "critical"

  return (
    <span className={cn(FRAME, className)}>
      <Icon className={cn("size-3.5 shrink-0", iconClass)} aria-hidden />
      {/* Celular: versão curta, só para quem vê. */}
      {view.compact && (
        <span className={cn("truncate sm:hidden", problem && "text-foreground")} aria-hidden>
          {view.compact}
        </span>
      )}
      {/* A partir de sm: o texto completo. No celular, só para leitores de tela. */}
      <span className="max-sm:sr-only">
        {/* Com aviso das conexões, o destaque fica com ele; sem, com a própria situação. */}
        <span className={cn(problem && !view.attention && "text-foreground")}>{view.status}</span>
        {view.attention && <span className="text-foreground"> · {view.attention}</span>}
      </span>
    </span>
  )
}

/** Sem como saber a situação (API fora do ar): neutro, sem alarde; a página explica o problema. */
export function SyncIndicatorUnavailable({ className }: { className?: string }) {
  return (
    <span className={cn(FRAME, className)}>
      <CircleDashed className="size-3.5 shrink-0" aria-hidden />
      <span className="max-sm:sr-only">Sem dados da sincronização</span>
    </span>
  )
}

/** Lugar do indicador enquanto a sessão carrega: mesmo tamanho, sem texto que depois mude. */
export function SyncIndicatorSkeleton() {
  return (
    <span className="flex h-8 items-center gap-1.5 px-2" aria-hidden>
      <span className="bg-muted size-3.5 animate-pulse rounded-full" />
      <span className="bg-muted hidden h-3 w-28 animate-pulse rounded sm:block" />
    </span>
  )
}
