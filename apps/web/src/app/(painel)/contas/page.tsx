import type { Metadata } from "next"
import { Landmark } from "lucide-react"
import { AccountsSummary } from "@/components/accounts/accounts-summary"
import { ConnectionAlerts } from "@/components/accounts/connection-alerts"
import { ConnectionCard } from "@/components/accounts/connection-card"
import { MEU_PLUGGY_URL, plural } from "@/components/accounts/format"
import { AccountsHeaderActions } from "@/components/accounts/header-actions"
import { buildInvoiceHistory, findOpenInvoice } from "@/components/accounts/invoices"
import { InvoicesCard } from "@/components/accounts/invoices-card"
import { SyncHistoryCard } from "@/components/accounts/sync-history-card"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { getAccounts, getConnections, getInvoices, getNow, getSyncRuns, getToday } from "@/lib/data"

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

  const cards = accounts.filter((account) => account.type === "CREDIT_CARD")
  const openInvoices = Object.fromEntries(
    cards.map((card) => {
      const open = findOpenInvoice(invoices, card.id, today)
      return [card.id, open && { dueDate: open.dueDate, closingDate: open.closingDate, total: open.total }]
    }),
  )
  const histories = cards.map((card) => buildInvoiceHistory(card, invoices, today))

  const description =
    connections.length === 0
      ? "Nenhum banco conectado ainda."
      : `${plural(connections.length, "banco conectado", "bancos conectados")} via Meu Pluggy · ${plural(accounts.length, "conta", "contas")}`

  // As grades respondem à largura da área de conteúdo (container "page"), não à da janela:
  // a barra lateral ocupa 16rem a partir de md e pode ser recolhida.
  return (
    <div className="@container/page space-y-6">
      <PageHeader title="Contas" description={description} actions={<AccountsHeaderActions />} />

      <ConnectionAlerts connections={connections} accounts={accounts} />

      {connections.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Landmark aria-hidden />
            </EmptyMedia>
            <EmptyTitle>Nenhum banco conectado</EmptyTitle>
            <EmptyDescription>
              Conecte seus bancos no Meu Pluggy; contas, saldos e faturas aparecem aqui na próxima sincronização.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" size="sm" asChild>
              <a href={MEU_PLUGGY_URL} target="_blank" rel="noopener noreferrer">
                Conectar banco
              </a>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          <AccountsSummary
            accounts={accounts}
            connections={connections}
            openInvoiceDueDate={cards.length === 1 ? (openInvoices[cards[0].id]?.dueDate ?? null) : null}
          />

          {/* Cada card ocupa duas linhas da grade (subgrid): cabeçalhos e divisórias alinham numa mesma fileira. */}
          <section
            aria-label="Bancos conectados"
            className="grid grid-cols-1 gap-4 @2xl/page:grid-cols-2 @min-[60rem]/page:grid-cols-3"
          >
            {connections.map((connection) => (
              <ConnectionCard
                key={connection.id}
                connection={connection}
                accounts={accounts.filter((account) => account.connectionId === connection.id)}
                openInvoices={openInvoices}
                today={today}
                now={now}
              />
            ))}
          </section>
        </>
      )}

      <div
        className={
          histories.length > 0 ? "grid grid-cols-1 items-start gap-4 @min-[60rem]/page:grid-cols-2" : undefined
        }
      >
        {histories.map((history) => (
          <InvoicesCard key={history.accountId} history={history} />
        ))}
        <SyncHistoryCard runs={runs} />
      </div>
    </div>
  )
}
