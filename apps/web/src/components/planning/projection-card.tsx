"use client"

import { AlertTriangle, CheckCircle2, History, Info, LineChart } from "lucide-react"
import Link from "next/link"
import type { CSSProperties } from "react"
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, XAxis, YAxis, type LabelProps } from "recharts"
import { Money } from "@/components/finance/money"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import type { Cents } from "@/lib/api/types"
import { formatAxisMoney, formatMoney } from "@/lib/format/money"
import { cn } from "@/lib/utils"
import { extremeLabelIndexes, niceAxis } from "./chart-axis"
import { capitalize, type ProjectionRow } from "./model"
import { CHART_AXIS_CLASS, HEADER_ACTION_CLASS, HEADER_DESCRIPTION_CLASS, PANEL_FOCUS_CLASS } from "./styles"
import { ViewToggle } from "./view-toggle"

const chartConfig = {
  projectedBalance: { label: "Sobra prevista", color: "var(--chart-1)" },
  negative: { label: "Falta prevista", color: "var(--chart-8)" },
} satisfies ChartConfig

/** Linhas do detalhamento no tooltip e na tabela, na ordem da conta. */
const BREAKDOWN = [
  { key: "expectedIncome", label: "Renda", sign: 1 },
  { key: "commitments", label: "Compromissos", sign: -1 },
  { key: "goalContributions", label: "Metas", sign: -1 },
  { key: "expectedVariableSpending", label: "Gasto variável", sign: -1 },
] as const

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
 * Valor escrito só nos extremos: acima da barra positiva, abaixo da negativa.
 * A primeira e a última barra alinham o texto pela borda de fora para não
 * invadir o eixo nem ser cortado na ponta do gráfico.
 */
function ExtremeLabel(props: LabelProps & { highlight: Set<number>; lastIndex: number }) {
  const { x, y, width, height, value, index, highlight, lastIndex } = props
  if (index === undefined || !highlight.has(index)) return null
  const amount = Number(value)
  const anchor = index === lastIndex ? "end" : index === 0 ? "start" : "middle"
  const anchorX =
    anchor === "end" ? Number(x) + Number(width) : anchor === "start" ? Number(x) : Number(x) + Number(width) / 2
  const top = Math.min(Number(y), Number(y) + Number(height))
  const bottom = Math.max(Number(y), Number(y) + Number(height))
  return (
    <text
      x={anchorX}
      y={amount < 0 ? bottom + 14 : top - 6}
      textAnchor={anchor}
      fontSize={12}
      // Halo na cor do cartão: o texto continua legível quando cruza uma linha de grade.
      stroke="var(--card)"
      strokeWidth={3}
      paintOrder="stroke"
      className="fill-foreground font-medium"
    >
      {formatMoney(amount)}
    </text>
  )
}

/** Sem nenhum mês fechado com transações: explica em vez de desenhar barras negativas iguais. */
function NoHistory({ fixedOutflow }: { fixedOutflow: Cents }) {
  return (
    <Empty className="h-full border p-6 md:p-8">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <History aria-hidden />
        </EmptyMedia>
        <EmptyTitle className="text-base">Ainda sem histórico para projetar</EmptyTitle>
        <EmptyDescription>
          A projeção usa a média dos últimos 3 meses fechados. Sincronize suas contas para ver a sobra prevista.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" size="sm" asChild>
          <Link href="/contas">Ir para Contas</Link>
        </Button>
        {fixedOutflow > 0 && (
          <p className="text-muted-foreground text-xs">
            Por enquanto, compromissos e aportes em metas já somam{" "}
            <span className="text-foreground font-medium whitespace-nowrap">{formatMoney(fixedOutflow)}</span> por
            mês.
          </p>
        )}
      </EmptyContent>
    </Empty>
  )
}

