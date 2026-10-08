"use client"

import { ReceiptText } from "lucide-react"
import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import type { Cents } from "@/lib/api/types"
import { formatMonth } from "@/lib/format/date"
import { formatMoney, formatPercent } from "@/lib/format/money"
import { monthNameOf, type CategoryBar } from "./model"
import { HEADER_ACTION_CLASS, HEADER_DESCRIPTION_CLASS } from "./styles"
import { ViewToggle } from "./view-toggle"

const chartConfig = {
  total: { label: "Gasto", color: "var(--chart-1)" },
} satisfies ChartConfig

/** Altura mínima por categoria; no desktop o gráfico cresce até a altura da linha do grid. */
const BAR_ROW_HEIGHT = 34

/**
 * Rótulo de categoria numa linha só (o <Text> do Recharts quebra palavras
 * conforme a largura estimada do eixo). Recebe x/y/payload via cloneElement.
 */
function CategoryTick({ x, y, payload }: { x?: number | string; y?: number | string; payload?: { value?: string } }) {
  return (
    <text x={x} y={y} dx={-8} dy="0.355em" textAnchor="end" fontSize={12} className="fill-chart-axis">
      {payload?.value}
    </text>
  )
}

/** Largura do eixo de categorias pelo rótulo mais longo (12px ≈ 6,5px por caractere). */
function categoryAxisWidth(rows: CategoryBar[]): number {
  const longest = Math.max(0, ...rows.map((row) => row.label.length))
  return Math.min(160, Math.max(72, Math.ceil(longest * 6.5) + 14))
}

function groupedHint(row: CategoryBar): string | null {
  return row.grouped > 0 ? `${row.grouped} categorias` : null
}

export function SpendingCard({
  rows,
  total,
  month,
  className,
}: {
  rows: CategoryBar[]
  total: Cents
  /** Mês fechado, `YYYY-MM`. */
  month: string
  className?: string
}) {
  const monthLabel = formatMonth(month)
  return (
    <Card className={className}>
      <Tabs defaultValue="chart" className="flex-1 gap-6">
        <CardHeader>
          <CardTitle>
            <h2>Gastos por categoria</h2>
          </CardTitle>
          <CardDescription className={HEADER_DESCRIPTION_CLASS}>
            Em {monthLabel}, o último mês fechado. Cartão e contas, sem pagamento de fatura.
          </CardDescription>
          {rows.length > 0 && (
            <CardAction className={HEADER_ACTION_CLASS}>
              <ViewToggle />
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex flex-1 flex-col">
          {rows.length === 0 ? (
            <Empty className="border p-6 md:p-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ReceiptText aria-hidden />
                </EmptyMedia>
                <EmptyTitle className="text-base">Nenhum gasto em {monthLabel}</EmptyTitle>
                <EmptyDescription>Quando houver compras ou contas pagas no mês, elas aparecem aqui por categoria.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <TabsContent value="chart" className="flex flex-col">
                <ChartContainer
                  config={chartConfig}
                  className="aspect-auto w-full flex-1 [&_.recharts-label-list_text]:fill-foreground"
                  style={{ minHeight: rows.length * BAR_ROW_HEIGHT + 8 }}
                >
                  <BarChart
                    data={rows}
                    layout="vertical"
                    margin={{ top: 0, right: 76, bottom: 0, left: 0 }}
                    barCategoryGap={6}
                    accessibilityLayer
                  >
                    <XAxis type="number" dataKey="total" hide domain={[0, "dataMax"]} />
                    <YAxis
                      type="category"
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={<CategoryTick />}
                      width={categoryAxisWidth(rows)}
                      interval={0}
                    />
                    <ChartTooltip
                      cursor={{ fill: "var(--muted)", opacity: 0.6 }}
                      content={
                        <ChartTooltipContent
                          className="min-w-44"
                          labelFormatter={(_, payload) => {
                            const row = payload?.[0]?.payload as CategoryBar | undefined
                            return row?.label ?? null
                          }}
                          formatter={(value, _name, item) => {
                            const row = item.payload as CategoryBar
                            const hint = groupedHint(row)
                            return (
                              <span className="flex basis-full flex-col gap-1">
                                <span className="flex justify-between gap-4">
                                  <span className="text-muted-foreground">Gasto</span>
                                  <span className="text-foreground font-medium tabular-nums">
                                    {formatMoney(Number(value))}
                                  </span>
                                </span>
                                <span className="flex justify-between gap-4">
                                  <span className="text-muted-foreground">Do total</span>
                                  <span className="text-foreground tabular-nums">{formatPercent(row.share)}</span>
                                </span>
                                <span className="text-muted-foreground">
                                  {row.count === 1 ? "1 lançamento" : `${row.count} lançamentos`}
                                  {hint ? ` em ${hint}` : ""}
                                </span>
                              </span>
                            )
                          }}
                        />
                      }
                    />
                    <Bar
                      dataKey="total"
                      fill="var(--color-total)"
                      radius={[0, 4, 4, 0]}
                      maxBarSize={24}
                      isAnimationActive={false}
                    >
                      <LabelList
                        dataKey="total"
                        position="right"
                        offset={8}
                        className="tabular-nums"
                        fontSize={12}
                        formatter={(value) => formatMoney(Number(value))}
                      />
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </TabsContent>
              <TabsContent value="table">
                <Table>
                  <TableCaption className="sr-only">Gastos por categoria em {monthLabel}</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="text-right">Do total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const hint = groupedHint(row)
                      return (
                        <TableRow key={row.key}>
                          <TableCell>
                            {row.label}
                            {hint && <span className="text-muted-foreground block text-xs">{hint}</span>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatMoney(row.total)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatPercent(row.share)}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </TabsContent>
            </>
          )}
        </CardContent>
        {rows.length > 0 && (
          <CardFooter className="justify-between border-t pt-4 text-sm [.border-t]:pt-4">
            <span className="text-muted-foreground">Total em {monthNameOf(month)}</span>
            <span className="font-semibold tabular-nums">{formatMoney(total)}</span>
          </CardFooter>
        )}
      </Tabs>
    </Card>
  )
}
