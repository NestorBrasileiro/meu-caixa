"use client"

import { Receipt } from "lucide-react"
import { Bar, BarChart, CartesianGrid, Rectangle, ReferenceLine, XAxis, YAxis, type BarShapeProps } from "recharts"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatDateShort, formatMonth, formatMonthShort } from "@/lib/format/date"
import { formatAxisMoney, formatMoney } from "@/lib/format/money"
import { niceAxis, periodLabel, type InvoiceHistory, type InvoicePoint } from "./invoices"

const chartConfig = {
  total: { label: "Valor" },
  open: { label: "Fatura aberta", color: "var(--chart-1)" },
  closed: { label: "Fatura fechada", color: "var(--chart-muted)" },
  average: { label: "Média das fechadas", color: "var(--chart-axis)" },
} satisfies ChartConfig

type InvoiceDatum = InvoicePoint & { fill: string }

/** Rótulo do eixo: mês curto, com o ano na primeira coluna e em janeiro. */
function monthTick(month: string, index: number): string {
  return formatMonthShort(month, index === 0 || month.endsWith("-01"))
}

/** Barra com a cor da própria fatura (aberta em destaque, fechadas em cinza). */
function InvoiceBar(props: BarShapeProps) {
  const datum = props.payload as InvoiceDatum | undefined
  return <Rectangle {...props} fill={datum?.fill ?? "var(--color-closed)"} />
}

