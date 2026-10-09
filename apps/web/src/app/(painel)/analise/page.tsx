import type { Metadata } from "next"
import { Info } from "lucide-react"
import { Fragment } from "react"
import { AskClaudeCard } from "@/components/analysis/ask-claude-card"
import { HeroCard } from "@/components/analysis/hero-card"
import { InsightGroups } from "@/components/analysis/insight-section"
import { groupInsights, periodLabel, reportDescription, reportFootnote, savingsRows } from "@/components/analysis/model"
import { SampleNotice } from "@/components/analysis/sample-notice"
import { SavingsCard } from "@/components/analysis/savings-card"
import { SpendingSplitCard } from "@/components/analysis/spending-split-card"
import { PageHeader } from "@/components/page-header"
import { ANALYSIS_IS_SAMPLE, getAnalysis } from "@/lib/data"

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
        description={reportDescription(report, ANALYSIS_IS_SAMPLE).map((part, index) => (
          <Fragment key={part}>
            {index > 0 && " · "}
            <span className="whitespace-nowrap">{part}</span>
          </Fragment>
        ))}
      />

      {ANALYSIS_IS_SAMPLE && <SampleNotice />}

      <div className={`${COLUMNS} gap-4`}>
        <HeroCard
          monthlySavings={report.potentialMonthlySavings}
          opportunities={savings.length}
          headline={report.headline}
          summary={report.summary}
          sample={ANALYSIS_IS_SAMPLE}
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
        {reportFootnote(ANALYSIS_IS_SAMPLE)}
      </p>
    </div>
  )
}
