import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react"
import type { IsoDateTime } from "@/lib/api/types"
import { formatRelative } from "@/lib/format/date"
import { cn } from "@/lib/utils"

export interface SyncSummary {
  lastSyncAt: IsoDateTime | null
  now: IsoDateTime
  /** Conexões que pedem ação do usuário (ex.: login no banco). */
  attentionCount: number
  running: boolean
}

/** Estado da sincronização no cabeçalho: ícone + texto (nunca só cor). */
export function SyncIndicator({ sync, className }: { sync: SyncSummary; className?: string }) {
  const when = sync.lastSyncAt ? formatRelative(sync.lastSyncAt, sync.now) : "nunca"

  return (
    <span
      className={cn(
        "text-muted-foreground hover:bg-accent hover:text-accent-foreground flex h-8 items-center gap-1.5 rounded-md px-2 text-xs transition-colors",
        className,
      )}
    >
      {sync.running ? (
        <RefreshCw className="size-3.5 animate-spin" aria-hidden />
      ) : sync.attentionCount > 0 ? (
        <AlertTriangle className="text-status-warning size-3.5" aria-hidden />
      ) : (
        <CheckCircle2 className="text-status-good size-3.5" aria-hidden />
      )}
      <span className="hidden sm:inline">
        {sync.running ? "Sincronizando…" : `Atualizado ${when}`}
      </span>
      {sync.attentionCount > 0 && (
        <span className="text-foreground">
          <span className="hidden sm:inline">· </span>
          {sync.attentionCount === 1 ? "1 conexão pede atenção" : `${sync.attentionCount} conexões pedem atenção`}
        </span>
      )}
    </span>
  )
}
