"use client"

import { Scale } from "lucide-react"
import type { CSSProperties } from "react"
import { Bar, BarChart, Rectangle, XAxis, YAxis, type BarShapeProps } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import type { Cents } from "@/lib/api/types"
import { formatMoney } from "@/lib/format/money"
import { splitPercent } from "./model"

const chartConfig = {
  fixed: { label: "Compromissos fixos", color: "var(--chart-1)" },
  discretionary: { label: "Gastos variáveis", color: "var(--chart-2)" },
} satisfies ChartConfig

type SeriesKey = keyof typeof chartConfig

interface SplitRow {
  name: string
  fixed: Cents
  discretionary: Cents
}

/** Metade do vão de 2px (na cor da superfície) entre os dois segmentos. */
const HALF_GAP = 1
const BAR_SIZE = 24

function isAlone(payload: SplitRow | undefined): boolean {
  return !payload || payload.fixed <= 0 || payload.discretionary <= 0
}

/** Primeiro segmento: ponta arredondada à esquerda, reta junto ao vão. */
function StartSegment(props: BarShapeProps) {
  if (isAlone(props.payload as SplitRow | undefined)) return <Rectangle {...props} radius={4} />
  return <Rectangle {...props} width={Math.max(0, props.width - HALF_GAP)} radius={[4, 0, 0, 4]} />
}

/** Último segmento: reta junto ao vão, ponta arredondada à direita. */
function EndSegment(props: BarShapeProps) {
  if (isAlone(props.payload as SplitRow | undefined)) return <Rectangle {...props} radius={4} />
  return (
    <Rectangle
      {...props}
      x={props.x + HALF_GAP}
      width={Math.max(0, props.width - HALF_GAP)}
      radius={[0, 4, 4, 0]}
    />
  )
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      className="size-2.5 shrink-0 rounded-[2px] bg-(--swatch)"
      style={{ "--swatch": color } as CSSProperties}
      aria-hidden
    />
  )
}

/**
 * Gasto médio mensal dividido em fixo (compromissos) e variável: uma barra
 * empilhada de 2 segmentos, com a legenda trazendo valores e percentuais.
 */
export function SpendingSplitCard({
  fixed,
  discretionary,
  periodLabel,
  className,
}: {
  fixed: Cents
  discretionary: Cents
  /** "jul a set" */
  periodLabel: string
  className?: string
}) {
  const total = fixed + discretionary
  const [fixedPercent, discretionaryPercent] = splitPercent(fixed, discretionary)
  const rows: SplitRow[] = [{ name: "Média mensal", fixed, discretionary }]
  const legend: { key: SeriesKey; value: Cents; percent: number }[] = [
    { key: "fixed", value: fixed, percent: fixedPercent },
    { key: "discretionary", value: discretionary, percent: discretionaryPercent },
  ]

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Para onde vai o dinheiro</CardTitle>
        <CardDescription>Média de {periodLabel}: o que é compromisso e o que é escolha.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {total <= 0 ? (
          <Empty className="border p-6 md:p-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Scale aria-hidden />
              </EmptyMedia>
              <EmptyTitle className="text-base">Sem gastos no período</EmptyTitle>
              <EmptyDescription>Quando houver gastos, a divisão entre fixos e variáveis aparece aqui.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-4">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-2xl font-semibold tracking-tight">{formatMoney(total)}</span>
              <span className="text-muted-foreground text-sm">por mês</span>
            </p>
            <ChartContainer config={chartConfig} className="aspect-auto w-full" style={{ height: BAR_SIZE }}>
              <BarChart
                data={rows}
                layout="vertical"
                margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                barCategoryGap={0}
                accessibilityLayer
              >
                <XAxis type="number" hide domain={[0, total]} />
                <YAxis type="category" dataKey="name" hide />
                <ChartTooltip
                  cursor={false}
                  allowEscapeViewBox={{ x: false, y: true }}
                  content={
                    <ChartTooltipContent
                      className="min-w-52"
                      labelFormatter={() => `Média mensal, ${periodLabel}`}
                      formatter={(value, name, item) => {
                        const key = String(name) as SeriesKey
                        const share = legend.find((entry) => entry.key === key)?.percent ?? 0
                        return (
                          <>
                            <Swatch color={item.color ?? `var(--color-${key})`} />
                            <span className="text-muted-foreground">{chartConfig[key]?.label ?? name}</span>
                            <span className="text-foreground ml-auto font-medium tabular-nums">
                              {formatMoney(Number(value))}
                            </span>
                            <span className="text-muted-foreground w-8 text-right tabular-nums">{share}%</span>
                          </>
                        )
                      }}
                    />
                  }
                />
                <Bar
                  dataKey="fixed"
                  stackId="split"
                  fill="var(--color-fixed)"
                  barSize={BAR_SIZE}
                  maxBarSize={24}
                  shape={StartSegment}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="discretionary"
                  stackId="split"
                  fill="var(--color-discretionary)"
                  barSize={BAR_SIZE}
                  maxBarSize={24}
                  shape={EndSegment}
                  isAnimationActive={false}
                />
              </BarChart>
            </ChartContainer>
            <ul className="space-y-2.5 text-sm" aria-label="Divisão do gasto médio">
              {legend.map((entry) => (
                <li key={entry.key} className="flex items-center gap-2">
                  <Swatch color={chartConfig[entry.key].color} />
                  <span className="min-w-0 flex-1 truncate">{chartConfig[entry.key].label}</span>
                  <span className="font-medium tabular-nums">{formatMoney(entry.value)}</span>
                  <span className="text-muted-foreground w-10 text-right tabular-nums">{entry.percent}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
