"use client"

import { Clock } from "lucide-react"
import { createElement } from "react"
import { ACCOUNT_TYPE } from "@/components/finance/account-type"
import { Money } from "@/components/finance/money"
import { PAYMENT_METHOD_LABEL } from "@/components/finance/payment-method"
import { Badge } from "@/components/ui/badge"
import type { IsoDate, Transaction } from "@/lib/api/types"
import { cn } from "@/lib/utils"
import { CategoryMenu } from "./category-menu"
import { dayHeading } from "./format"
import { transactionIcon } from "./icons"
import { normalizeText, type AccountOption, type CategoryOption, type DayGroup } from "./model"

/**
 * Lista agrupada por dia. Cada linha é uma grade com áreas nomeadas:
 * - estreito: ícone | descrição + favorecido · conta | valor, e embaixo a categoria e os selos;
 * - largo (container ≥ 48rem): ícone | descrição | conta | categoria | valor, alinhados entre as linhas.
 */
const ROW_GRID = cn(
  "grid grid-cols-[2rem_minmax(0,1fr)_auto] gap-x-3 [grid-template-areas:'icon_main_amount'_'icon_tags_tags']",
  "@3xl/list:grid-cols-[2rem_minmax(0,1fr)_13rem_13rem_8.5rem] @3xl/list:[grid-template-areas:'icon_main_account_tags_amount']",
)

export function TransactionList({
  groups,
  today,
  accountsById,
  originals,
  categories,
  onCategoryChange,
}: {
  groups: DayGroup[]
  today: IsoDate
  accountsById: Map<string, AccountOption>
  originals: Map<string, string | null>
  categories: CategoryOption[]
  onCategoryChange: (transactionId: string, category: string | null) => void
}) {
  return (
    <div className="@container/list">
      <div
        aria-hidden
        className={cn(
          ROW_GRID,
          "text-muted-foreground hidden border-b px-4 py-2 text-xs font-medium @3xl/list:grid",
        )}
      >
        <span className="[grid-area:main]">Descrição</span>
        <span className="[grid-area:account]">Conta</span>
        <span className="[grid-area:tags]">Categoria</span>
        <span className="text-right [grid-area:amount]">Valor</span>
      </div>
      {groups.map((group) => {
        const heading = dayHeading(group.date, today)
        const headingId = `day-${group.date}`
        return (
          <section key={group.date} aria-labelledby={headingId}>
            <div className="bg-muted sticky top-14 z-[1] flex items-center justify-between gap-4 border-b px-4 py-2 text-sm">
              <h3 id={headingId} className="flex items-baseline gap-1.5">
                <span className="font-medium">{heading.title}</span>
                <span className="text-muted-foreground text-xs">{heading.date}</span>
              </h3>
              <p className="text-muted-foreground text-xs tabular-nums">
                <span className="sr-only">Saldo do dia: </span>
                <Money cents={group.net} tone="flow" />
              </p>
            </div>
            <ul role="list" className="divide-y border-b">
              {group.items.map((tx) => (
                <TransactionRow
                  key={tx.id}
                  tx={tx}
                  account={accountsById.get(tx.accountId)}
                  original={originals.get(tx.id) ?? null}
                  categories={categories}
                  onCategoryChange={onCategoryChange}
                />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function TransactionRow({
  tx,
  account,
  original,
  categories,
  onCategoryChange,
}: {
  tx: Transaction
  account: AccountOption | undefined
  original: string | null
  categories: CategoryOption[]
  onCategoryChange: (transactionId: string, category: string | null) => void
}) {
  const counterparty =
    tx.counterpartyName && normalizeText(tx.counterpartyName) !== normalizeText(tx.description)
      ? tx.counterpartyName
      : null
  const method =
    tx.paymentMethod && tx.paymentMethod !== "OTHER" && tx.paymentMethod !== "CARD"
      ? PAYMENT_METHOD_LABEL[tx.paymentMethod]
      : null
  // Estreito: favorecido · conta. Largo: favorecido · meio de pagamento (a conta tem coluna própria).
  const narrowMeta = [counterparty, account?.name].filter(Boolean).join(" · ")
  const wideMeta = [counterparty, method].filter(Boolean).join(" · ")

  return (
    <li className={cn(ROW_GRID, "gap-y-1.5 px-4 py-3 @3xl/list:items-center")}>
      <span
        aria-hidden
        className="bg-muted text-muted-foreground flex size-8 items-center justify-center self-start rounded-full [grid-area:icon] @3xl/list:self-center"
      >
        {createElement(transactionIcon(tx.category, tx.paymentMethod), { className: "size-4" })}
      </span>

      <div className="min-w-0 [grid-area:main]">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-medium">{tx.description}</p>
          <RowBadges tx={tx} className="hidden @3xl/list:flex" />
        </div>
        {narrowMeta && <p className="text-muted-foreground truncate text-xs @3xl/list:hidden">{narrowMeta}</p>}
        {wideMeta && <p className="text-muted-foreground hidden truncate text-xs @3xl/list:block">{wideMeta}</p>}
      </div>

      {account && (
        <div className="text-muted-foreground hidden min-w-0 items-center gap-1.5 text-sm [grid-area:account] @3xl/list:flex">
          {createElement(ACCOUNT_TYPE[account.type].icon, { className: "size-3.5 shrink-0", "aria-hidden": true })}
          <span className="truncate">{account.name}</span>
        </div>
      )}

      <div className="flex min-w-0 flex-wrap items-center gap-1.5 [grid-area:tags]">
        <CategoryMenu
          category={tx.category}
          original={original}
          options={categories}
          description={tx.description}
          onChange={(category) => onCategoryChange(tx.id, category)}
        />
        <RowBadges tx={tx} className="flex @3xl/list:hidden" />
      </div>

      <p className="text-right text-sm font-medium tabular-nums [grid-area:amount]">
        <Money cents={tx.amount} tone="flow" />
      </p>
    </li>
  )
}

/** Parcela e "Pendente". Renderizado duas vezes (estreito/largo); só um fica visível. */
function RowBadges({ tx, className }: { tx: Transaction; className?: string }) {
  if (!tx.installment && tx.status !== "PENDING") return null
  return (
    <span className={cn("shrink-0 items-center gap-1.5", className)}>
      {tx.installment && (
        <Badge variant="secondary" className="font-normal tabular-nums">
          <span className="sr-only">Parcela </span>
          {tx.installment.number}/{tx.installment.total}
        </Badge>
      )}
      {tx.status === "PENDING" && (
        <Badge variant="outline" className="text-muted-foreground font-normal">
          <Clock className="text-status-warning" aria-hidden />
          Pendente
        </Badge>
      )}
    </span>
  )
}
