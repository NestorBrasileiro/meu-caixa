"use client"

import { Receipt } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
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
  open: { label: "Fatura em aberto", color: "var(--chart-1)" },
  closed: { label: "Fatura fechada", color: "var(--chart-muted)" },
  average: { label: "Média das fechadas", color: "var(--chart-axis)" },
} satisfies ChartConfig

type InvoiceDatum = InvoicePoint & { fill: string }

const Y_AXIS_WIDTH = 52
const CHART_MARGIN = { top: 8, right: 4, left: 0, bottom: 0 }

/**
 * De quantos em quantos meses vai um rótulo no eixo. Em vez de deixar o Recharts descartar rótulos (e com
 * eles a virada do ano), escolhemos: todos se couberem; senão um a cada 2 (ou 3, 4…).
 */
function tickStep(plotWidth: number | null, count: number): number {
  if (plotWidth === null || count === 0) return 1
  const slot = plotWidth / count
  // "dez" ≈ 20 px e "jan/26" ≈ 36 px a 12 px; dois rótulos com ano só ficam vizinhos com passo ≥ 2.
  return slot >= 36 ? 1 : ([2, 3, 4, 6].find((step) => slot * step >= 42) ?? 12)
}

/**
 * Rótulos contados a partir da última fatura (a em aberto), que sempre aparece. O ano vai no primeiro
 * rótulo visível e no primeiro de cada ano novo.
 */
function monthTicks(
  points: Pick<InvoicePoint, "month">[],
  step: number,
): { ticks: string[]; labels: Map<string, string> } {
  const last = points.length - 1
  const ticks = points.filter((_, index) => (last - index) % step === 0).map((point) => point.month)
  const labels = new Map<string, string>()
  let previousYear: string | null = null
  for (const month of ticks) {
    const year = month.slice(0, 4)
    labels.set(month, formatMonthShort(month, year !== previousYear))
    previousYear = year
  }
  return { ticks, labels }
}

/** Largura do elemento, acompanhando redimensionamentos (null até a primeira medida). */
function useElementWidth(): [(element: HTMLDivElement | null) => () => void, number | null] {
  const [width, setWidth] = useState<number | null>(null)
  const ref = useCallback((element: HTMLDivElement | null) => {
    if (!element) return () => {}
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

/** Barra com a cor da própria fatura (em aberto em destaque, fechadas em cinza). */
function InvoiceBar(props: BarShapeProps) {
  const datum = props.payload as InvoiceDatum | undefined
  return <Rectangle {...props} fill={datum?.fill ?? "var(--color-closed)"} />
}

/** Histórico das últimas faturas de um cartão: gráfico de colunas com a em aberto em destaque, ou tabela. */
export function InvoicesCard({ history }: { history: InvoiceHistory }) {
  const data: InvoiceDatum[] = history.points.map((point) => ({
    ...point,
    fill: point.open ? "var(--color-open)" : "var(--color-closed)",
  }))
  const newestFirst = [...history.points].reverse()
  const period = periodLabel(history.points, (month) => formatMonthShort(month, true))

  return (
    <Tabs defaultValue="chart" className="gap-0">
      <Card>
        <CardHeader>
          <CardTitle className="col-start-1">
            <h2>Faturas do cartão</h2>
          </CardTitle>
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
        <CardContent className="flex flex-col gap-5">
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
                <InvoiceChart data={data} averageClosed={history.averageClosed} />
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

/** Colunas das faturas: a em aberto em destaque (chart-1), as fechadas em cinza, a média como linha. */
function InvoiceChart({ data, averageClosed }: { data: InvoiceDatum[]; averageClosed: number | null }) {
  const [ref, width] = useElementWidth()
  const plotWidth = width === null ? null : width - Y_AXIS_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right
  const step = tickStep(plotWidth, data.length)
  // Memorizados: o gráfico só recalcula os eixos quando os dados ou o passo dos rótulos mudam.
  const axis = useMemo(() => niceAxis(Math.max(0, ...data.map((point) => point.total))), [data])
  const axisTicks = useMemo(() => monthTicks(data, step), [data, step])

  return (
    <ChartContainer ref={ref} config={chartConfig} className="aspect-auto h-[240px] w-full">
      <BarChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis
          dataKey="month"
          axisLine={false}
          tickLine={false}
          tickMargin={8}
          tick={{ fill: "var(--chart-axis)" }}
          ticks={axisTicks.ticks}
          interval={0}
          tickFormatter={(month: string) => axisTicks.labels.get(month) ?? formatMonthShort(month)}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          width={Y_AXIS_WIDTH}
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
                      {datum.open ? "Em aberto" : "Fechada"} · vence {formatDateShort(datum.dueDate)}
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
        {averageClosed !== null && <ReferenceLine y={averageClosed} stroke="var(--color-average)" strokeWidth={1.5} />}
        {/* Sem animação: as colunas aparecem prontas (e não somem quando o navegador recalcula o layout). */}
        <Bar dataKey="total" maxBarSize={24} radius={[4, 4, 0, 0]} shape={InvoiceBar} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  )
}

/** Os dois números que o gráfico compara: a fatura em aberto e a média das fechadas. */
function InvoiceFigures({ history }: { history: InvoiceHistory }) {
  const closed = history.closedCount
  return (
    <dl className="grid grid-cols-2 gap-4 sm:flex sm:gap-x-12">
      <div className="min-w-0 space-y-0.5">
        <dt className="text-muted-foreground text-xs">Fatura em aberto</dt>
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

/** Explica o destaque: a cor marca a fatura em aberto; a linha, a média. */
function InvoiceLegend({ history }: { history: InvoiceHistory }) {
  return (
    <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
      {history.open && (
        <li className="flex items-center gap-1.5">
          <span className="bg-chart-1 size-2.5 shrink-0 rounded-[2px]" aria-hidden />
          Fatura em aberto
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
              {point.open ? "Em aberto" : "Fechada"}
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
