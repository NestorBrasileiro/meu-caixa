import { ExternalLink, Landmark } from "lucide-react"
import type { Account, Connection, Invoice, IsoDate, IsoDateTime, SyncRun } from "@/lib/api/types"
import { findActiveRun } from "@/components/shell/sync-status"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { cn } from "@/lib/utils"
import { AccountsSummary } from "./accounts-summary"
import { ConnectionAlerts } from "./connection-alerts"
import { ConnectionCard } from "./connection-card"
import { MEU_PLUGGY_URL, plural } from "./format"
import { AccountsHeaderActions } from "./header-actions"
import { buildInvoiceHistory, findOpenInvoice } from "./invoices"
import { InvoicesCard } from "./invoices-card"
import { SyncHistoryCard } from "./sync-history-card"

export interface AccountsData {
  connections: Connection[]
  accounts: Account[]
  invoices: Invoice[]
  runs: SyncRun[]
}

/**
 * Colunas da grade dos bancos: até três lado a lado (alinhadas com o resumo), mas com dois bancos
 * a fileira se divide ao meio em vez de deixar um terço vazio.
 */
function connectionColumns(count: number): string {
  return count >= 3 ? "@2xl/page:grid-cols-2 @min-[60rem]/page:grid-cols-3" : "@2xl/page:grid-cols-2"
}

/** A tela de contas a partir dos dados já carregados (a página só busca; aqui só se monta). */
export function AccountsView({
  data: { connections, accounts, invoices, runs },
  today,
  now,
  readOnly,
}: {
  data: AccountsData
  today: IsoDate
  now: IsoDateTime
  readOnly: boolean
}) {
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
      <PageHeader
        title="Contas"
        description={description}
        actions={<AccountsHeaderActions readOnly={readOnly} runningRunId={findActiveRun(runs, now)?.id ?? null} />}
      />

      <ConnectionAlerts connections={connections} accounts={accounts} />

      {connections.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Landmark aria-hidden />
            </EmptyMedia>
            <EmptyTitle>
              <h2>Nenhum banco conectado</h2>
            </EmptyTitle>
            <EmptyDescription>
              Conecte seus bancos no Meu Pluggy e depois use “Sincronizar agora” para trazer contas, saldos e
              faturas para cá.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" size="sm" asChild>
              <a href={MEU_PLUGGY_URL} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden />
                Conectar banco
                <span className="sr-only">(abre o Meu Pluggy em nova aba)</span>
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
            className={cn("grid grid-cols-1 gap-4", connectionColumns(connections.length))}
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
        <SyncHistoryCard runs={runs} now={now} />
      </div>
    </div>
  )
}
