import type { Metadata } from "next"
import { Info } from "lucide-react"
import { AskClaudeCard } from "@/components/analysis/ask-claude-card"
import { HeroCard } from "@/components/analysis/hero-card"
import { InsightGroups } from "@/components/analysis/insight-section"
import { groupInsights, periodLabel, savingsRows } from "@/components/analysis/model"
import { SavingsCard } from "@/components/analysis/savings-card"
import { SpendingSplitCard } from "@/components/analysis/spending-split-card"
import { PageHeader } from "@/components/page-header"
import { getAnalysis } from "@/lib/data"
import { formatDateShort, formatDateTime } from "@/lib/format/date"

export const metadata: Metadata = { title: "Análise do Claude" }

/** Mesma grade da visão geral: coluna flexível + coluna lateral de 22rem no desktop. */
const COLUMNS = "grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem]"

export default async function Page() {
  const report = await getAnalysis()
  const { period } = report
  const savings = savingsRows(report.insights)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Análise do Claude"
        description={
          <>
            <span className="whitespace-nowrap">Gerada em {formatDateTime(report.generatedAt)}</span>
            {" · "}
            <span className="whitespace-nowrap">
              período {formatDateShort(period.from)} a {formatDateShort(period.to)}
            </span>
            {" · "}
            <span className="whitespace-nowrap">via MCP</span>
          </>
        }
      />

      <div className={`${COLUMNS} gap-4`}>
        <HeroCard
          monthlySavings={report.potentialMonthlySavings}
          suggestions={savings.length}
          headline={report.headline}
          summary={report.summary}
        />
        <SpendingSplitCard
          fixed={report.monthlyFixed}
          discretionary={report.monthlyDiscretionary}
          periodLabel={periodLabel(period)}
        />
      </div>

      <InsightGroups groups={groupInsights(report.insights)} period={period} />

      <div className={`${COLUMNS} gap-4`}>
        <SavingsCard rows={savings} />
        <AskClaudeCard />
      </div>

      <p className="text-muted-foreground flex items-start gap-2 text-xs">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        Sugestões geradas automaticamente a partir das suas transações. Revise antes de agir: o Claude pode errar.
      </p>
    </div>
  )
}
