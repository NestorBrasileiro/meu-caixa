import { CalendarCheck, CreditCard } from "lucide-react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import type { IsoDate } from "@/lib/api/types"
import { formatDateLong, formatDateShort } from "@/lib/format/date"
import { formatMoney } from "@/lib/format/money"
import { relativeDays, type UpcomingItem } from "./model"

function DateBadge({ date }: { date: IsoDate }) {
  const [day, month] = formatDateShort(date).split(" ")
  return (
    <div
      className="bg-muted flex size-10 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md leading-none"
      aria-hidden
    >
      <span className="text-sm font-semibold tabular-nums">{day}</span>
      <span className="text-muted-foreground text-[10px] uppercase">{month}</span>
    </div>
  )
}

export function UpcomingCard({
  items,
  until,
  horizonDays,
  className,
}: {
  items: UpcomingItem[]
  until: IsoDate
  horizonDays: number
  className?: string
}) {
  const total = items.reduce((sum, item) => sum + (item.onCard ? 0 : item.amount), 0)
  const onCardTotal = items.reduce((sum, item) => sum + (item.onCard ? item.amount : 0), 0)

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Próximos vencimentos</CardTitle>
        <CardDescription>
          Compromissos e faturas até {formatDateShort(until)}, nos próximos {horizonDays} dias.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {items.length === 0 ? (
          <Empty className="h-full border p-6 md:p-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarCheck aria-hidden />
              </EmptyMedia>
              <EmptyTitle className="text-base">Nada vence nos próximos {horizonDays} dias</EmptyTitle>
              <EmptyDescription>Compromissos fixos e faturas do cartão aparecem aqui perto do vencimento.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <DateBadge date={item.date} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    {item.kind === "INVOICE" && (
                      <CreditCard className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                    )}
                    <span className="line-clamp-2">{item.name}</span>
                  </p>
                  {item.detail && <p className="text-muted-foreground line-clamp-2 text-xs">{item.detail}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-medium tabular-nums">{formatMoney(item.amount)}</p>
                  <p className="text-muted-foreground text-xs">
                    <span className="sr-only">Vence em {formatDateLong(item.date)}, </span>
                    {relativeDays(item.daysAway)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {items.length > 0 && (
        <CardFooter className="flex-col items-stretch gap-1 border-t text-sm [.border-t]:pt-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Total a pagar</span>
            <span className="font-semibold tabular-nums">{formatMoney(total)}</span>
          </div>
          {onCardTotal > 0 && (
            <p className="text-muted-foreground text-xs">
              Fora do total: {formatMoney(onCardTotal)} cobrados no cartão.
            </p>
          )}
        </CardFooter>
      )}
    </Card>
  )
}
