import { CreditCard, Gauge, TriangleAlert, Wallet } from "lucide-react"
import type { ReactNode } from "react"
import type { Account, Connection, IsoDate } from "@/lib/api/types"
import { StatTile } from "@/components/finance/stat-tile"
import { totalCardDebt, totalCash } from "@/lib/finance/aggregate"
import { isCashAccount } from "@/lib/finance/classify"
import { formatDateShort } from "@/lib/format/date"
import { formatMoney, formatPercent } from "@/lib/format/money"
import { plural } from "./format"

/** Valor do tile: um passo menor no celular, onde dois tiles dividem a linha (como na visão geral). */
function TileValue({ children }: { children: ReactNode }) {
  return <span className="text-xl sm:text-2xl">{children}</span>
}

/** No celular o ícone sai para o rótulo caber numa linha. */
const iconClass = "max-sm:hidden"

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

  // Estreito: o total ocupa a linha inteira e os dois números do cartão dividem a de baixo.
  // A partir de 60rem de conteúdo, três colunas alinhadas com os cards dos bancos.
  return (
    <section aria-label="Resumo das contas" className="grid grid-cols-2 gap-4 @min-[60rem]/page:grid-cols-3">
      <StatTile
        className="col-span-2 @min-[60rem]/page:col-span-1"
        label="Total em contas"
        value={<TileValue>{formatMoney(cash)}</TileValue>}
        icon={<Wallet className={iconClass} aria-hidden />}
        hint={
          stale?.transactionsSyncedThrough ? (
            <span className="inline-flex items-start gap-1">
              <TriangleAlert className="text-status-warning mt-0.5 size-3 shrink-0" aria-hidden />
              <span>
                Inclui saldo desatualizado ({stale.name}, {formatDateShort(stale.transactionsSyncedThrough)})
              </span>
            </span>
          ) : cashAccounts.length === 0 ? (
            "Nenhuma conta corrente ou poupança"
          ) : (
            `Soma de ${plural(cashAccounts.length, "conta", "contas")}`
          )
        }
      />
      <StatTile
        label="Devendo no cartão"
        value={<TileValue>{formatMoney(debt)}</TileValue>}
        icon={<CreditCard className={iconClass} aria-hidden />}
        hint={
          cards.length === 0
            ? "Nenhum cartão conectado"
            : openInvoiceDueDate
              ? `Fatura em aberto, vence em ${formatDateShort(openInvoiceDueDate)}`
              : `Faturas em aberto de ${plural(cards.length, "cartão", "cartões")}`
        }
      />
      <StatTile
        label="Limite disponível"
        value={<TileValue>{formatMoney(available)}</TileValue>}
        icon={<Gauge className={iconClass} aria-hidden />}
        hint={
          limit > 0 ? (
            <>
              {formatPercent((limit - available) / limit)} de{" "}
              <span className="whitespace-nowrap">{formatMoney(limit)}</span> em uso
            </>
          ) : (
            "Nenhum cartão conectado"
          )
        }
      />
    </section>
  )
}
