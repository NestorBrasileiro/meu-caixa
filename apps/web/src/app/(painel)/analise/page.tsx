import type { Metadata } from "next"
import { Info } from "lucide-react"
import { Fragment } from "react"
import { AskClaudeCard } from "@/components/analysis/ask-claude-card"
import { appAvailability, initialGeneration, type AppAvailability } from "@/components/analysis/generation"
import { GenerationProvider } from "@/components/analysis/generation-provider"
import { GenerateButton, GenerationStatus } from "@/components/analysis/generation-ui"
import { HeroCard } from "@/components/analysis/hero-card"
import { InsightGroups } from "@/components/analysis/insight-section"
import { groupInsights, periodLabel, reportDescription, reportFootnote, savingsRows } from "@/components/analysis/model"
import { NoReport } from "@/components/analysis/no-report"
import { SampleNotice } from "@/components/analysis/sample-notice"
import { SavingsCard } from "@/components/analysis/savings-card"
import { SpendingSplitCard } from "@/components/analysis/spending-split-card"
import { PageHeader } from "@/components/page-header"
import { loadOrNull } from "@/components/shell/fail-soft"
import type { ShownAnalysis } from "@/lib/api/analysis"
import { CAN_WRITE, getAnalysis, getAnalysisStatus, getNow } from "@/lib/data"

export const metadata: Metadata = { title: "Análise do Claude" }

/** Mesma grade da visão geral: coluna flexível + coluna lateral de 22rem no desktop. */
const COLUMNS = "grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem]"
const TITLE = "Análise do Claude"

export default async function Page() {
  const [analysis, status, now] = await Promise.all([
    getAnalysis(),
    // Sem o status, a tela continua mostrando o relatório; gerar e perguntar ficam indisponíveis com o aviso.
    loadOrNull("o status da análise", getAnalysisStatus),
    getNow(),
  ])
  const availability = appAvailability(status, CAN_WRITE)
  const initial = initialGeneration(
    status?.latestRun ?? null,
    analysis && !analysis.sample ? analysis.generatedAt : null,
    now,
  )

  return (
    <GenerationProvider initial={initial} availability={availability} hasReport={analysis !== null}>
      {analysis ? (
        <Report analysis={analysis} availability={availability} />
      ) : (
        <div className="space-y-6">
          <PageHeader title={TITLE} description="Onde dá para economizar, segundo o Claude, a partir das suas transações." />
          <GenerationStatus />
          <NoReport availability={availability} />
          <AskClaudeCard availability={availability} />
        </div>
      )}
    </GenerationProvider>
  )
}

function Report({ analysis, availability }: { analysis: ShownAnalysis; availability: AppAvailability }) {
  const { period } = analysis
  const savings = savingsRows(analysis.insights)

  return (
    <div className="space-y-6">
      <PageHeader
        title={TITLE}
        description={reportDescription(analysis).map((part, index) => (
          <Fragment key={part}>
            {index > 0 && " · "}
            <span className="whitespace-nowrap">{part}</span>
          </Fragment>
        ))}
        actions={<GenerateButton variant="outline" />}
      />

      <GenerationStatus />

      {analysis.sample && <SampleNotice />}

      <div className={`${COLUMNS} gap-4`}>
        <HeroCard
          monthlySavings={analysis.potentialMonthlySavings}
          opportunities={savings.length}
          headline={analysis.headline}
          summary={analysis.summary}
          sample={analysis.sample}
        />
        <SpendingSplitCard
          fixed={analysis.monthlyFixed}
          discretionary={analysis.monthlyDiscretionary}
          periodLabel={periodLabel(period)}
        />
      </div>

      <InsightGroups groups={groupInsights(analysis.insights)} period={period} />

      {/*
        A conversa cresce com as respostas: o cartão de economia fica com a própria altura (self-start)
        e o do Claude acompanha a fileira, ocupando ao menos a altura do vizinho.
      */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SavingsCard rows={savings} className="xl:self-start" />
        <AskClaudeCard availability={availability} />
      </div>

      <p className="text-muted-foreground flex items-start gap-2 text-xs">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        {reportFootnote(analysis.sample)}
      </p>
    </div>
  )
}