/** Histórico das últimas faturas de um cartão: gráfico de colunas com a aberta em destaque, ou tabela. */
export function InvoicesCard({ history }: { history: InvoiceHistory }) {
  const data: InvoiceDatum[] = history.points.map((point) => ({
    ...point,
    fill: point.open ? "var(--color-open)" : "var(--color-closed)",
  }))
  const newestFirst = [...history.points].reverse()
  const axis = niceAxis(Math.max(0, ...history.points.map((point) => point.total)))
  const period = periodLabel(history.points, (month) => formatMonthShort(month, true))

  return (
    <Tabs defaultValue="chart" className="h-full gap-0">
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="col-start-1">Faturas do cartão</CardTitle>
          <CardDescription className="col-start-1">
            {/* Quebra depois do "·", nunca antes, e o período fica inteiro. */}
            {history.cardName}
            {period && (
              <>
                {"\u00a0· "}
                <span className="whitespace-nowrap">{period}</span>
              </>
            )}
          </CardDescription>
          {data.length > 0 && (
            // Celular: o seletor desce para baixo da descrição, que assim não espreme em três linhas.
            <CardAction className="col-span-2 col-start-1 row-span-1 row-start-3 justify-self-start pt-2 sm:col-span-1 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:justify-self-end sm:pt-0">
              <TabsList aria-label="Visualização das faturas">
                <TabsTrigger value="chart">Gráfico</TabsTrigger>
                <TabsTrigger value="table">Tabela</TabsTrigger>
              </TabsList>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-5">
          {data.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Receipt aria-hidden />
                </EmptyMedia>
                <EmptyTitle>Nenhuma fatura ainda</EmptyTitle>
                <EmptyDescription>
                  As faturas aparecem aqui depois da primeira sincronização do cartão.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <InvoiceFigures history={history} />
              <TabsContent value="chart" className="space-y-3">
                <ChartContainer config={chartConfig} className="aspect-auto h-[240px] w-full">
                  <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                    <XAxis
                      dataKey="month"
                      axisLine={false}
                      tickLine={false}
                      tickMargin={8}
                      tick={{ fill: "var(--chart-axis)" }}
                      tickFormatter={monthTick}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      width={52}
                      domain={axis.domain}
                      ticks={axis.ticks}
                      interval={0}
                      tick={{ fill: "var(--chart-axis)" }}
                      tickFormatter={(value: number) => formatAxisMoney(value)}
                    />
                    <ChartTooltip
                      cursor={{ fill: "var(--muted)" }}
                      content={
                        <ChartTooltipContent
                          labelFormatter={(_, payload) => {
                            const datum = payload?.[0]?.payload as InvoiceDatum | undefined
                            return datum ? `Fatura de ${formatMonth(datum.month)}` : null
                          }}
                          formatter={(value, _name, item) => {
                            const datum = item.payload as InvoiceDatum
                            return (
                              <div className="flex w-full items-center gap-2">
                                <span
                                  className="size-2.5 shrink-0 rounded-[2px]"
                                  style={{ backgroundColor: datum.fill }}
                                  aria-hidden
                                />
                                <span className="text-muted-foreground">
                                  {datum.open ? "Aberta" : "Fechada"} · vence {formatDateShort(datum.dueDate)}
                                </span>
                                <span className="text-foreground ml-auto pl-3 font-mono font-medium tabular-nums">
                                  {formatMoney(Number(value))}
                                </span>
                              </div>
                            )
                          }}
                        />
                      }
                    />
                    {history.averageClosed !== null && (
                      <ReferenceLine y={history.averageClosed} stroke="var(--color-average)" strokeWidth={1.5} />
                    )}
                    <Bar dataKey="total" maxBarSize={24} radius={[4, 4, 0, 0]} shape={InvoiceBar} />
                  </BarChart>
                </ChartContainer>
                <InvoiceLegend history={history} />
              </TabsContent>
              <TabsContent value="table">
                <InvoiceTable points={newestFirst} averageClosed={history.averageClosed} />
              </TabsContent>
            </>
          )}
        </CardContent>
      </Card>
    </Tabs>
  )
}

/** Os dois números que o gráfico compara: a fatura aberta e a média das fechadas. */
function InvoiceFigures({ history }: { history: InvoiceHistory }) {
  const closed = history.closedCount
  return (
    <dl className="grid grid-cols-2 gap-4 sm:flex sm:gap-x-12">
      <div className="min-w-0 space-y-0.5">
        <dt className="text-muted-foreground text-xs">Fatura aberta</dt>
        <dd className="text-xl font-semibold tracking-tight">
          {history.open ? formatMoney(history.open.total) : "Nenhuma"}
        </dd>
        {history.open && (
          <dd className="text-muted-foreground text-xs">vence em {formatDateShort(history.open.dueDate)}</dd>
        )}
      </div>
      <div className="min-w-0 space-y-0.5">
        <dt className="text-muted-foreground text-xs">Média das fechadas</dt>
        <dd className="text-xl font-semibold tracking-tight">
          {history.averageClosed !== null ? formatMoney(history.averageClosed) : "—"}
        </dd>
        {closed > 0 && (
          <dd className="text-muted-foreground text-xs">{closed === 1 ? "1 fatura" : `${closed} faturas`}</dd>
        )}
      </div>
    </dl>
  )
}

/** Explica o destaque: a cor marca a fatura aberta; a linha, a média. */
function InvoiceLegend({ history }: { history: InvoiceHistory }) {
  return (
    <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
      {history.open && (
        <li className="flex items-center gap-1.5">
          <span className="bg-chart-1 size-2.5 shrink-0 rounded-[2px]" aria-hidden />
          Fatura aberta
          {history.open.closingDate && `, ainda recebe compras até ${formatDateShort(history.open.closingDate)}`}
        </li>
      )}
      <li className="flex items-center gap-1.5">
        <span className="bg-chart-muted size-2.5 shrink-0 rounded-[2px]" aria-hidden />
        Fechadas
      </li>
      {history.averageClosed !== null && (
        <li className="flex items-center gap-1.5">
          <span className="bg-chart-axis h-[2px] w-3 shrink-0 rounded-full" aria-hidden />
          Média das fechadas
        </li>
      )}
    </ul>
  )
}

function InvoiceTable({ points, averageClosed }: { points: InvoicePoint[]; averageClosed: number | null }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fatura</TableHead>
          <TableHead className="hidden sm:table-cell">Fecha em</TableHead>
          <TableHead>Vence em</TableHead>
          <TableHead>Situação</TableHead>
          <TableHead className="text-right">Valor</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {points.map((point) => (
          <TableRow key={point.id}>
            <TableCell>{formatMonthShort(point.month, true)}</TableCell>
            <TableCell className="text-muted-foreground hidden sm:table-cell">
              {point.closingDate ? formatDateShort(point.closingDate) : "—"}
            </TableCell>
            <TableCell className="text-muted-foreground">{formatDateShort(point.dueDate)}</TableCell>
            <TableCell className={point.open ? "font-medium" : "text-muted-foreground"}>
              {point.open ? "Aberta" : "Fechada"}
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatMoney(point.total)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
      {averageClosed !== null && (
        <TableFooter>
          <TableRow>
            <TableCell colSpan={3} className="sm:hidden">
              Média das fechadas
            </TableCell>
            <TableCell colSpan={4} className="hidden sm:table-cell">
              Média das fechadas
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatMoney(averageClosed)}</TableCell>
          </TableRow>
        </TableFooter>
      )}
    </Table>
  )
}
