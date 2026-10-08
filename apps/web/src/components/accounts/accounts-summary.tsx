import { CreditCard, Gauge, Wallet } from "lucide-react"
import type { Account, Connection, IsoDate } from "@/lib/api/types"
import { StatTile } from "@/components/finance/stat-tile"
import { totalCardDebt, totalCash } from "@/lib/finance/aggregate"
import { isCashAccount } from "@/lib/finance/classify"
import { formatDateShort } from "@/lib/format/date"
import { formatMoney, formatPercent } from "@/lib/format/money"
import { plural } from "./format"

/** Os três números da tela: quanto há nas contas, quanto se deve no cartão e quanto limite sobra. */
export function AccountsSummary({
  accounts,
  connections,
  openInvoiceDueDate,
}: {
  accounts: Account[]
  connections: Connection[]
  /** Vencimento da fatura aberta quando há um único cartão. */
  openInvoiceDueDate: IsoDate | null
}) {
  const cashAccounts = accounts.filter(isCashAccount)
  const cards = accounts.filter((account) => account.type === "CREDIT_CARD")
  const cash = totalCash(accounts)
  const debt = totalCardDebt(accounts)
  const available = cards.reduce((sum, card) => sum + (card.availableCredit ?? 0), 0)
  const limit = cards.reduce((sum, card) => sum + (card.creditLimit ?? 0), 0)

  // Saldo de conexão parada pode estar velho: dizer de quando é.
  const activeConnections = new Set(connections.filter((c) => c.status === "ACTIVE").map((c) => c.id))
  const stale = cashAccounts.find(
    (account) => !activeConnections.has(account.connectionId) && account.transactionsSyncedThrough,
  )

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <StatTile
        label="Total em contas"
        value={formatMoney(cash)}
        icon={<Wallet aria-hidden />}
        hint={
          stale?.transactionsSyncedThrough
            ? `Inclui o saldo de ${formatDateShort(stale.transactionsSyncedThrough)} da ${stale.name}`
            : `Soma de ${plural(cashAccounts.length, "conta", "contas")}`
        }
      />
      <StatTile
        label="Devendo no cartão"
        value={formatMoney(debt)}
        icon={<CreditCard aria-hidden />}
        hint={
          cards.length === 0
            ? "Nenhum cartão conectado"
            : openInvoiceDueDate
              ? `Fatura aberta, vence em ${formatDateShort(openInvoiceDueDate)}`
              : `Faturas abertas de ${plural(cards.length, "cartão", "cartões")}`
        }
      />
      <StatTile
        label="Limite disponível"
        value={formatMoney(available)}
        icon={<Gauge aria-hidden />}
        hint={
          limit > 0
            ? `${formatPercent(available / limit)} de um limite de ${formatMoney(limit)}`
            : "Nenhum cartão conectado"
        }
      />
    </div>
  )
}
