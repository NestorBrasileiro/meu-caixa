import { CloudOff, HandCoins, TriangleAlert } from "lucide-react"
import { InstallmentMeter } from "@/components/planning/meters"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import type { Loan } from "@/lib/api/loans"
import { formatDateShort } from "@/lib/format/date"
import { formatMoney } from "@/lib/format/money"
import { cn } from "@/lib/utils"
import { plural } from "./format"
import { loanView, overdueLabel, ratesLabel, sortLoans, totalOutstanding, type LoanView } from "./loans"

const TITLE = "Empréstimos e financiamentos"

/** Colunas dos contratos: até três lado a lado, sem deixar coluna vazia com um ou dois. */
function loanColumns(count: number): string {
  if (count >= 3) return "@2xl/loans:grid-cols-2 @5xl/loans:grid-cols-3"
  if (count === 2) return "@2xl/loans:grid-cols-2"
  return ""
}

/**
 * Empréstimos e financiamentos que os bancos compartilham pelo Open Finance. `loans` é null quando a
 * API não respondeu: o cartão avisa e o resto da tela de contas continua de pé.
 */
export function LoansCard({ loans, className }: { loans: Loan[] | null; className?: string }) {
  const views = loans ? sortLoans(loans.map(loanView)) : []
  const { total, missing } = totalOutstanding(views)

  return (
    <Card className={cn("@container/loans", className)}>
      <CardHeader>
        <CardTitle>
          <h2>{TITLE}</h2>
        </CardTitle>
        <CardDescription>
          {loans && loans.length > 0
            ? `${plural(loans.length, "contrato compartilhado", "contratos compartilhados")} pelos bancos via Open Finance.`
            : "Contratos de crédito que os bancos compartilham pelo Open Finance."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {loans === null ? (
          <Empty className="border p-6 md:p-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CloudOff aria-hidden />
              </EmptyMedia>
              <EmptyTitle className="text-base">Não foi possível carregar os empréstimos</EmptyTitle>
              <EmptyDescription>A API não respondeu agora. O resto da tela de contas não depende dela.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : views.length === 0 ? (
          <Empty className="border p-6 md:p-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HandCoins aria-hidden />
              </EmptyMedia>
              <EmptyTitle className="text-base">Nenhum empréstimo encontrado</EmptyTitle>
              <EmptyDescription>Nem todo banco compartilha empréstimos pelo Open Finance.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          // Lado a lado no cartão largo: cada contrato abre com a sua linha, como as contas de um banco.
          <ul aria-label={TITLE} className={cn("-mb-4 grid grid-cols-1 gap-x-8", loanColumns(views.length))}>
            {views.map((loan) => (
              <li key={loan.id} className="border-t py-4">
                <LoanItem loan={loan} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {views.length > 0 && (
        <CardFooter className="block space-y-0.5 border-t text-sm [.border-t]:pt-4">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-muted-foreground">Total devedor</span>
            <span className="font-semibold tabular-nums">{formatMoney(total)}</span>
          </div>
          {missing > 0 && (
            <p className="text-muted-foreground text-xs">
              Sem o saldo de {plural(missing, "contrato", "contratos")}: o banco não informou.
            </p>
          )}
        </CardFooter>
      )}
    </Card>
  )
}

function LoanItem({ loan }: { loan: LoanView }) {
  const rates = ratesLabel(loan)
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h3 className="text-sm leading-snug font-medium text-pretty">{loan.productName}</h3>
          <p className="text-muted-foreground text-xs">{loan.institutionName}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-muted-foreground text-xs">Saldo devedor</p>
          <p className="text-lg leading-tight font-semibold tracking-tight tabular-nums">
            {loan.outstanding !== null ? formatMoney(loan.outstanding) : "—"}
          </p>
        </div>
      </div>

      {loan.installments ? (
        <InstallmentMeter
          name={loan.productName}
          paid={loan.installments.paid}
          total={loan.installments.total}
          endsOn={loan.finalDueDate}
          className="max-w-sm"
        />
      ) : (
        <p className="text-muted-foreground text-xs">
          {loan.remaining !== null
            ? `${plural(loan.remaining, "parcela restante", "parcelas restantes")}`
            : "O banco não informou as parcelas."}
        </p>
      )}

      {(loan.next || rates || loan.overdue > 0) && (
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
          {loan.next && (
            <div className="space-y-0.5">
              <dt className="text-muted-foreground">Próxima parcela</dt>
              <dd className="tabular-nums">
                {formatDateShort(loan.next.dueDate)}
                {loan.next.amount !== null && (
                  <>
                    {" · "}
                    <span className="font-medium">{formatMoney(loan.next.amount)}</span>
                  </>
                )}
              </dd>
            </div>
          )}
          {rates && (
            <div className="space-y-0.5">
              <dt className="text-muted-foreground">Taxas</dt>
              <dd className="tabular-nums">{rates}</dd>
            </div>
          )}
          {loan.overdue > 0 && (
            <div className="basis-full">
              <dt className="sr-only">Situação</dt>
              <dd className="inline-flex items-center gap-1.5 font-medium">
                <TriangleAlert className="text-status-critical size-3.5 shrink-0" aria-hidden />
                {overdueLabel(loan.overdue)}
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  )
}
