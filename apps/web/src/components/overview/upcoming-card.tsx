import { ArrowRight, CalendarCheck, CreditCard } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import type { IsoDate } from "@/lib/api/types"
import { formatDateLong, formatDateShort } from "@/lib/format/date"
import { formatMoney } from "@/lib/format/money"
import { cn } from "@/lib/utils"
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

/** Notas do rodapé sobre o que foi cobrado no cartão (dentro e fora do total). */
function cardNotes(items: UpcomingItem[]): string[] {
  const onCard = items.filter((item) => item.card !== null)
  const included = onCard.filter((item) => item.inTotal)
  const excluded = onCard.filter((item) => !item.inTotal)
  const sum = (list: UpcomingItem[]) => list.reduce((total, item) => total + item.amount, 0)
  const notes: string[] = []
  if (included.length > 0) {
    const dues = new Set(included.map((item) => item.card?.invoiceDue))
    const [due] = dues
    const invoice = dues.size === 1 && due ? `na fatura de ${formatDateShort(due)}` : "nas faturas da lista"
    notes.push(`Inclui ${formatMoney(sum(included))} cobrados no cartão, que entram ${invoice}.`)
  }
  if (excluded.length > 0) {
    notes.push(`Fora do total: ${formatMoney(sum(excluded))} no cartão, pagos numa fatura que vence depois.`)
  }
  return notes
}

export function UpcomingCard({
  items,
  until,
  horizonDays,
  hasCommitments,
  className,
}: {
  items: UpcomingItem[]
  until: IsoDate
  horizonDays: number
  /** Há compromissos cadastrados no planejamento (sem nenhum, o vazio convida a cadastrar). */
  hasCommitments: boolean
  className?: string
}) {
  const total = items.reduce((sum, item) => sum + (item.inTotal ? item.amount : 0), 0)
  const notes = cardNotes(items)

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>
          <h2>Próximos vencimentos</h2>
        </CardTitle>
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
              <EmptyDescription>
                {hasCommitments
                  ? "Compromissos fixos e faturas do cartão aparecem aqui perto do vencimento."
                  : "Cadastre aluguel, parcelas e assinaturas no planejamento para vê-los aqui perto do vencimento."}
              </EmptyDescription>
            </EmptyHeader>
            {!hasCommitments && (
              <EmptyContent>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/planejamento">
                    Ir para o planejamento
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </EmptyContent>
            )}
          </Empty>
        ) : (
          <ul className="divide-y">
            {items.map((item) => {
              const onCard = item.kind === "INVOICE" || item.card !== null
              return (
                <li key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <DateBadge date={item.date} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      {onCard && <CreditCard className="text-muted-foreground size-3.5 shrink-0" aria-hidden />}
                      <span className="line-clamp-2">{item.name}</span>
                    </p>
                    {item.detail && <p className="text-muted-foreground line-clamp-2 text-xs">{item.detail}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn("text-sm font-medium tabular-nums", !item.inTotal && "text-muted-foreground")}>
                      {formatMoney(item.amount)}
                      {!item.inTotal && <span className="sr-only"> (fora do total)</span>}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      <span className="sr-only">Vence em {formatDateLong(item.date)}, </span>
                      {relativeDays(item.daysAway)}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
      {items.length > 0 && (
        <CardFooter className="flex-col items-stretch gap-1 border-t text-sm [.border-t]:pt-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Total a pagar</span>
            <span className="font-semibold tabular-nums">{formatMoney(total)}</span>
          </div>
          {notes.map((note) => (
            <p key={note} className="text-muted-foreground text-xs">
              {note}
            </p>
          ))}
        </CardFooter>
      )}
    </Card>
  )
}
