import { CreditCard } from "lucide-react"
import { Money } from "@/components/finance/money"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { CardInstallment } from "@/lib/api/planning"
import type { Cents } from "@/lib/api/types"
import { formatDateShort } from "@/lib/format/date"
import { formatMoney } from "@/lib/format/money"
import { cn } from "@/lib/utils"
import { InstallmentMeter } from "./meters"

/** "Notebook · Cartão Exemplo Platinum": descrição + nome do cartão. */
function detailOf(row: CardInstallment): string {
  return [row.description, row.cardName].filter(Boolean).join(" · ")
}

export function CardInstallmentsCard({
  rows,
  total,
  className,
}: {
  /** Já ordenadas da maior parcela para a menor. */
  rows: CardInstallment[]
  /** Soma do valor da parcela de todas as linhas. */
  total: Cents
  className?: string
}) {
  return (
    <Card className={cn("@container/card-installments", className)}>
      <CardHeader>
        <CardTitle className="text-balance">
          <h2>Parcelas de cartão em aberto</h2>
        </CardTitle>
        <CardDescription>
          Compras parceladas nos seus cartões que ainda não terminaram de ser pagas.
        </CardDescription>
      </CardHeader>
      <CardContent className="@container flex-1">
        {rows.length === 0 ? (
          <Empty className="h-full border p-6 md:p-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CreditCard aria-hidden />
              </EmptyMedia>
              <EmptyTitle className="text-base">Nenhuma parcela em aberto</EmptyTitle>
              <EmptyDescription>
                Quando você fizer uma compra parcelada no cartão, ela aparece aqui automaticamente depois da
                próxima sincronização.
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
                    <TableHead className="pl-0">Compra</TableHead>
                    <TableHead>Próxima parcela</TableHead>
                    <TableHead className="w-40">Parcelas</TableHead>
                    <TableHead className="pr-0 text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => (
                    <TableRow key={`${row.accountId}-${i}`} className="hover:bg-transparent">
                      <TableCell className="py-3 pl-0 whitespace-normal">
                        <p className="font-medium">{row.description}</p>
                        <p className="text-muted-foreground text-xs">{row.cardName}</p>
                      </TableCell>
                      <TableCell className="tabular-nums">{formatDateShort(row.nextDueDate)}</TableCell>
                      <TableCell className="py-3">
                        <InstallmentMeter
                          name={row.description}
                          paid={row.installments.paid}
                          total={row.installments.total}
                          endsOn={row.endsOn}
                        />
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
              {rows.map((row, i) => (
                <li key={`${row.accountId}-${i}`} className="space-y-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="text-sm font-medium">{row.description}</p>
                      <p className="text-muted-foreground text-xs">
                        {detailOf(row)} · Próxima em {formatDateShort(row.nextDueDate)}
                      </p>
                    </div>
                    <Money cents={row.amount} className="shrink-0 text-sm font-medium tabular-nums" />
                  </div>
                  <InstallmentMeter
                    name={row.description}
                    paid={row.installments.paid}
                    total={row.installments.total}
                    endsOn={row.endsOn}
                    className="max-w-xs"
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
      {rows.length > 0 && (
        <CardFooter className="justify-between gap-4 border-t text-sm [.border-t]:pt-4">
          <span className="text-muted-foreground">Total por mês</span>
          <span className="font-semibold tabular-nums">{formatMoney(total)}</span>
        </CardFooter>
      )}
    </Card>
  )
}
