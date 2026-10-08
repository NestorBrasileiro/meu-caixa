import { TriangleAlert } from "lucide-react"
import type { Cents } from "@/lib/api/types"
import { formatMoney, formatPercent } from "@/lib/format/money"
import { cn } from "@/lib/utils"

/** A partir daqui o limite usado vira alerta (ícone + rótulo, nunca só cor). */
const NEAR_LIMIT = 0.8

/**
 * Medidor de limite do cartão. O trilho é um tom mais claro da mesma rampa do
 * preenchimento, para o estado ser lido na barra inteira.
 */
export function CreditLimitMeter({ used, limit }: { used: Cents; limit: Cents }) {
  const fraction = limit > 0 ? used / limit : 0
  const width = Math.min(100, Math.max(0, fraction * 100))
  const over = fraction >= 1
  const near = !over && fraction >= NEAR_LIMIT

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">Limite usado</span>
        <span className="tabular-nums">{formatPercent(fraction)}</span>
      </div>
      <div
        role="meter"
        aria-label="Limite usado do cartão"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(used, limit)}
        aria-valuetext={`${formatMoney(used)} de ${formatMoney(limit)} (${formatPercent(fraction)})`}
        className={cn(
          "h-2 w-full overflow-hidden rounded-full",
          over ? "bg-status-critical/20" : near ? "bg-status-warning/20" : "bg-chart-1/20",
        )}
      >
        <div
          className={cn("h-full rounded-full", over ? "bg-status-critical" : near ? "bg-status-warning" : "bg-chart-1")}
          style={{ width: `${width}%` }}
        />
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-x-2 text-xs">
        <span>
          {formatMoney(used)} de {formatMoney(limit)}
        </span>
        {(near || over) && (
          <span className="text-foreground inline-flex items-center gap-1">
            <TriangleAlert
              className={cn("size-3", over ? "text-status-critical" : "text-status-warning")}
              aria-hidden
            />
            {over ? "Limite estourado" : "Perto do limite"}
          </span>
        )}
      </div>
    </div>
  )
}
