import type * as React from "react"
import { Money } from "@/components/finance/money"
import { Card } from "@/components/ui/card"
import { formatCount, formatRange, plural } from "./format"
import type { DateRange, Summary } from "./model"

function Cell({ label, value, hint }: { label: string; value: React.ReactNode; hint: React.ReactNode }) {
  return (
    <div className="bg-card min-w-0 space-y-1 px-4 py-3">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-lg font-semibold tracking-tight sm:text-xl">{value}</dd>
      <dd className="text-muted-foreground truncate text-xs">{hint}</dd>
    </div>
  )
}

/** Totais do conjunto filtrado (todas as páginas, não só as linhas visíveis). */
export function SummaryStrip({ summary, range }: { summary: Summary; range: DateRange }) {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <dl aria-label="Resumo dos lançamentos filtrados" className="bg-border grid grid-cols-2 gap-px lg:grid-cols-4">
        <Cell
          label="Lançamentos"
          value={formatCount(summary.count)}
          hint={formatRange(range)}
        />
        <Cell
          label="Entradas"
          value={<Money cents={summary.inflow} tone="flow" />}
          hint={plural(summary.inflowCount, "lançamento", "lançamentos")}
        />
        <Cell
          label="Saídas"
          value={<Money cents={summary.outflow} />}
          hint={plural(summary.outflowCount, "lançamento", "lançamentos")}
        />
        <Cell label="Saldo do período" value={<Money cents={summary.net} tone="flow" />} hint="Entradas menos saídas" />
      </dl>
    </Card>
  )
}
