import { CheckCircle2, CircleX, History, RefreshCw, TriangleAlert, type LucideIcon } from "lucide-react"
import type { SyncRun, SyncRunStatus, SyncTrigger } from "@/lib/api/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDateTime } from "@/lib/format/date"
import { cn } from "@/lib/utils"
import { durationSeconds, formatDuration } from "./format"

const RUN_STATUS: Record<SyncRunStatus, { label: string; icon: LucideIcon; className: string }> = {
  SUCCEEDED: { label: "Concluída", icon: CheckCircle2, className: "text-status-good" },
  PARTIAL: { label: "Parcial", icon: TriangleAlert, className: "text-status-warning" },
  FAILED: { label: "Falhou", icon: CircleX, className: "text-status-critical" },
  RUNNING: { label: "Em andamento", icon: RefreshCw, className: "text-muted-foreground" },
}

const RUN_TRIGGER: Record<SyncTrigger, string> = {
  SCHEDULED: "Agendada",
  MANUAL: "Manual",
  STARTUP: "Na inicialização",
}

const COUNT = new Intl.NumberFormat("pt-BR")

/** A API devolve até 20 execuções; a tela mostra as mais recentes para o card não dominar a página. */
const MAX_RUNS = 8

function RunStatus({ status }: { status: SyncRunStatus }) {
  const { label, icon: Icon, className } = RUN_STATUS[status]
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className={cn("size-3.5 shrink-0", className)} aria-hidden />
      {label}
    </span>
  )
}

function RunErrors({ run, className }: { run: SyncRun; className?: string }) {
  if (run.errors.length === 0) return null
  const iconClass = run.status === "FAILED" ? "text-status-critical" : "text-status-warning"
  return (
    <ul className={cn("space-y-1", className)} aria-label="Erros da execução">
      {run.errors.map((error, index) => (
        <li key={index} className="text-muted-foreground flex items-start gap-1.5 text-xs">
          <TriangleAlert className={cn("mt-0.5 size-3 shrink-0", iconClass)} aria-hidden />
          <span>{error}</span>
        </li>
      ))}
    </ul>
  )
}

function duration(run: SyncRun): string {
  const seconds = durationSeconds(run.startedAt, run.finishedAt)
  return seconds === null ? "—" : formatDuration(seconds)
}

function count(value: number | undefined): string {
  return value === undefined ? "—" : COUNT.format(value)
}

/** Execuções recentes da sincronização: quando, por quê, como terminou e o que trouxe. */
export function SyncHistoryCard({ runs: allRuns }: { runs: SyncRun[] }) {
  const runs = allRuns.slice(0, MAX_RUNS)
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Histórico de sincronização</CardTitle>
        <CardDescription>
          {allRuns.length > MAX_RUNS
            ? `As ${MAX_RUNS} execuções mais recentes e o que cada uma trouxe.`
            : "Execuções mais recentes e o que cada uma trouxe."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {runs.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <History aria-hidden />
              </EmptyMedia>
              <EmptyTitle>Nenhuma sincronização ainda</EmptyTitle>
              <EmptyDescription>A primeira execução roda assim que a API inicia.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            {/* Telas largas: tabela. */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Início</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="text-right">Duração</TableHead>
                    <TableHead className="text-right">Transações</TableHead>
                    <TableHead className="text-right">Faturas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.flatMap((run) => {
                    const hasErrors = run.errors.length > 0
                    const rows = [
                      <TableRow key={run.id} className={cn("hover:bg-transparent", hasErrors && "border-b-0")}>
                        <TableCell>{formatDateTime(run.startedAt)}</TableCell>
                        <TableCell>{RUN_TRIGGER[run.trigger]}</TableCell>
                        <TableCell>
                          <RunStatus status={run.status} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{duration(run)}</TableCell>
                        <TableCell className="text-right tabular-nums">{count(run.stats?.transactions)}</TableCell>
                        <TableCell className="text-right tabular-nums">{count(run.stats?.invoices)}</TableCell>
                      </TableRow>,
                    ]
                    if (hasErrors) {
                      rows.push(
                        <TableRow key={`${run.id}-errors`} className="hover:bg-transparent">
                          <TableCell colSpan={6} className="pt-0 pb-3 whitespace-normal">
                            <RunErrors run={run} />
                          </TableCell>
                        </TableRow>,
                      )
                    }
                    return rows
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Celular: lista empilhada. */}
            <ul className="divide-y md:hidden">
              {runs.map((run) => (
                <li key={run.id} className="space-y-1.5 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">
                      <RunStatus status={run.status} />
                    </span>
                    <span className="text-muted-foreground text-xs">{formatDateTime(run.startedAt)}</span>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {[
                      RUN_TRIGGER[run.trigger],
                      run.finishedAt && duration(run),
                      run.stats && `${count(run.stats.transactions)} transações`,
                      run.stats && `${count(run.stats.invoices)} faturas`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <RunErrors run={run} />
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}
