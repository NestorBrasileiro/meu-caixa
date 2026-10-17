import { Skeleton } from "@/components/ui/skeleton"
import type { AuthUser } from "@/lib/api/types"
import { getConnections, getCurrentUser, getNow, getOpenFinanceSettings, getSyncRuns } from "@/lib/data"
import { loadOrNull } from "./fail-soft"
import { SyncIndicator, SyncIndicatorUnavailable } from "./sync-indicator"
import { summarizeSync } from "./sync-status"
import { UserMenu } from "./user-menu"

export { SyncIndicatorSkeleton } from "./sync-indicator"

/**
 * Pedaços do layout que dependem da sessão. Ficam atrás de Suspense para não
 * segurar o resto da página (com Cache Components, ler cookies fora de um
 * Suspense quebra o build).
 *
 * Também falham em silêncio: com a API fora do ar, o menu e o indicador viram substitutos neutros
 * e a página (com a sua própria mensagem de erro, em `app/(painel)/error.tsx`) continua de pé.
 */

/** Sessão sem os dados do usuário (API fora do ar): o menu continua lá, com "Sair". */
const UNKNOWN_USER: AuthUser = { id: "", username: null, name: null, email: null, roles: [] }

export async function SessionUserMenu() {
  const user = await loadOrNull("o usuário da sessão", getCurrentUser)
  return <UserMenu user={user ?? UNKNOWN_USER} />
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
  const [data, openFinance] = await Promise.all([
    loadOrNull("a situação da sincronização", () => Promise.all([getSyncRuns(), getConnections(), getNow()])),
    // Só refina o texto ("Open Finance não configurado"): sem ele, o indicador continua.
    loadOrNull("as configurações do Open Finance", getOpenFinanceSettings),
  ])
  if (!data) return <SyncIndicatorUnavailable />
  const [runs, connections, now] = data
  const notConfigured = openFinance?.mode.value === "none"
  return <SyncIndicator summary={summarizeSync(runs, connections, now, { notConfigured })} />
}
