import type { Metadata } from "next"
import { AccountsView } from "@/components/accounts/accounts-view"
import { loadOrNull } from "@/components/shell/fail-soft"
import {
  CAN_WRITE,
  getAccounts,
  getConnections,
  getInvoices,
  getLoans,
  getNow,
  getSyncRuns,
  getToday,
} from "@/lib/data"

export const metadata: Metadata = { title: "Contas" }

export default async function Page() {
  const today = await getToday()
  const now = await getNow()
  const [connections, accounts, invoices, runs, loans] = await Promise.all([
    getConnections(),
    getAccounts(),
    getInvoices(),
    getSyncRuns(),
    // Empréstimos são um cartão entre vários: se a API falhar neles, o cartão avisa e o resto fica.
    loadOrNull("os empréstimos", getLoans),
  ])

  return (
    <AccountsView data={{ connections, accounts, invoices, runs, loans }} today={today} now={now} readOnly={!CAN_WRITE} />
  )
}
