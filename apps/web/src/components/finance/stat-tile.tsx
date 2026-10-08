import type * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/**
 * Indicador principal (KPI): rótulo, valor grande e uma linha de contexto.
 * Valor em algarismos proporcionais (sem tabular-nums), como pede o dataviz.
 */
export function StatTile({
  label,
  value,
  hint,
  icon,
  className,
  children,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ReactNode
  className?: string
  children?: React.ReactNode
}) {
  return (
    <Card className={cn("gap-0 py-4", className)}>
      <CardContent className="space-y-1.5 px-4">
        <div className="text-muted-foreground flex items-center justify-between gap-2 text-sm">
          <span>{label}</span>
          {icon && <span className="[&_svg]:size-4">{icon}</span>}
        </div>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        {hint && <div className="text-muted-foreground text-xs">{hint}</div>}
        {children}
      </CardContent>
    </Card>
  )
}
