import { AlertTriangle, CheckCircle2, CircleSlash, PartyPopper } from "lucide-react"
import type { ReactNode } from "react"
import { Money } from "@/components/finance/money"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatMonth, formatMonthShort } from "@/lib/format/date"
import { formatMoney, formatPercent } from "@/lib/format/money"
import { cn } from "@/lib/utils"
import { ProgressMeter } from "./meters"
import { plural, type GoalProgress } from "./model"

function goalStatus(goal: GoalProgress) {
  if (goal.done) return { label: "Concluída", icon: PartyPopper, className: "text-status-good" }
  if (goal.delayMonths === null) return { label: "Sem aporte", icon: CircleSlash, className: "text-status-warning" }
  if (goal.delayMonths === 0) return { label: "No prazo", icon: CheckCircle2, className: "text-status-good" }
  return {
    label: `Atrasada ${plural(goal.delayMonths, "mês", "meses")}`,
    icon: AlertTriangle,
    className: "text-status-warning",
  }
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 @xs:block @xs:space-y-0.5">
      <dt className="text-muted-foreground text-sm @xs:text-xs">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  )
}

export function GoalCard({ goal, className }: { goal: GoalProgress; className?: string }) {
  const status = goalStatus(goal)
  const StatusIcon = status.icon

  return (
    <Card className={cn("@container/goal gap-4", className)}>
      {/*
        Cartão estreito: o selo desce para baixo da descrição em vez de espremer o título.
        O "!" vence o has-[card-action]:grid-cols-[1fr_auto] do CardHeader (o :has() pesa mais).
      */}
      <CardHeader className="@max-[25rem]/goal:grid-cols-1!">
        <CardTitle className="text-balance">
          <h4>{goal.name}</h4>
        </CardTitle>
        <CardDescription>{goal.accountName ? `Guardada em ${goal.accountName}` : "Meta de economia"}</CardDescription>
        <CardAction className="@max-[25rem]/goal:col-start-1 @max-[25rem]/goal:row-span-1 @max-[25rem]/goal:row-start-3 @max-[25rem]/goal:justify-self-start">
          <Badge variant="outline" className="gap-1 font-normal">
            <StatusIcon className={cn("size-3", status.className)} aria-hidden />
            {status.label}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="@container space-y-5">
        <div className="space-y-2">
          <p className="text-sm">
            <Money cents={goal.saved} className="text-xl font-semibold tracking-tight" />
            <span className="text-muted-foreground"> de {formatMoney(goal.target)}</span>
          </p>
          <ProgressMeter
            value={goal.share}
            label={`Progresso de ${goal.name}`}
            valueText={`${formatPercent(goal.share)} guardado, faltam ${formatMoney(goal.remaining)}`}
            className="h-2"
          />
          <p className="text-muted-foreground flex flex-wrap justify-between gap-x-3 text-xs">
            <span>
              <span className="text-foreground font-medium">{formatPercent(goal.share)}</span> guardado
            </span>
            <span>{goal.done ? "Meta atingida" : `Faltam ${formatMoney(goal.remaining)}`}</span>
          </p>
        </div>

        <dl className="grid gap-2 @xs:grid-cols-3 @xs:gap-3">
          <Fact label="Aporte mensal">
            <Money cents={goal.monthlyContribution} />
          </Fact>
          <Fact label="Conclusão prevista">
            {goal.projectedMonth ? (
              <span title={formatMonth(goal.projectedMonth)}>{formatMonthShort(goal.projectedMonth, true)}</span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </Fact>
          <Fact label="Prazo">
            <span title={formatMonth(goal.targetMonth)}>{formatMonthShort(goal.targetMonth, true)}</span>
          </Fact>
        </dl>

        {goal.requiredMonthly !== null && (
          <p className="text-muted-foreground text-xs">
            Para chegar em {formatMonthShort(goal.targetMonth, true)}, o aporte precisa ser de{" "}
            <span className="text-foreground font-medium whitespace-nowrap">
              {formatMoney(goal.requiredMonthly)}/mês
            </span>
            .
          </p>
        )}
      </CardContent>
    </Card>
  )
}
