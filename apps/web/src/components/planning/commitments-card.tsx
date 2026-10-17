import { CalendarClock } from "lucide-react"
import { Money } from "@/components/finance/money"
import { PAYMENT_METHOD_LABEL } from "@/components/finance/payment-method"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Commitment } from "@/lib/api/planning"
import type { Cents } from "@/lib/api/types"
import { formatMonthShort } from "@/lib/format/date"
import { formatMoney } from "@/lib/format/money"
import { cn } from "@/lib/utils"
import { AddButton, RowActions } from "./actions"
import { InstallmentMeter } from "./meters"
import { plural, type CommitmentStatus } from "./model"

export interface CommitmentRow extends Commitment {
  /** Nome da categoria do orçamento. */
  categoryName: string | null
  /** Situação no mês atual: só os ativos entram no total. */
  status: CommitmentStatus
}

/** "Encerrado em ago/26" / "Começa em nov/26"; null se ativo. */
function statusLabel(row: CommitmentRow): string | null {
  if (row.status === "ended")
    return row.endsOn ? `Encerrado em ${formatMonthShort(row.endsOn.slice(0, 7), true)}` : "Encerrado"
  if (row.status === "upcoming") return `Começa em ${formatMonthShort(row.startsOn.slice(0, 7), true)}`
  return null
}

/** Como é pago ("Outro" não diz nada e fica de fora). */
function methodOf(row: CommitmentRow): string | null {
  if (row.paymentMethod === "OTHER") return null
  return row.paymentMethod === "CARD" ? "No cartão" : PAYMENT_METHOD_LABEL[row.paymentMethod]
}

/** "No cartão · Loteadora Exemplo": como é pago + observação ("" se nenhum). */
function detailOf(row: CommitmentRow): string {
  return [methodOf(row), row.notes].filter(Boolean).join(" · ")
}

/** Linha da lista empilhada: "Dia 10 · Moradia e contas · Boleto · Loteadora Exemplo". */
function stackedDetailOf(row: CommitmentRow): string {
  return [statusLabel(row), `Dia ${row.dayOfMonth}`, row.categoryName ?? "Sem categoria", detailOf(row)]
    .filter(Boolean)
    .join(" · ")
}

function Term({ row }: { row: CommitmentRow }) {
  const status = statusLabel(row)
  if (status) return <span className="text-muted-foreground text-sm">{status}</span>
  if (row.installments) {
    return (
      <InstallmentMeter
        name={row.name}
        paid={row.installments.paid}
        total={row.installments.total}
        endsOn={row.endsOn}
      />
    )
  }
  return (
    <span className="text-muted-foreground text-sm">
      {row.endsOn ? `Até ${formatMonthShort(row.endsOn.slice(0, 7), true)}` : "Sem prazo"}
    </span>
  )
}

export function CommitmentsCard({
  rows,
  total,
  className,
}: {
  /** Já ordenados: ativos do maior para o menor, depois os que vão começar e os encerrados. */
  rows: CommitmentRow[]
  /** Soma só dos ativos no mês. */
  total: Cents
  className?: string
}) {
  const activeCount = rows.filter((row) => row.status === "active").length
  return (
    <Card className={cn("@container/commitments", className)}>
      <CardHeader>
        <CardTitle className="text-balance">
          <h2>Compromissos fixos</h2>
        </CardTitle>
        <CardDescription>Contas que se repetem todo mês, da maior para a menor.</CardDescription>
      </CardHeader>
      <CardContent className="@container flex-1">
        {rows.length === 0 ? (
          <Empty className="h-full border p-6 md:p-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarClock aria-hidden />
              </EmptyMedia>
              <EmptyTitle className="text-base">Nenhum compromisso fixo</EmptyTitle>
              <EmptyDescription>
                Parcelas, aluguel e assinaturas cadastrados aqui entram na projeção de todo mês.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <AddButton kind="commitment">Adicionar compromisso</AddButton>
            </EmptyContent>
          </Empty>
        ) : (
          <>
            {/* Cartão largo: tabela. Estreito (celular ou coluna apertada): lista empilhada. */}
            <div className="hidden @xl:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-0">Compromisso</TableHead>
                    <TableHead>Vence</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="w-40">Prazo</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="w-10 pr-0 pl-2">
                      <span className="sr-only">Ações</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className={cn("hover:bg-transparent", row.status !== "active" && "text-muted-foreground")}
                    >
                      <TableCell className="py-3 pl-0 whitespace-normal">
                        <p className="font-medium">{row.name}</p>
                        {detailOf(row) && <p className="text-muted-foreground text-xs">{detailOf(row)}</p>}
                      </TableCell>
                      <TableCell className="tabular-nums">Dia {row.dayOfMonth}</TableCell>
                      <TableCell className="text-muted-foreground">{row.categoryName ?? "Sem categoria"}</TableCell>
                      <TableCell className="py-3">
                        <Term row={row} />
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatMoney(row.amount)}</TableCell>
                      <TableCell className="py-0 pr-0 pl-2 text-right">
                        <RowActions kind="commitment" id={row.id} name={row.name} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <ul className="divide-y @xl:hidden">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className={cn(
                    "space-y-2 py-3 first:pt-0 last:pb-0",
                    row.status !== "active" && "text-muted-foreground",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="text-sm font-medium">{row.name}</p>
                      <p className="text-muted-foreground text-xs">{stackedDetailOf(row)}</p>
                    </div>
                    <Money cents={row.amount} className="shrink-0 text-sm font-medium tabular-nums" />
                    <RowActions kind="commitment" id={row.id} name={row.name} className="-mt-1.5 -mr-2 shrink-0" />
                  </div>
                  {row.installments && row.status === "active" && (
                    <InstallmentMeter
                      name={row.name}
                      paid={row.installments.paid}
                      total={row.installments.total}
                      endsOn={row.endsOn}
                      className="max-w-xs"
                    />
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
      {rows.length > 0 && (
        <CardFooter className="justify-between gap-4 border-t text-sm [.border-t]:pt-4">
          <span className="text-muted-foreground">
            Total por mês
            {/* No celular a contagem sai: as linhas já mostram, e o total fica numa linha só. */}
            <span className="hidden @[39rem]/commitments:inline">
              {" "}
              ·{" "}
              {activeCount === rows.length
                ? plural(activeCount, "compromisso", "compromissos")
                : plural(activeCount, "compromisso ativo", "compromissos ativos")}
            </span>
          </span>
          {/* Alinha com os valores das linhas (o "…" de cada linha fica à direita). */}
          <span className="mr-9 font-semibold tabular-nums @[39rem]/commitments:mr-12">{formatMoney(total)}</span>
        </CardFooter>
      )}
    </Card>
  )
}
