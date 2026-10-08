import { AlertTriangle, CheckCircle2, ReceiptText, XCircle } from "lucide-react"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import type { Cents } from "@/lib/api/types"
import { formatMoney, formatPercent } from "@/lib/format/money"
import { cn } from "@/lib/utils"
import { listJoin, plural, type BudgetGroup, type BudgetRow } from "./model"
import { HEADER_ACTION_CLASS, HEADER_DESCRIPTION_CLASS, PANEL_FOCUS_CLASS } from "./styles"
import { ViewToggle } from "./view-toggle"

/** Posição (0–100%) de uma fração do orçamento na escala comum das barras. */
function position(ratio: number, scaleMax: number): string {
  return `${(Math.min(ratio, scaleMax) / scaleMax) * 100}%`
}

function OverLabel({ over, className }: { over: Cents; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <XCircle className="text-status-critical size-3.5 shrink-0" aria-hidden />
      {formatMoney(over)} acima
    </span>
  )
}

/** Barra do gasto (série principal) sobre a faixa do orçamento, com marcador fino em 100%. */
function BudgetBar({ row, scaleMax }: { row: BudgetRow; scaleMax: number }) {
  if (row.ratio === null) {
    return <p className="text-muted-foreground text-xs">Sem orçamento definido</p>
  }
  const budgetAt = position(1, scaleMax)
  return (
    <div className="relative h-3" aria-hidden>
      <div className="bg-foreground/[0.07] absolute inset-y-0 left-0 rounded-l-[2px]" style={{ width: budgetAt }} />
      {row.actual > 0 && (
        <div
          className="bg-chart-1 absolute inset-y-0 left-0 rounded-r-[4px]"
          style={{ width: position(row.ratio, scaleMax) }}
        />
      )}
      <div
        className="bg-foreground absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full"
        style={{ left: budgetAt }}
      />
    </div>
  )
}

/**
 * "Moradia, Energia e Internet": de onde vem o gasto da categoria (o que a
 * Visão geral mostra separado). null se não há gasto ou a única fonte tem o
 * mesmo nome da categoria.
 */
function sourcesOf(row: BudgetRow): string | null {
  if (row.sources.length === 0 || (row.sources.length === 1 && row.sources[0] === row.name)) return null
  return listJoin(row.sources)
}

function rowSummary(row: BudgetRow, monthName: string): string {
  const sources = sourcesOf(row)
  const includes = sources ? ` Inclui ${sources}.` : ""
  if (row.budget === null) {
    return `${row.name}: ${formatMoney(row.actual)} em ${monthName}, sem orçamento definido.${includes}`
  }
  const status =
    row.over > 0
      ? `${formatMoney(row.over)} acima do orçamento`
      : `${formatMoney(row.budget - row.actual)} abaixo do orçamento`
  return `${row.name}: ${formatMoney(row.actual)} de ${formatMoney(row.budget)} (${formatPercent(row.ratio ?? 0)}), ${status}.${includes}`
}

/** Rótulo do grupo com o total; um grupo acima do orçamento ganha o mesmo selo das linhas. */
function GroupHeader({ group }: { group: BudgetGroup }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b pb-1.5 text-xs">
      <span className="flex items-center gap-2">
        <h3 className="font-medium">{group.label}</h3>
        {group.actual > group.budget && <OverLabel over={group.actual - group.budget} className="font-medium" />}
      </span>
      <span className="ml-auto whitespace-nowrap tabular-nums">
        <span className="font-medium">{formatMoney(group.actual)}</span>
        <span className="text-muted-foreground"> de {formatMoney(group.budget)}</span>
      </span>
    </div>
  )
}

