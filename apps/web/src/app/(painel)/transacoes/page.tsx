import type { Metadata } from "next"
import { PageHeader } from "@/components/page-header"
import { plural } from "@/components/transactions/format"
import { isInternal, noDataReason, periodRange, type AccountOption } from "@/components/transactions/model"
import { NoTransactions } from "@/components/transactions/no-transactions"
import { TransactionsView } from "@/components/transactions/transactions-view"
import { CAN_WRITE, getAccounts, getAllTransactions, getToday } from "@/lib/data"

export const metadata: Metadata = { title: "Transações" }

export default async function Page() {
  const today = await getToday()
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

  const empty = noDataReason(transactions.length, accounts.length)
  // Mesma contagem que a lista mostra em "Últimos 12 meses" (movimentações internas começam ocultas).
  const visibleCount = transactions.filter((tx) => !isInternal(tx)).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transações"
        description={
          empty
            ? "Todas as contas em um só lugar"
            : `Todas as contas em um só lugar · ${plural(visibleCount, "lançamento", "lançamentos")} nos últimos 12 meses`
        }
      />
      {empty ? (
        <NoTransactions reason={empty} />
      ) : (
        <TransactionsView transactions={transactions} accounts={accountOptions} today={today} readOnly={!CAN_WRITE} />
      )}
    </div>
  )
}
