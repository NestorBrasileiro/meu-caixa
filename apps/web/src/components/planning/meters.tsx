import { formatMonthShort } from "@/lib/format/date"
import { formatPercent } from "@/lib/format/money"
import { cn } from "@/lib/utils"

/** Barra fina de progresso na rampa da série principal (trilho = mesmo tom, mais claro). */
export function ProgressMeter({
  value,
  label,
  valueText,
  className,
}: {
  /** 0–1 */
  value: number
  label: string
  valueText: string
  className?: string
}) {
  const share = Math.min(1, Math.max(0, value))
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(share * 100)}
      aria-valuetext={valueText}
      className={cn("bg-chart-1/15 h-1.5 overflow-hidden rounded-full", className)}
    >
      <div className="bg-chart-1 h-full rounded-full" style={{ width: `${share * 100}%` }} />
    </div>
  )
}

/** "38 de 120 parcelas · até ago/33" com a barra de progresso. */
export function InstallmentMeter({
  name,
  paid,
  total,
  endsOn,
  className,
}: {
  name: string
  paid: number
  total: number
  endsOn: string | null
  className?: string
}) {
  const share = total > 0 ? paid / total : 0
  return (
    <div className={cn("space-y-1.5", className)}>
      <ProgressMeter
        value={share}
        label={`Parcelas pagas de ${name}`}
        valueText={`${paid} de ${total} parcelas pagas (${formatPercent(share)})`}
      />
      <p className="text-muted-foreground text-xs">
        <span className="text-foreground tabular-nums">{paid}</span> de <span className="tabular-nums">{total}</span>{" "}
        parcelas
        {endsOn && <> · até {formatMonthShort(endsOn.slice(0, 7), true)}</>}
      </p>
    </div>
  )
}
