import { CalendarClock } from "lucide-react"
import { Money } from "@/components/finance/money"
import { PAYMENT_METHOD_LABEL } from "@/components/finance/payment-method"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Commitment } from "@/lib/api/planning"
import type { Cents } from "@/lib/api/types"
import { formatMonthShort } from "@/lib/format/date"
import { formatMoney } from "@/lib/format/money"
import { cn } from "@/lib/utils"
import { InstallmentMeter } from "./meters"
import { plural } from "./model"

export interface CommitmentRow extends Commitment {
  /** Nome da categoria do orçamento. */
  categoryName: string | null
}

/** "No cartão · Loteadora Exemplo": como é pago + observação. */
function detailOf(row: CommitmentRow): string {
  const method = row.paymentMethod === "CARD" ? "No cartão" : PAYMENT_METHOD_LABEL[row.paymentMethod]
  return [method, row.notes].filter(Boolean).join(" · ")
}

function Term({ row }: { row: CommitmentRow }) {
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
      {row.endsOn ? `Até ${formatMonthShort(row.endsOn.slice(0, 7), true)}` : "Recorrente"}
    </span>
  )
}

export function CommitmentsCard({
  rows,
  total,
  className,
}: {
  /** Já ordenados do maior para o menor. */
  rows: CommitmentRow[]
  total: Cents
  className?: string
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Compromissos fixos</CardTitle>
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
                    <TableHead className="pr-0 text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id} className="hover:bg-transparent">
                      <TableCell className="py-3 pl-0 whitespace-normal">
                        <p className="font-medium">{row.name}</p>
                        <p className="text-muted-foreground text-xs">{detailOf(row)}</p>
                      </TableCell>
                      <TableCell className="tabular-nums">Dia {row.dayOfMonth}</TableCell>
                      <TableCell className="text-muted-foreground">{row.categoryName ?? "Sem categoria"}</TableCell>
                      <TableCell className="py-3">
                        <Term row={row} />
                      </TableCell>
                      <TableCell className="pr-0 text-right font-medium tabular-nums">
                        {formatMoney(row.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <ul className="divide-y @xl:hidden">
              {rows.map((row) => (
                <li key={row.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium">{row.name}</p>
                      <p className="text-muted-foreground text-xs">
                        Dia {row.dayOfMonth} · {row.categoryName ?? "Sem categoria"}
 · {detailOf(row)}
                      </p>
                    </div>
                    <Money cents={row.amount} className="shrink-0 text-sm font-medium tabular-nums" />
                  </div>
                  {row.installments && (
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
        <CardFooter className={cn("justify-between gap-4 border-t text-sm [.border-t]:pt-4")}>
          <span className="text-muted-foreground">
            Total por mês · {plural(rows.length, "compromisso", "compromissos")}
          </span>
          <span className="font-semibold tabular-nums">{formatMoney(total)}</span>
        </CardFooter>
      )}
    </Card>
  )
}
