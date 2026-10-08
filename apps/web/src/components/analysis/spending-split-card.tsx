"use client"

import { Scale } from "lucide-react"
import type { CSSProperties } from "react"
import { Bar, BarChart, Rectangle, XAxis, YAxis, type BarShapeProps } from "recharts"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
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
/**
 * Dica de uma linha (~26px) aberta acima da barra, no respiro de 36px entre a
 * descrição e a barra (gap do cartão + pt-3), sem cobrir texto nem a lista.
 */
const TOOLTIP_LIFT = 31

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
        <CardTitle role="heading" aria-level={3}>
          Para onde vai o dinheiro
        </CardTitle>
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
          <div className="space-y-4 pt-3">
            {/*
              Sem camada de teclado e fora da árvore de acessibilidade: a lista
              abaixo traz os mesmos valores. A dica mostra só o segmento sob o
              cursor e abre acima da barra, para não cobrir a lista.
            */}
            <ChartContainer config={chartConfig} className="aspect-auto w-full" style={{ height: BAR_SIZE }} aria-hidden>
              <BarChart
                data={rows}
                layout="vertical"
                margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                barCategoryGap={0}
                accessibilityLayer={false}
              >
                <XAxis type="number" hide domain={[0, total]} />
                <YAxis type="category" dataKey="name" hide />
                <ChartTooltip
                  cursor={false}
                  shared={false}
                  position={{ y: -TOOLTIP_LIFT }}
                  allowEscapeViewBox={{ x: false, y: true }}
                  content={
                    <ChartTooltipContent
                      hideLabel
                      className="min-w-56 py-1"
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
            <ul className="text-sm" aria-label={`Divisão do gasto médio mensal, ${periodLabel}`}>
              {legend.map((entry) => (
                <li key={entry.key} className="flex items-center gap-2 py-1">
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
      {total > 0 && (
        // Soma explícita dos dois segmentos, rotulada como tal (não como "gasto total do mês").
        // Rodapé como o "Total por mês" de "De onde vem a economia"; o valor alinha com os da lista.
        <CardFooter className="mt-auto gap-2 border-t text-sm [.border-t]:pt-4">
          <span className="text-muted-foreground min-w-0 flex-1 truncate">Fixos + variáveis</span>
          <span className="font-semibold tabular-nums">{formatMoney(total)}</span>
          <span className="w-10 shrink-0" aria-hidden />
        </CardFooter>
      )}
    </Card>
  )
}
