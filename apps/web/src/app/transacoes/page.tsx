import type { Metadata } from "next"
import { PageHeader } from "@/components/page-header"
import { plural } from "@/components/transactions/format"
import { isInternal, periodRange, type AccountOption } from "@/components/transactions/model"
import { TransactionsView } from "@/components/transactions/transactions-view"
import { getAccounts, getAllTransactions, getToday } from "@/lib/data"

export const metadata: Metadata = { title: "Transações" }

export default async function Page() {
  const today = getToday()
  // O maior período oferecido nos filtros; os demais são recortes dele, feitos no cliente.
  const [transactions, accounts] = await Promise.all([getAllTransactions(periodRange("12m", today)), getAccounts()])

  const accountOptions: AccountOption[] = accounts.map((account) => ({
    id: account.id,
    name: account.name,
    institutionName: account.institutionName,
    type: account.type,
    connectionStatus: account.connectionStatus,
    transactionsSyncedThrough: account.transactionsSyncedThrough,
  }))

  // Mesma contagem que a lista mostra em "Últimos 12 meses" (movimentações internas começam ocultas).
  const visibleCount = transactions.filter((tx) => !isInternal(tx)).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transações"
        description={`Todas as contas em um só lugar · ${plural(visibleCount, "lançamento", "lançamentos")} nos últimos 12 meses`}
      />
      <TransactionsView transactions={transactions} accounts={accountOptions} today={today} />
    </div>
  )
}
