import type { Metadata } from "next"
import { AccountsView } from "@/components/accounts/accounts-view"
import { CAN_WRITE, getAccounts, getConnections, getInvoices, getNow, getSyncRuns, getToday } from "@/lib/data"

export const metadata: Metadata = { title: "Contas" }

export default async function Page() {
  const today = await getToday()
  const now = await getNow()
  const [connections, accounts, invoices, runs] = await Promise.all([
    getConnections(),
    getAccounts(),
    getInvoices(),
    getSyncRuns(),
  ])

  return (
    <AccountsView data={{ connections, accounts, invoices, runs }} today={today} now={now} readOnly={!CAN_WRITE} />
  )
}
