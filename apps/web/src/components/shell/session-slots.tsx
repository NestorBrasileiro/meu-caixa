import { Skeleton } from "@/components/ui/skeleton"
import { getConnections, getCurrentUser, getNow, getSyncRuns } from "@/lib/data"
import { SyncIndicator } from "./sync-indicator"
import { summarizeSync } from "./sync-status"
import { UserMenu } from "./user-menu"

export { SyncIndicatorSkeleton } from "./sync-indicator"

/**
 * Pedaços do layout que dependem da sessão. Ficam atrás de Suspense para não
 * segurar o resto da página (com Cache Components, ler cookies fora de um
 * Suspense quebra o build).
 */

export async function SessionUserMenu() {
  const user = await getCurrentUser()
  return <UserMenu user={user} />
}

export function UserMenuSkeleton() {
  return (
    <div className="flex items-center gap-2 p-2" aria-hidden>
      <Skeleton className="size-8 rounded-lg" />
      <div className="grid flex-1 gap-1">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  )
}

/** Indicador do cabeçalho. Lê as execuções e as conexões aqui; o resto da regra está em `sync-status.ts`. */
export async function SessionSyncStatus() {
  const [runs, connections, now] = await Promise.all([getSyncRuns(), getConnections(), getNow()])
  return <SyncIndicator summary={summarizeSync(runs, connections, now)} />
}
