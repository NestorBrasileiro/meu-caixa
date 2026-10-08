import { CircleX, ExternalLink, RefreshCw, TriangleAlert } from "lucide-react"
import type { Account, Connection } from "@/lib/api/types"
import { Alert } from "@/components/ui/alert"
import { formatDateShort, formatDateTime } from "@/lib/format/date"
import { MEU_PLUGGY_URL } from "./format"

/** Conexões que pedem ação do usuário (reconectar no Meu Pluggy). */
export function isProblemConnection(connection: Pick<Connection, "status">): boolean {
  return connection.status === "ACTION_REQUIRED" || connection.status === "ERROR"
}

const ALERT = {
  ERROR: {
    icon: CircleX,
    iconClass: "[&>svg]:text-status-critical",
    headline: "está com erro na sincronização",
  },
  ACTION_REQUIRED: {
    icon: TriangleAlert,
    iconClass: "[&>svg]:text-status-warning",
    headline: "pede login novamente",
  },
  UPDATING: {
    icon: RefreshCw,
    iconClass: "[&>svg]:text-muted-foreground",
    headline: "está atualizando agora",
  },
} as const

/** Data em que as transações da conexão pararam (a mais antiga entre as contas). */
function stoppedAt(connection: Connection, accounts: Account[]): string | null {
  const dates = accounts
    .filter((account) => account.connectionId === connection.id)
    .map((account) => account.transactionsSyncedThrough)
    .filter((date): date is string => date !== null)
    .sort()
  if (dates.length > 0) return `as transações pararam em ${formatDateShort(dates[0])}`
  if (connection.lastRefreshedAt) return `última atualização em ${formatDateTime(connection.lastRefreshedAt)}`
  return null
}

/**
 * Um aviso por conexão que não está ativa. Erro e login pedido trazem o caminho para resolver
 * no Meu Pluggy; atualização em andamento só avisa que os números podem mudar.
 */
export function ConnectionAlerts({ connections, accounts }: { connections: Connection[]; accounts: Account[] }) {
  const notActive = connections.filter((connection) => connection.status !== "ACTIVE")
  if (notActive.length === 0) return null

  return (
    <div className="space-y-3">
      {notActive.map((connection) => {
        const status = connection.status as Exclude<Connection["status"], "ACTIVE">
        const { icon: Icon, iconClass, headline } = ALERT[status]
        const actionable = isProblemConnection(connection)
        const detail = actionable ? stoppedAt(connection, accounts) : "saldos e transações podem mudar em instantes"

        return (
          <Alert key={connection.id} className={iconClass}>
            <Icon aria-hidden />
            <div className="col-start-2 flex flex-col gap-1.5 @2xl/page:flex-row @2xl/page:items-center @2xl/page:justify-between @2xl/page:gap-4">
              <p>
                <span className="font-medium">
                  {connection.institutionName} {headline}
                </span>
                {detail && <span className="text-muted-foreground"> — {detail}.</span>}
              </p>
              {actionable && (
                <a
                  href={MEU_PLUGGY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 font-medium underline-offset-4 hover:underline"
                >
                  Reconectar no Meu Pluggy
                  <ExternalLink className="size-3.5" aria-hidden />
                  <span className="sr-only">(abre em nova aba)</span>
                </a>
              )}
            </div>
          </Alert>
        )
      })}
    </div>
  )
}
