"use client"

import { PiggyBank } from "lucide-react"
import type { CSSProperties } from "react"
import { Bar, BarChart, LabelList, XAxis, YAxis, type LabelProps } from "recharts"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import type { Cents } from "@/lib/api/types"
import { formatMoney } from "@/lib/format/money"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"
import { KIND } from "./meta"
import type { SavingsRow } from "./model"
import { ViewToggle } from "./view-toggle"

const chartConfig = {
  savings: { label: "Economia por mês", color: "var(--chart-1)" },
} satisfies ChartConfig

/**
 * Duas disposições: no desktop, nomes num eixo à esquerda (como "Gastos por
 * categoria" na visão geral); no celular, nome em cima e barra embaixo, para
 * as barras não ficarem espremidas ao lado dos nomes.
 */
const LAYOUT = {
  axis: { rowHeight: 36, barSize: 20 },
  stacked: { rowHeight: 52, barSize: 18 },
} as const
/** Espaço à direita para o valor na ponta da barra mais longa. */
const VALUE_GUTTER = 84
/** 12px ≈ 6,6px por caractere. */
const CHAR_WIDTH = 6.6

function truncate(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`
}

/** Largura do eixo de nomes pelo rótulo mais longo. */
function labelAxisWidth(rows: SavingsRow[]): number {
  const longest = Math.max(0, ...rows.map((row) => row.label.length))
  return Math.min(200, Math.max(80, Math.ceil(longest * CHAR_WIDTH) + 16))
}

/** Nome no eixo, numa linha só (o <Text> do Recharts quebraria palavras). */
function AxisLabel({
  x,
  y,
  payload,
  maxChars,
}: {
  x?: number | string
  y?: number | string
  payload?: { value?: string }
  maxChars: number
}) {
  return (
    <text x={x} y={y} dx={-8} dy="0.355em" textAnchor="end" fontSize={12} className="fill-muted-foreground">
      {truncate(String(payload?.value ?? ""), maxChars)}
    </text>
  )
}

/** Nome acima da barra (celular), em cor de texto (nunca na cor da série). */
function RowLabel(props: LabelProps) {
  const box = props.viewBox as { x?: number; y?: number } | undefined
  const parent = props.parentViewBox as { width?: number } | undefined
  if (box?.x === undefined || box.y === undefined) return null
  const maxChars = Math.floor((parent?.width ?? 300) / CHAR_WIDTH)
  return (
    <text x={box.x} y={box.y - 5} fontSize={12} className="fill-muted-foreground">
      {truncate(String(props.value ?? ""), maxChars)}
    </text>
  )
}

/** De onde vem a economia: barras horizontais da economia mensal de cada oportunidade. */
export function SavingsCard({ rows, className }: { rows: SavingsRow[]; className?: string }) {
  const total: Cents = rows.reduce((sum, row) => sum + row.savings, 0)
  const stacked = useIsMobile()
  const { barSize } = stacked ? LAYOUT.stacked : LAYOUT.axis
  const axisWidth = labelAxisWidth(rows)
  /*
   * A altura vem do CSS (mesmo ponto de quebra de useIsMobile), não do JS: o
   * HTML do servidor já sai com a altura certa no celular e nada pula na hidratação.
   */
  const heights = {
    "--chart-h-stacked": `${rows.length * LAYOUT.stacked.rowHeight}px`,
    "--chart-h-axis": `${rows.length * LAYOUT.axis.rowHeight}px`,
  } as CSSProperties

  return (
    <Card className={className}>
      <Tabs defaultValue="chart" className="gap-6">
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            De onde vem a economia
          </CardTitle>
          <CardDescription>Quanto cada oportunidade libera por mês.</CardDescription>
          {rows.length > 0 && (
            <CardAction>
              <ViewToggle />
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <Empty className="border p-6 md:p-6">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PiggyBank aria-hidden />
                </EmptyMedia>
                <EmptyTitle className="text-base">Nenhuma economia estimada</EmptyTitle>
                <EmptyDescription>Nenhum item desta análise traz valor de economia por mês.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              {/* O painel do gráfico não é parada de Tab: o foco vai direto ao gráfico (navegável com as setas). */}
              <TabsContent value="chart" tabIndex={-1}>
                <ChartContainer
                  config={chartConfig}
                  className={cn(
                    "aspect-auto h-(--chart-h-stacked) w-full rounded-md md:h-(--chart-h-axis)",
                    // Celular: a barra fica no meio da faixa, com o nome em cima; a sobra abaixo da última barra some.
                    "max-md:-mb-3",
                    "has-[.recharts-surface:focus-visible]:ring-ring/50 has-[.recharts-surface:focus-visible]:ring-[3px]",
                    "[&_.recharts-label-list_text]:fill-foreground",
                  )}
                  style={heights}
                >
                  <BarChart
                    data={rows}
                    layout="vertical"
                    margin={{ top: 0, right: VALUE_GUTTER, bottom: 0, left: 0 }}
                    barCategoryGap={stacked ? 0 : 8}
                    accessibilityLayer
                    aria-label="Economia mensal por oportunidade. Use as setas para percorrer as barras."
                  >
                    <XAxis type="number" hide domain={[0, "dataMax"]} />
                    {stacked ? (
                      <YAxis type="category" dataKey="id" hide />
                    ) : (
                      <YAxis
                        type="category"
                        dataKey="label"
                        axisLine={false}
                        tickLine={false}
                        interval={0}
                        width={axisWidth}
                        tick={<AxisLabel maxChars={Math.floor((axisWidth - 12) / CHAR_WIDTH)} />}
                      />
                    )}
                    <ChartTooltip
                      cursor={{ fill: "var(--muted)", opacity: 0.6 }}
                      content={
                        <ChartTooltipContent
                          className="max-w-64 min-w-48"
                          labelFormatter={(_, payload) => {
                            const row = payload?.[0]?.payload as SavingsRow | undefined
                            return row ? <span className="text-balance">{row.title}</span> : null
                          }}
                          formatter={(value, _name, item) => {
                            const row = item.payload as SavingsRow
                            return (
                              <span className="flex basis-full flex-col gap-1">
                                <span className="flex justify-between gap-4">
                                  <span className="text-muted-foreground">Economia</span>
                                  <span className="text-foreground font-medium tabular-nums">
                                    {formatMoney(Number(value))}/mês
                                  </span>
                                </span>
                                <span className="text-muted-foreground">{KIND[row.kind].singular}</span>
                              </span>
                            )
                          }}
                        />
                      }
                    />
                    <Bar
                      dataKey="savings"
                      fill="var(--color-savings)"
                      radius={[0, 4, 4, 0]}
                      barSize={barSize}
                      maxBarSize={24}
                      isAnimationActive={false}
                    >
                      {stacked && <LabelList dataKey="label" content={RowLabel} />}
                      <LabelList
                        dataKey="savings"
                        position="right"
                        offset={8}
                        fontSize={12}
                        className="font-medium tabular-nums"
                        formatter={(value) => formatMoney(Number(value))}
                      />
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </TabsContent>
              <TabsContent
                value="table"
                className="rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Oportunidade</TableHead>
                      <TableHead className="text-right">Por mês</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-normal">
                          <span className="block">{row.label}</span>
                          <span className="text-muted-foreground block text-xs">{KIND[row.kind].singular}</span>
                        </TableCell>
                        <TableCell className="text-right align-top tabular-nums">{formatMoney(row.savings)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
            </>
          )}
        </CardContent>
        {rows.length > 0 && (
          <CardFooter className={cn("justify-between border-t text-sm [.border-t]:pt-4")}>
            <span className="text-muted-foreground">Total por mês</span>
            <span className="font-semibold tabular-nums">{formatMoney(total)}</span>
          </CardFooter>
        )}
      </Tabs>
    </Card>
  )
}
