import { PageHeader } from "@/components/page-header"
import { AccountsCard } from "@/components/overview/accounts-card"
import { CashFlowCard, type CashFlowRow } from "@/components/overview/cash-flow-card"
import { KpiRow } from "@/components/overview/kpi-row"
import { LeaksCard } from "@/components/overview/leaks-card"
import {
  addDays,
  capitalize,
  monthName,
  nextOpenInvoice,
  topCategories,
  topLeaks,
  upcomingDue,
} from "@/components/overview/model"
import { SpendingCard } from "@/components/overview/spending-card"
import { UpcomingCard } from "@/components/overview/upcoming-card"
import {
  getAccounts,
  getAllTransactions,
  getAnalysis,
  getConnections,
  getInvoices,
  getPlanning,
  getToday,
} from "@/lib/data"
import {
  lastMonths,
  monthlyCashFlow,
  monthRange,
  periodTotals,
  spendingByCategory,
  totalCardDebt,
  totalCash,
} from "@/lib/finance/aggregate"
import { isCashAccount } from "@/lib/finance/classify"
import { formatDateShort, formatMonth, formatMonthShort, formatWeekday } from "@/lib/format/date"

const UPCOMING_DAYS = 10
const TOP_CATEGORIES = 7
const TOP_LEAKS = 3

export default async function Page() {
  const today = getToday()
  const currentMonth = today.slice(0, 7)
  const months = lastMonths(currentMonth, 12)
  const lastClosedMonth = lastMonths(currentMonth, 2)[0]

  const [accounts, connections, transactions, invoices, planning, analysis] = await Promise.all([
    getAccounts(),
    getConnections(),
    getAllTransactions({ from: monthRange(months[0]).from, to: today }),
    getInvoices(),
    getPlanning(),
    getAnalysis(),
  ])

  // KPIs
  const cashAccounts = accounts.filter(isCashAccount)
  const cards = accounts.filter((account) => account.type === "CREDIT_CARD")
  const openInvoice = nextOpenInvoice(invoices, today)
  const creditLimit = cards.reduce((sum, card) => sum + (card.creditLimit ?? 0), 0)
  const creditAvailable = cards.reduce((sum, card) => sum + (card.availableCredit ?? 0), 0)
  const currentMonthName = monthName(formatMonth(currentMonth))
  const dayOfMonth = Number(today.slice(8, 10))

  // Fluxo de caixa: o mês corrente é parcial.
  const cashFlow: CashFlowRow[] = monthlyCashFlow(transactions, accounts, months).map((row) => ({
    ...row,
    partial: row.month === currentMonth,
  }))
  const pendingInvoice = openInvoice && openInvoice.dueDate.slice(0, 7) === currentMonth ? openInvoice : null
  const partial = {
    month: currentMonthName,
    day: dayOfMonth,
    pendingInvoiceDue: pendingInvoice ? formatDateShort(pendingInvoice.dueDate) : null,
  }

  // Gastos do último mês fechado.
  const categoryRows = spendingByCategory(transactions, monthRange(lastClosedMonth))
  const categoryTotal = categoryRows.reduce((sum, row) => sum + row.total, 0)

  // Próximos vencimentos.
  const upcoming = upcomingDue({
    commitments: planning.commitments,
    invoices,
    accounts,
    today,
    horizonDays: UPCOMING_DAYS,
  })

  const analysisPeriod = `${formatMonthShort(analysis.period.from.slice(0, 7))}–${formatMonthShort(analysis.period.to.slice(0, 7))}`

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visão geral"
        description={`${capitalize(formatWeekday(today))} · ${accounts.length} contas em ${connections.length} instituições`}
      />

      <KpiRow
        data={{
          cash: {
            total: totalCash(accounts),
            accounts: cashAccounts.length,
            stale: cashAccounts.filter((account) => account.connectionStatus !== "ACTIVE").length,
          },
          invoice: { total: totalCardDebt(accounts), dueDate: openInvoice?.dueDate ?? null },
          credit: cards.length > 0 ? { available: creditAvailable, limit: creditLimit } : null,
          month: {
            totals: periodTotals(transactions, { from: `${currentMonth}-01`, to: today }),
            label: `${capitalize(currentMonthName)}, até dia ${dayOfMonth}`,
          },
        }}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <CashFlowCard rows={cashFlow} partial={partial} />
        <UpcomingCard items={upcoming} until={addDays(today, UPCOMING_DAYS)} horizonDays={UPCOMING_DAYS} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <SpendingCard
          rows={topCategories(categoryRows, TOP_CATEGORIES)}
          total={categoryTotal}
          monthLabel={formatMonth(lastClosedMonth)}
        />
        <LeaksCard items={topLeaks(analysis.insights, TOP_LEAKS)} periodLabel={analysisPeriod} />
      </div>

      <AccountsCard accounts={accounts} today={today} />
    </div>
  )
}
