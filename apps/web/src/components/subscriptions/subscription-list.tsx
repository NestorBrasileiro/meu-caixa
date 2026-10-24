import { CalendarCheck, TrendingUp } from "lucide-react"
import { Money } from "@/components/finance/money"
import { Badge } from "@/components/ui/badge"
import type { BudgetCategory } from "@/lib/api/planning"
import type { Subscription } from "@/lib/api/subscriptions"
import type { IsoDate } from "@/lib/api/types"
import { categoryLabel } from "@/lib/format/category"
import { formatDateShort, formatMonthShort } from "@/lib/format/date"
import { cn } from "@/lib/utils"
import { chargedOn, intervalLabel, nextChargeLabel, priceIncreaseLabel, type SubscriptionSection } from "./model"
import { SubscriptionActions } from "./subscription-actions"

/** Linha de uma cobrança recorrente: nome e selos, onde cai, valor por mês e a data que importa. */
function SubscriptionRow({
  subscription,
  section,
  categories,
  today,
  readOnly,
}: {
  subscription: Subscription
  section: SubscriptionSection
  categories: BudgetCategory[]
  today: IsoDate
  readOnly: boolean
}) {
  const increase = priceIncreaseLabel(subscription)
  const when =
    section === "active" ? nextChargeLabel(subscription, today) : `Última em ${formatDateShort(subscription.lastDate)}`
  const detail = [
    chargedOn(subscription),
    intervalLabel(subscription) ?? `Dia ${subscription.dayOfMonth}`,
    subscription.category ? categoryLabel(subscription.category) : null,
    `desde ${formatMonthShort(subscription.since.slice(0, 7), true)}`,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <li className={cn("flex items-start gap-3 py-3", section === "hidden" && "text-muted-foreground")}>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate font-medium">{subscription.name}</p>
          {subscription.variable && <Badge variant="outline">Valor variável</Badge>}
          {subscription.source === "PROMOTED" && section === "active" && (
            <Badge variant="outline">Marcada por você</Badge>
          )}
          {subscription.plannedCommitmentId && (
            <Badge variant="secondary">
              <CalendarCheck aria-hidden />
              No planejamento
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground text-xs">{detail}</p>
        {increase && (
          <p className="flex items-center gap-1 text-xs">
            <TrendingUp className="text-status-warning size-3.5 shrink-0" aria-hidden />
            {increase}
          </p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="font-medium tabular-nums">
          <Money cents={subscription.monthlyCost} />
          <span className="text-muted-foreground text-xs font-normal">/mês</span>
        </p>
        <p className="text-muted-foreground text-xs">{when}</p>
      </div>
      <div className="-mr-2 shrink-0">
        <SubscriptionActions
          subscription={subscription}
          section={section}
          categories={categories}
          today={today}
          readOnly={readOnly}
        />
      </div>
    </li>
  )
}

export function SubscriptionList({
  items,
  section,
  categories,
  today,
  readOnly,
  label,
}: {
  items: Subscription[]
  section: SubscriptionSection
  categories: BudgetCategory[]
  today: IsoDate
  readOnly: boolean
  /** Nome acessível da lista. */
  label: string
}) {
  return (
    <ul className="divide-y" aria-label={label}>
      {items.map((subscription) => (
        <SubscriptionRow
          key={subscription.key}
          subscription={subscription}
          section={section}
          categories={categories}
          today={today}
          readOnly={readOnly}
        />
      ))}
    </ul>
  )
}
