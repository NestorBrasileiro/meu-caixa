import { ReceiptText, SearchCheck } from "lucide-react"
import { Fragment } from "react"
import { Card } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import type { Insight } from "@/lib/api/analysis"
import { formatDateShort } from "@/lib/format/date"
import { formatMoney } from "@/lib/format/money"
import { ConfidenceLabel, KIND } from "./meta"
import { balanceColumns, evidenceParts, type InsightGroup, type Period } from "./model"

function InsightCard({ insight, period }: { insight: Insight; period: Period }) {
  return (
    <Card role="article" className="gap-3 px-5 py-5" aria-labelledby={`insight-${insight.id}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <h3 id={`insight-${insight.id}`} className="leading-snug font-medium">
          {insight.title}
        </h3>
        {insight.monthlySavings !== null && (
          // Contorno em vez de fundo bg-muted: o texto muted sobre o cartão mantém contraste AA.
          <p className="text-muted-foreground w-fit shrink-0 rounded-md border px-2 py-0.5 text-xs leading-5 whitespace-nowrap">
            Economia de <span className="text-foreground font-semibold">{formatMoney(insight.monthlySavings)}</span>
            /mês
          </p>
        )}
      </div>
      <p className="text-muted-foreground text-sm leading-relaxed text-pretty">{insight.explanation}</p>
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-3 text-xs">
        {insight.evidence && (
          <span className="inline-flex items-start gap-1.5">
            <ReceiptText className="mt-px size-3 shrink-0" aria-hidden />
            <span>
              <span className="sr-only">Evidência: </span>
              {evidenceParts(insight.evidence, period).map((part, index) => (
                <Fragment key={index}>
                  {index > 0 && " · "}
                  <span className={index > 0 ? "whitespace-nowrap" : undefined}>{part}</span>
                </Fragment>
              ))}
            </span>
          </span>
        )}
        <ConfidenceLabel confidence={insight.confidence} />
      </div>
    </Card>
  )
}

/** Um grupo de insights do mesmo tipo: ícone, título, descrição de uma linha e os cartões. */
function InsightSection({ group, period }: { group: InsightGroup; period: Period }) {
  const { title, description, icon: Icon } = KIND[group.kind]
  const headingId = `grupo-${group.kind.toLowerCase()}`

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <header className="flex items-start gap-3">
        <span className="bg-card flex size-8 shrink-0 items-center justify-center rounded-md border shadow-xs">
          <Icon className="text-muted-foreground size-4" aria-hidden />
        </span>
        <div className="min-w-0 space-y-0.5">
          <h2 id={headingId} className="leading-tight font-semibold">
            {title}
          </h2>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
      </header>
      <div className="space-y-3">
        {group.insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} period={period} />
        ))}
      </div>
    </section>
  )
}

/**
 * Todos os grupos. No desktop, duas colunas de altura parecida (a ordem do
 * relatório desce pela esquerda e continua na direita); no celular, uma só.
 */
export function InsightGroups({ groups, period }: { groups: InsightGroup[]; period: Period }) {
  if (groups.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchCheck aria-hidden />
          </EmptyMedia>
          <EmptyTitle>Nada para cortar neste período</EmptyTitle>
          <EmptyDescription>
            O Claude não encontrou gastos do pecado, vazamentos nem sugestões entre {formatDateShort(period.from)} e{" "}
            {formatDateShort(period.to)}.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const columns = balanceColumns(groups).filter((column) => column.length > 0)
  return (
    <div className={columns.length > 1 ? "grid gap-6 xl:grid-cols-2 xl:items-start xl:gap-x-4" : undefined}>
      {columns.map((column) => (
        <div key={column[0].kind} className="space-y-6">
          {column.map((group) => (
            <InsightSection key={group.kind} group={group} period={period} />
          ))}
        </div>
      ))}
    </div>
  )
}
