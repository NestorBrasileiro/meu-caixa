import type { Metadata } from "next"
import { Target } from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { BudgetCard } from "@/components/planning/budget-card"
import { CommitmentsCard } from "@/components/planning/commitments-card"
import { GoalCard } from "@/components/planning/goal-card"
import { PlanningHeaderActions } from "@/components/planning/header-actions"
import { KpiRow } from "@/components/planning/kpi-row"
import {
  budgetRows,
  budgetScaleMax,
  commitmentsTotal,
  goalProgress,
  groupBudget,
  plural,
  projectionCallout,
  shiftMonth,
  sortCommitments,
  staleSyncNote,
  unbudgetedSpending,
  type ProjectionRow,
} from "@/components/planning/model"
import { ProjectionCard } from "@/components/planning/projection-card"
import { Card } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { getAccounts, getAllTransactions, getPlanning, getToday } from "@/lib/data"
import { monthRange, spendingByCategory } from "@/lib/finance/aggregate"
import { formatDateShort, formatMonth, formatMonthShort } from "@/lib/format/date"
import { formatMoney } from "@/lib/format/money"

export const metadata: Metadata = { title: "Planejamento" }

/** "novembro" a partir de "2026-11". */
const monthName = (month: string) => formatMonth(month).split(" de ")[0]

export default async function Page() {
  const today = getToday()
  const lastClosedMonth = shiftMonth(today.slice(0, 7), -1)
  const closedRange = monthRange(lastClosedMonth)

  const [planning, transactions, accounts] = await Promise.all([
    getPlanning(),
    getAllTransactions(closedRange),
    getAccounts(),
  ])

  // Compromissos fixos, do maior para o menor.
  const categoryName = new Map(planning.categories.map((category) => [category.id, category.name]))
  const commitments = sortCommitments(planning.commitments).map((commitment) => ({
    ...commitment,
    categoryName: categoryName.get(commitment.categoryId) ?? null,
  }))
  const committed = commitmentsTotal(planning.commitments)

  // Metas.
  const goals = planning.goals.map((goal) => goalProgress(goal, today, accounts))
  const activeGoals = goals.filter((goal) => !goal.done).length
  const contributions = planning.goals.reduce((sum, goal) => sum + goal.monthlyContribution, 0)

  // Orçamento do último mês fechado.
  const spending = spendingByCategory(transactions, closedRange)
  const budget = budgetRows(planning.categories, spending)
  const unbudgeted = unbudgetedSpending(planning.categories, spending)
  const staleNote = staleSyncNote(accounts, closedRange.to, formatDateShort)

  // Projeção.
  const projections: ProjectionRow[] = planning.projections.map((row, i, all) => ({
    ...row,
    tick: formatMonthShort(row.month, i === 0 || all[i - 1].month.slice(0, 4) !== row.month.slice(0, 4)),
    label: formatMonth(row.month),
  }))
  const next = planning.projections[0] ?? null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planejamento"
        description={`${formatMoney(committed)}/mês já comprometidos · ${plural(activeGoals, "meta em andamento", "metas em andamento")}`}
        actions={<PlanningHeaderActions />}
      />

      <KpiRow
        data={{
          commitments: {
            total: committed,
            count: planning.commitments.length,
            incomeShare: next && next.expectedIncome > 0 ? committed / next.expectedIncome : null,
          },
          goals: { total: contributions, count: planning.goals.length },
          variableSpending: next?.expectedVariableSpending ?? null,
          nextMonth: next
            ? { label: monthName(next.month), balance: next.projectedBalance, income: next.expectedIncome }
            : null,
        }}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <CommitmentsCard rows={commitments} total={committed} />
        <section aria-label="Metas" className="grid content-start gap-4 lg:grid-cols-2 xl:grid-cols-1">
          {goals.length === 0 ? (
            <Card className="lg:col-span-2 xl:col-span-1">
              <Empty className="p-6 md:p-8">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Target aria-hidden />
                  </EmptyMedia>
                  <EmptyTitle className="text-base">Nenhuma meta ainda</EmptyTitle>
                  <EmptyDescription>
                    Metas como a entrada do carro mostram aqui quanto falta e quando devem fechar.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </Card>
          ) : (
            goals.map((goal) => <GoalCard key={goal.id} goal={goal} />)
          )}
        </section>
      </div>

      <BudgetCard
        groups={groupBudget(budget)}
        scaleMax={budgetScaleMax(budget)}
        monthLabel={formatMonth(lastClosedMonth)}
        unbudgeted={{
          total: unbudgeted.reduce((sum, row) => sum + row.total, 0),
          labels: unbudgeted.map((row) => row.label),
        }}
        staleNote={staleNote}
      />

      <ProjectionCard rows={projections} callout={projectionCallout(planning.projections, monthName, formatMoney)} />
    </div>
  )
}
