import { ArrowRight, Droplets, Flame, Sparkles } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { formatMoney } from "@/lib/format/money"
import type { LeakItem } from "./model"

const KIND = {
  LEAK: { label: "Vazamento", icon: Droplets },
  SIN: { label: "Gasto do pecado", icon: Flame },
} as const

export function LeaksCard({
  items,
  periodLabel,
  className,
}: {
  items: LeakItem[]
  /** "jul a set" */
  periodLabel: string
  className?: string
}) {
  const total = items.reduce((sum, item) => sum + (item.monthlySavings ?? 0), 0)

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>
          <h3>Maiores vazamentos</h3>
        </CardTitle>
        <CardDescription>
          {total > 0 ? (
            <>
              Juntos, dá para economizar{" "}
              <span className="text-foreground font-medium whitespace-nowrap">{formatMoney(total)}</span> por mês,
              segundo a análise do Claude sobre <span className="whitespace-nowrap">{periodLabel}</span>.
            </>
          ) : (
            <>
              Da análise do Claude sobre <span className="whitespace-nowrap">{periodLabel}</span>.
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {items.length === 0 ? (
          <Empty className="h-full border p-6 md:p-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Sparkles aria-hidden />
              </EmptyMedia>
              <EmptyTitle className="text-base">Nenhum vazamento encontrado</EmptyTitle>
              <EmptyDescription>A análise não achou assinaturas esquecidas, tarifas ou gastos do pecado.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y">
            {items.map((item) => {
              const { label, icon: Icon } = KIND[item.kind]
              return (
                <li key={item.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-md">
                    <Icon className="text-muted-foreground size-4" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm leading-snug font-medium">{item.title}</p>
                    <p className="text-muted-foreground text-sm">{item.reason}</p>
                    <p className="text-muted-foreground text-xs">
                      {label}
                      {item.monthlySavings !== null && (
                        <>
                          {" · economia de "}
                          <span className="text-foreground font-medium whitespace-nowrap">
                            {formatMoney(item.monthlySavings)}/mês
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
      <CardFooter className="border-t [.border-t]:pt-4">
        <Button variant="ghost" size="sm" className="-my-1.5 -ml-2.5" asChild>
          <Link href="/analise">
            Ver análise completa
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}
