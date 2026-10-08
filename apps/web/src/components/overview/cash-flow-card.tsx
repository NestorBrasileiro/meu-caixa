"use client"

import type { CSSProperties } from "react"
import { Bar, BarChart, CartesianGrid, Rectangle, XAxis, YAxis, type BarShapeProps } from "recharts"
import { Money } from "@/components/finance/money"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import type { Cents } from "@/lib/api/types"
import { formatMonth, formatMonthShort } from "@/lib/format/date"
import { formatAxisMoney, formatMoney } from "@/lib/format/money"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"
import { capitalize } from "./model"
import { CHART_AXIS_CLASS, HEADER_ACTION_CLASS, HEADER_DESCRIPTION_CLASS } from "./styles"
import { ViewToggle } from "./view-toggle"

export interface CashFlowRow {
  /** `YYYY-MM` */
  month: string
  inflow: Cents
  outflow: Cents
  net: Cents
  /** Mês corrente, ainda incompleto. */
  partial: boolean
}

const chartConfig = {
  inflow: { label: "Entradas", color: "var(--chart-1)" },
  outflow: { label: "Saídas", color: "var(--chart-2)" },
} satisfies ChartConfig

/** Mês parcial com barras esmaecidas: o leitor não confunde "pouco gasto" com "mês pela metade". */
function CashFlowBar(props: BarShapeProps) {
  const partial = (props.payload as CashFlowRow | undefined)?.partial
  return <Rectangle {...props} fillOpacity={partial ? 0.5 : 1} />
}

/**
 * Meses com rótulo no eixo: todos no desktop; no celular, um sim um não,
 * contando a partir do mês corrente (que sempre aparece).
 */
function visibleMonths(rows: CashFlowRow[], everyOther: boolean): string[] {
  const months = rows.map((row) => row.month)
  return everyOther ? months.filter((_, i) => (months.length - 1 - i) % 2 === 0) : months
}

/** "nov/25", "dez", "jan/26": o ano aparece no primeiro rótulo e quando muda. */
function monthTickFormatter(ticks: string[]) {
  return (month: string) => {
    const index = ticks.indexOf(month)
    const previous = ticks[index - 1]
    return formatMonthShort(month, index <= 0 || previous?.slice(0, 4) !== month.slice(0, 4))
  }
}

export interface PartialMonth {
  /** "outubro" */
  month: string
  /** Até que dia o mês corrente tem dados. */
  day: number
  /** Vencimento ("15 out") da fatura deste mês que ainda não foi paga. */
  pendingInvoiceDue: string | null
}

function partialNote(partial: PartialMonth, view: "chart" | "table"): string {
  const invoice = partial.pendingInvoiceDue
    ? ` Ainda sem a fatura do cartão, que vence em ${partial.pendingInvoiceDue}.`
    : ""
  const month = view === "chart" ? `Barras esmaecidas: ${partial.month}` : capitalize(partial.month)
  return `${month}, só até dia ${partial.day}.${invoice}`
}

export function CashFlowCard({
  rows,
  partial,
  className,
}: {
  rows: CashFlowRow[]
  /** Mês corrente incompleto, explicado numa nota de rodapé. */
  partial: PartialMonth | null
  className?: string
}) {
  const isMobile = useIsMobile()
  const ticks = visibleMonths(rows, isMobile)

  return (
    <Card className={className}>
      <Tabs defaultValue="chart" className="flex-1 gap-6">
        <CardHeader>
          <CardTitle>Fluxo de caixa</CardTitle>
          <CardDescription className={HEADER_DESCRIPTION_CLASS}>
            Entradas e saídas das contas nos últimos 12 meses. O cartão entra quando a fatura é paga.
          </CardDescription>
          <CardAction className={HEADER_ACTION_CLASS}>
            <ViewToggle />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col">
          <TabsContent value="chart" className="flex flex-col">
            {/* 280px no mínimo; no desktop cresce até a altura da linha do grid. */}
            <ChartContainer config={chartConfig} className={cn("aspect-auto min-h-70 w-full flex-1", CHART_AXIS_CLASS)}>
              <BarChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barGap={2} accessibilityLayer>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tickMargin={8}
                  ticks={ticks}
                  interval={0}
                  tickFormatter={monthTickFormatter(ticks)}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  tickMargin={4}
                  tickFormatter={(value: number) => formatAxisMoney(value)}
                />
                <ChartTooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.6 }}
                  content={
                    <ChartTooltipContent
                      className="min-w-44"
                      labelFormatter={(_, payload) => {
                        const row = payload?.[0]?.payload as CashFlowRow | undefined
                        if (!row) return null
                        return `${formatMonth(row.month)}${row.partial ? " (parcial)" : ""}`
                      }}
                      formatter={(value, name, item, index) => {
                        const row = item.payload as CashFlowRow
                        const key = String(name) as keyof typeof chartConfig
                        return (
                          <>
                            <span
                              className="size-2.5 shrink-0 rounded-[2px] bg-(--swatch)"
                              style={{ "--swatch": item.color } as CSSProperties}
                              aria-hidden
                            />
                            <span className="text-muted-foreground">{chartConfig[key]?.label ?? name}</span>
                            <span className="text-foreground ml-auto font-medium tabular-nums">
                              {formatMoney(Number(value))}
                            </span>
                            {index === 1 && (
                              <span className="mt-0.5 flex basis-full justify-between border-t pt-1.5">
                                <span className="text-muted-foreground">Resultado</span>
                                <Money cents={row.net} tone="flow" className="font-medium tabular-nums" />
                              </span>
                            )}
                          </>
                        )
                      }}
                    />
                  }
                />
                <ChartLegend
                  verticalAlign="top"
                  align="left"
                  content={<ChartLegendContent className="justify-start pt-0 pb-4" />}
                />
                {/* Sem animação de entrada: painel calmo, e as barras não somem ao redimensionar a janela. */}
                <Bar
                  dataKey="inflow"
                  fill="var(--color-inflow)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={24}
                  shape={CashFlowBar}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="outflow"
                  fill="var(--color-outflow)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={24}
                  shape={CashFlowBar}
                  isAnimationActive={false}
                />
              </BarChart>
            </ChartContainer>
            {partial && <p className="text-muted-foreground mt-3 text-xs">{partialNote(partial, "chart")}</p>}
          </TabsContent>
          <TabsContent value="table">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mês</TableHead>
                  <TableHead className="text-right">Entradas</TableHead>
                  <TableHead className="text-right">Saídas</TableHead>
                  <TableHead className="text-right">Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...rows].reverse().map((row) => (
                  <TableRow key={row.month}>
                    <TableCell>
                      {formatMonthShort(row.month, true)}
                      {row.partial && <span className="text-muted-foreground"> · parcial</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(row.inflow)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(row.outflow)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <Money cents={row.net} tone="flow" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {partial && <p className="text-muted-foreground mt-3 text-xs">{partialNote(partial, "table")}</p>}
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  )
}
