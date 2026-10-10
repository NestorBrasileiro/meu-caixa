import { PageHeader } from "@/components/page-header"
import { AccountsCard } from "@/components/overview/accounts-card"
import { CashFlowCard, type CashFlowRow } from "@/components/overview/cash-flow-card"
import { KpiRow } from "@/components/overview/kpi-row"
import { LeaksCard } from "@/components/overview/leaks-card"
import {
  addDays,
  cashFlowWindow,
  leaksCardState,
  monthNameOf,
  nextOpenInvoice,
  overviewDescription,
  topCategories,
  upcomingDue,
} from "@/components/overview/model"
import { SpendingCard } from "@/components/overview/spending-card"
import { UpcomingCard } from "@/components/overview/upcoming-card"
import { loadOrNull } from "@/components/shell/fail-soft"
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
import { formatDateShort, formatWeekday } from "@/lib/format/date"

const UPCOMING_DAYS = 10
const TOP_CATEGORIES = 7
const TOP_LEAKS = 3
/** Com histórico curto, o fluxo de caixa começa no primeiro mês com movimento, mas mostra ao menos isto. */
const MIN_CASH_FLOW_MONTHS = 6

export default async function Page() {
  const today = await getToday()
  const currentMonth = today.slice(0, 7)
  const months = lastMonths(currentMonth, 12)
  const lastClosedMonth = lastMonths(currentMonth, 2)[0]

  const [accounts, connections, transactions, invoices, planning, analysis] = await Promise.all([
    getAccounts(),
    getConnections(),
    getAllTransactions({ from: monthRange(months[0]).from, to: today }),
    getInvoices(),
    getPlanning(),
    // A análise é um cartão entre vários: se a API falhar nela, o cartão avisa e o resto da tela fica.
    loadOrNull("a última análise", async () => ({ report: await getAnalysis() })),
  ])

  // KPIs
  const cashAccounts = accounts.filter(isCashAccount)
  const cards = accounts.filter((account) => account.type === "CREDIT_CARD")
  const openInvoice = nextOpenInvoice(invoices, today)
  const creditLimit = cards.reduce((sum, card) => sum + (card.creditLimit ?? 0), 0)
  const creditAvailable = cards.reduce((sum, card) => sum + (card.availableCredit ?? 0), 0)
  const dayOfMonth = Number(today.slice(8, 10))

  // Fluxo de caixa: o mês corrente é parcial.
  const cashFlow: CashFlowRow[] = cashFlowWindow(
    monthlyCashFlow(transactions, accounts, months).map((row) => ({ ...row, partial: row.month === currentMonth })),
    MIN_CASH_FLOW_MONTHS,
  )
  const pendingInvoice = openInvoice && openInvoice.dueDate.slice(0, 7) === currentMonth ? openInvoice : null
  const partial = {
    month: monthNameOf(currentMonth),
    day: dayOfMonth,
    pendingInvoiceDue: pendingInvoice ? formatDateShort(pendingInvoice.dueDate) : null,
  }

  // Gastos do último mês fechado.
  const categoryRows = spendingByCategory(transactions, monthRange(lastClosedMonth))
  const categoryTotal = categoryRows.reduce((sum, row) => sum + row.total, 0)

  // Próximos vencimentos.
  const upcomingUntil = addDays(today, UPCOMING_DAYS)
  const upcoming = upcomingDue({
    commitments: planning.commitments,
    invoices,
    accounts,
    today,
    horizonDays: UPCOMING_DAYS,
  })

  const description = overviewDescription(formatWeekday(today), accounts.length, connections.length)

  return (
    <div className="space-y-6">
      <PageHeader title="Visão geral" description={description} />

      <KpiRow
        data={{
          cash: {
            total: totalCash(accounts),
            accounts: cashAccounts.length,
            stale: cashAccounts.filter((account) => account.connectionStatus !== "ACTIVE").length,
          },
          invoice: { total: totalCardDebt(accounts), dueDate: openInvoice?.dueDate ?? null, cards: cards.length },
          credit: cards.length > 0 ? { available: creditAvailable, limit: creditLimit } : null,
          month: {
            totals: periodTotals(transactions, { from: `${currentMonth}-01`, to: today }),
            day: dayOfMonth,
          },
        }}
      />

      {/*
        xl: gráficos à esquerda, listas na coluna de 22rem à direita.
        lg: as duas listas lado a lado, com os gráficos em largura cheia
        acima e abaixo (gráfico de 12 meses em meia coluna fica apertado).
      */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <CashFlowCard
          rows={cashFlow}
          partial={partial}
          hasAccounts={cashAccounts.length > 0}
          className="lg:col-span-2 xl:col-span-1"
        />
        <UpcomingCard
          items={upcoming}
          until={upcomingUntil}
          horizonDays={UPCOMING_DAYS}
          hasCommitments={planning.commitments.length > 0}
        />
        <SpendingCard
          rows={topCategories(categoryRows, TOP_CATEGORIES)}
          total={categoryTotal}
          month={lastClosedMonth}
          hasHistory={transactions.length > 0}
          className="lg:col-span-2 lg:row-start-3 xl:col-span-1 xl:col-start-1 xl:row-start-2"
        />
        <LeaksCard
          state={leaksCardState(analysis, TOP_LEAKS)}
          className="lg:col-start-2 lg:row-start-2"
        />
      </div>

      <AccountsCard accounts={accounts} today={today} />
    </div>
  )
}