/** Tabela da projeção; em cartão estreito vira lista com mês e sobra na primeira linha. */
function ProjectionTable({ rows }: { rows: ProjectionRow[] }) {
  return (
    <>
      <div className="hidden @2xl/projection:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-0">Mês</TableHead>
              {BREAKDOWN.map(({ key, label }) => (
                <TableHead key={key} className="text-right">
                  {label}
                </TableHead>
              ))}
              <TableHead className="pr-0 text-right">Sobra</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.month} className="hover:bg-transparent">
                <TableCell className="pl-0">{row.tick}</TableCell>
                {BREAKDOWN.map(({ key }) => (
                  <TableCell key={key} className="text-right tabular-nums">
                    {formatMoney(row[key])}
                  </TableCell>
                ))}
                <TableCell className="pr-0 text-right font-medium tabular-nums">
                  <Money cents={row.projectedBalance} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="divide-y @2xl/projection:hidden">
        {rows.map((row) => (
          <li key={row.month} className="space-y-1 py-3 text-sm first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{capitalize(row.label)}</span>
              <span className="flex items-baseline gap-1.5">
                <span className="text-muted-foreground text-xs">{row.projectedBalance < 0 ? "Falta" : "Sobra"}</span>
                <Money cents={row.projectedBalance} className="font-medium tabular-nums" />
              </span>
            </div>
            <dl className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
              {BREAKDOWN.map(({ key, label }) => (
                <div key={key} className="flex gap-1 whitespace-nowrap">
                  <dt>{label}</dt>
                  <dd className="tabular-nums">{formatMoney(row[key])}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  )
}

export function ProjectionCard({
  rows,
  callout,
  thinMarginNote,
  historyNote,
  noHistory,
  className,
}: {
  rows: ProjectionRow[]
  /** Frase sobre o mês no vermelho (null se nenhum). */
  callout: string | null
  /** Frase sobre os meses de sobra positiva mas apertada (null se nenhum). */
  thinMarginNote: string | null
  /** Aviso de histórico incompleto (só parte dos 3 meses tem transações). */
  historyNote: string | null
  /** Nenhum dos 3 meses tem transações: no lugar do gráfico, a explicação. */
  noHistory: { fixedOutflow: Cents } | null
  className?: string
}) {
  const balances = rows.map((row) => row.projectedBalance)
  const lastIndex = balances.length - 1
  // Rótulos seletivos: só os extremos, sem sobreposição; o resto fica no tooltip e na tabela.
  const highlight = new Set(extremeLabelIndexes(balances))
  // Domínio com o zero e ticks redondos e distintos (mesmo com todas as barras iguais).
  const axis = niceAxis(balances)
  const hasNegative = balances.some((value) => value < 0)
  const hasPositive = balances.some((value) => value >= 0)
  const showChart = rows.length > 0 && !noHistory

  return (
    <Card className={cn("@container/projection", className)}>
      <Tabs defaultValue="chart" className="flex-1 gap-6">
        <CardHeader>
          <CardTitle className="text-balance">
            <h2>Projeção dos próximos 6 meses</h2>
          </CardTitle>
          {/* Sem o alternador, o col-span criaria uma coluna implícita e espremeria o título. */}
          <CardDescription className={cn("col-start-1", showChart && HEADER_DESCRIPTION_CLASS)}>
            Renda prevista menos compromissos, aportes em metas e gasto variável médio.
          </CardDescription>
          {showChart && (
            // Com o cartão largo (≥ 64rem) gráfico e tabela ficam lado a lado e o alternador some.
            <CardAction className={cn(HEADER_ACTION_CLASS, "@5xl/projection:hidden")}>
              <ViewToggle />
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4">
          {noHistory ? (
            <NoHistory fixedOutflow={noHistory.fixedOutflow} />
          ) : rows.length === 0 ? (
            <Empty className="h-full border p-6 md:p-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <LineChart aria-hidden />
                </EmptyMedia>
                <EmptyTitle className="text-base">Sem projeção disponível</EmptyTitle>
                <EmptyDescription>
                  A projeção aparece quando houver renda prevista e compromissos cadastrados.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-x-10 gap-y-4 @5xl/projection:grid-cols-[minmax(0,1fr)_auto] @5xl/projection:items-start">
                {/* O svg do gráfico já recebe foco (accessibilityLayer): o painel não precisa ser outra parada. */}
                <TabsContent
                  value="chart"
                  forceMount
                  tabIndex={-1}
                  className="flex flex-col gap-3 data-[state=inactive]:hidden @5xl/projection:data-[state=inactive]:flex"
                >
                  <div
                    className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
                    aria-hidden
                  >
                    {hasPositive && (
                      <span className="inline-flex items-center gap-1.5">
                        <Swatch color="var(--chart-1)" />
                        Sobra
                      </span>
                    )}
                    {hasNegative && (
                      <span className="inline-flex items-center gap-1.5">
                        <Swatch color="var(--chart-8)" />
                        Falta
                      </span>
                    )}
                  </div>
                  <ChartContainer config={chartConfig} className={cn("aspect-auto h-[260px] w-full", CHART_AXIS_CLASS)}>
                    <BarChart data={rows} margin={{ top: 20, right: 4, bottom: 0, left: 0 }} accessibilityLayer>
                      <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                      <XAxis dataKey="tick" axisLine={false} tickLine={false} tickMargin={8} interval={0} />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        width={52}
                        tickMargin={4}
                        domain={axis.domain}
                        ticks={axis.ticks}
                        interval={0}
                        allowDataOverflow
                        tickFormatter={(value: number) => formatAxisMoney(value)}
                      />
                      <ReferenceLine y={0} stroke="var(--chart-axis)" />
                      <ChartTooltip
                        cursor={{ fill: "var(--muted)", opacity: 0.6 }}
                        content={
                          <ChartTooltipContent
                            className="min-w-52"
                            labelFormatter={(_, payload) => {
                              const row = payload?.[0]?.payload as ProjectionRow | undefined
                              return row ? capitalize(row.label) : null
                            }}
                            formatter={(_value, _name, item) => {
                              const row = item.payload as ProjectionRow
                              const negative = row.projectedBalance < 0
                              return (
                                <span className="flex basis-full flex-col gap-1">
                                  {BREAKDOWN.map(({ key, label, sign }) => (
                                    <span key={key} className="flex justify-between gap-4">
                                      <span className="text-muted-foreground">{label}</span>
                                      <span className="text-foreground tabular-nums">
                                        {formatMoney(sign * row[key], { signed: sign > 0 })}
                                      </span>
                                    </span>
                                  ))}
                                  <span className="mt-0.5 flex items-center gap-2 border-t pt-1.5">
                                    <Swatch color={negative ? "var(--chart-8)" : "var(--chart-1)"} />
                                    <span className="text-muted-foreground">{negative ? "Falta" : "Sobra"}</span>
                                    <span className="text-foreground ml-auto font-medium tabular-nums">
                                      {formatMoney(row.projectedBalance)}
                                    </span>
                                  </span>
                                </span>
                              )
                            }}
                          />
                        }
                      />
                      <Bar dataKey="projectedBalance" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
                        {rows.map((row) => (
                          <Cell
                            key={row.month}
                            fill={row.projectedBalance < 0 ? "var(--color-negative)" : "var(--color-projectedBalance)"}
                          />
                        ))}
                        <LabelList dataKey="projectedBalance" content={<ExtremeLabel highlight={highlight} lastIndex={lastIndex} />} />
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                  {thinMarginNote && (
                    <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
                      <AlertTriangle className="text-status-warning mt-px size-3.5 shrink-0" aria-hidden />
                      {thinMarginNote}
                    </p>
                  )}
                </TabsContent>
                <TabsContent
                  value="table"
                  forceMount
                  className={cn(
                    "data-[state=inactive]:hidden @5xl/projection:data-[state=inactive]:block",
                    PANEL_FOCUS_CLASS,
                  )}
                >
                  <ProjectionTable rows={rows} />
                </TabsContent>
              </div>
              {historyNote && (
                <p className="text-muted-foreground flex items-start gap-2 text-sm">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {historyNote}
                </p>
              )}
              {callout ? (
                <p className="bg-muted/50 flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm">
                  <AlertTriangle className="text-status-warning mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>{callout}</span>
                </p>
              ) : (
                <p className="text-muted-foreground flex items-start gap-2 text-sm">
                  <CheckCircle2 className="text-status-good mt-0.5 size-4 shrink-0" aria-hidden />
                  Nenhum mês fica no vermelho nos próximos 6 meses.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Tabs>
    </Card>
  )
}
