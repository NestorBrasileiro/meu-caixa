import { AlertTriangle, CheckCircle2, KeyRound, RefreshCw } from "lucide-react"
import type { ConnectionStatus } from "@/lib/api/types"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const STATUS: Record<
  ConnectionStatus,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  ACTIVE: { label: "Conectado", icon: CheckCircle2, className: "text-status-good" },
  UPDATING: { label: "Atualizando", icon: RefreshCw, className: "text-muted-foreground" },
  ACTION_REQUIRED: { label: "Pede login", icon: KeyRound, className: "text-status-warning" },
  ERROR: { label: "Com erro", icon: AlertTriangle, className: "text-status-critical" },
}

/** Status da conexão: ícone colorido + rótulo (a cor nunca carrega o sentido sozinha). */
export function ConnectionStatusBadge({ status, className }: { status: ConnectionStatus; className?: string }) {
  const { label, icon: Icon, className: iconClass } = STATUS[status]
  return (
    <Badge variant="outline" className={cn("gap-1 font-normal", className)}>
      <Icon className={cn("size-3", iconClass)} aria-hidden />
      {label}
    </Badge>
  )
}

export function connectionStatusLabel(status: ConnectionStatus): string {
  return STATUS[status].label
}
