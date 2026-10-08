import type { Cents } from "@/lib/api/types"
import { formatMoney } from "@/lib/format/money"
import { cn } from "@/lib/utils"

/**
 * Valor em reais. `tone="flow"` pinta entradas de verde com "+" (saídas ficam
 * na cor do texto, com "−"): o sinal carrega o sentido, a cor só reforça.
 */
export function Money({
  cents,
  tone = "neutral",
  compact,
  className,
}: {
  cents: Cents
  tone?: "neutral" | "flow"
  compact?: boolean
  className?: string
}) {
  const positive = tone === "flow" && cents > 0
  return (
    <span className={cn("whitespace-nowrap", positive && "text-positive", className)}>
      {formatMoney(cents, { signed: tone === "flow", compact })}
    </span>
  )
}