function ChartView({ groups, scaleMax, monthName }: { groups: BudgetGroup[]; scaleMax: number; monthName: string }) {
  return (
    <div className="space-y-5">
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-chart-1 size-2 rounded-[2px]" />
          Gasto em {monthName}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="bg-foreground h-3 w-0.5 rounded-full" />
          Orçamento do mês
        </span>
      </div>
      <div className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
        {groups.map((group) => (
          <section key={group.kind} aria-label={group.label} className="space-y-3">
            <GroupHeader group={group} />
            <ul className="space-y-3.5">
              {group.rows.map((row) => (
                <li key={row.id} className="space-y-1.5">
                  <span className="sr-only">{rowSummary(row, monthName)}</span>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm" aria-hidden>
                    <span className="flex min-w-0 items-center gap-2">
                      <span>{row.name}</span>
                      {row.over > 0 && <OverLabel over={row.over} className="text-xs font-medium" />}
                    </span>
                    <span className="ml-auto whitespace-nowrap">
                      <span className="font-medium tabular-nums">{formatMoney(row.actual)}</span>
                      {row.budget !== null && (
                        <span className="text-muted-foreground tabular-nums"> de {formatMoney(row.budget)}</span>
                      )}
                    </span>
                  </div>
                  <BudgetBar row={row} scaleMax={scaleMax} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

function Situation({ row }: { row: BudgetRow }) {
  if (row.budget === null) return <span className="text-muted-foreground">Sem orçamento</span>
  if (row.over > 0) return <OverLabel over={row.over} />
  return (
    <span className="inline-flex items-center gap-1">
      <CheckCircle2 className="text-status-good size-3.5 shrink-0" aria-hidden />
      {formatMoney(row.budget - row.actual)} abaixo
    </span>
  )
}

/** Cartão largo: tabela completa. Estreito (celular): lista com nome e situação na primeira linha. */
function TableView({ groups }: { groups: BudgetGroup[] }) {
  return (
    <div className="@container/budget-table">
      <div className="hidden @xl/budget-table:block">
        <WideTable groups={groups} />
      </div>
      <div className="space-y-6 @xl/budget-table:hidden">
        {groups.map((group) => (
          <section key={group.kind} aria-label={group.label} className="space-y-3">
            <GroupHeader group={group} />
            <ul className="divide-y">
              {group.rows.map((row) => (
                <li key={row.id} className="space-y-0.5 py-3 text-sm first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="font-medium">{row.name}</span>
                    <span className="ml-auto text-right">
                      <Situation row={row} />
                    </span>
                  </div>
                  <p className="text-muted-foreground tabular-nums">
                    {formatMoney(row.actual)}
                    {row.budget !== null && (
                      <>
                        {" "}
                        de {formatMoney(row.budget)} · {formatPercent(row.ratio ?? 0)} usado
                      </>
                    )}
                  </p>
                  {sourcesOf(row) && <p className="text-muted-foreground text-xs">{sourcesOf(row)}</p>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

function WideTable({ groups }: { groups: BudgetGroup[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-0">Categoria</TableHead>
          <TableHead className="text-right">Gasto</TableHead>
          <TableHead className="text-right">Orçamento</TableHead>
          <TableHead className="text-right">Usado</TableHead>
          <TableHead className="pr-0 text-right">Situação</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((group) => [
          <TableRow key={group.kind} className="hover:bg-transparent">
            <TableHead scope="colgroup" colSpan={5} className="text-muted-foreground h-8 pl-0 text-xs">
              {group.label}
            </TableHead>
          </TableRow>,
          ...group.rows.map((row) => (
            <TableRow key={row.id} className="hover:bg-transparent">
              <TableCell className="py-2.5 pl-0 whitespace-normal">
                <p>{row.name}</p>
                {sourcesOf(row) && <p className="text-muted-foreground text-xs">{sourcesOf(row)}</p>}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(row.actual)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {row.budget !== null ? formatMoney(row.budget) : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.ratio !== null ? formatPercent(row.ratio) : "—"}
              </TableCell>
              <TableCell className="pr-0 text-right">
                <Situation row={row} />
              </TableCell>
            </TableRow>
          )),
        ])}
      </TableBody>
    </Table>
  )
}

export function BudgetCard({
  groups,
  scaleMax,
  monthLabel,
  monthName,
  unbudgeted,
  staleNote,
  className,
}: {
  groups: BudgetGroup[]
  /** Fim da escala das barras, em frações do orçamento (ex.: 1,5 = 150%). */
  scaleMax: number
  /** "setembro de 2026" */
  monthLabel: string
  /** "setembro" */
  monthName: string
  /** Gasto do mês fora das categorias do orçamento. */
  unbudgeted: { total: Cents; labels: string[] }
  /** Aviso de conta desatualizada no mês, se houver. */
  staleNote: string | null
  className?: string
}) {
  const rows = groups.flatMap((group) => group.rows)
  const actual = rows.reduce((sum, row) => sum + row.actual, 0)
  const budget = rows.reduce((sum, row) => sum + (row.budget ?? 0), 0)
  const overCount = rows.filter((row) => row.over > 0).length

  return (
    <Card className={className}>
      <Tabs defaultValue="chart" className="flex-1 gap-6">
        <CardHeader>
          <CardTitle className="text-balance">
            <h2>Orçamento por categoria</h2>
          </CardTitle>
          <CardDescription className={HEADER_DESCRIPTION_CLASS}>
            Gasto em {monthLabel}, o último mês fechado, contra o orçamento de cada categoria.
          </CardDescription>
          {rows.length > 0 && (
            <CardAction className={HEADER_ACTION_CLASS}>
              <ViewToggle />
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex-1">
          {rows.length === 0 ? (
            <Empty className="h-full border p-6 md:p-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ReceiptText aria-hidden />
                </EmptyMedia>
                <EmptyTitle className="text-base">Nenhuma categoria no orçamento</EmptyTitle>
                <EmptyDescription>
                  Quando o orçamento tiver categorias com limite mensal, o gasto de cada uma aparece aqui.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <TabsContent value="chart" className={PANEL_FOCUS_CLASS}>
                <ChartView groups={groups} scaleMax={scaleMax} monthName={monthName} />
              </TabsContent>
              <TabsContent value="table" className={PANEL_FOCUS_CLASS}>
                <TableView groups={groups} />
              </TabsContent>
            </>
          )}
        </CardContent>
        {rows.length > 0 && (
          <CardFooter className="flex-col items-stretch gap-2 border-t text-sm [.border-t]:pt-4">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <span className="text-muted-foreground flex flex-wrap items-center gap-x-1.5">
                <span>Total em {monthName}</span>
                {overCount > 0 && (
                  <>
                    <span aria-hidden>·</span>
                    <span className="inline-flex items-center gap-1">
                      <XCircle className="text-status-critical size-3.5 shrink-0" aria-hidden />
                      {plural(overCount, "categoria acima", "categorias acima")}
                    </span>
                  </>
                )}
              </span>
              <span className="ml-auto whitespace-nowrap">
                <span className="font-semibold tabular-nums">{formatMoney(actual)}</span>
                <span className="text-muted-foreground tabular-nums"> de {formatMoney(budget)}</span>
              </span>
            </div>
            {unbudgeted.total > 0 && (
              <p className="text-muted-foreground text-xs">
                Fora do orçamento: {formatMoney(unbudgeted.total)} em {unbudgeted.labels.join(", ")}.
              </p>
            )}
            {staleNote && (
              <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
                <AlertTriangle className="text-status-warning mt-px size-3.5 shrink-0" aria-hidden />
                {staleNote}
              </p>
            )}
          </CardFooter>
        )}
      </Tabs>
    </Card>
  )
}
