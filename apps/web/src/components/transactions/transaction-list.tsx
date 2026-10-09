"use client"

import { Clock, EyeOff } from "lucide-react"
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
import {
  categoryOptionsFor,
  normalizeText,
  type AccountOption,
  type CategoryOption,
  type DayGroup,
  type OutOfFilterReason,
} from "./model"

/**
 * Lista agrupada por dia. Cada linha é uma grade com áreas nomeadas:
 * - estreito: ícone | descrição + favorecido · conta | valor, e embaixo a categoria e os selos;
 * - largo (container ≥ 48rem): ícone | descrição | conta | categoria | valor, alinhados entre as linhas.
 */
const ROW_GRID = cn(
  "grid grid-cols-[2rem_minmax(0,1fr)_auto] gap-x-3 [grid-template-areas:'icon_main_amount'_'icon_tags_tags']",
  "@3xl/list:grid-cols-[2rem_minmax(0,1fr)_13rem_13rem_8.5rem] @3xl/list:[grid-template-areas:'icon_main_account_tags_amount']",
)

/** id do elemento da linha, para devolver o foco depois do "Mostrar mais". */
export function rowDomId(transactionId: string): string {
  return `lancamento-${transactionId}`
}

const OUT_OF_FILTER_NOTE: Record<OutOfFilterReason, string> = {
  internal: "Agora é movimentação interna: some da lista quando os filtros mudarem",
  category: "Fora da categoria filtrada: some da lista quando os filtros mudarem",
}

export function TransactionList({
  groups,
  today,
  accountsById,
  categories,
  outOfFilter,
  focusTarget,
  saving,
  readOnly,
  onCategoryChange,
}: {
  groups: DayGroup[]
  today: IsoDate
  accountsById: Map<string, AccountOption>
  /** Opções do menu de categoria (filtradas por lançamento em `categoryOptionsFor`). */
  categories: CategoryOption[]
  /** Linhas editadas que só continuam na lista por terem sido editadas com os filtros atuais. */
  outOfFilter: Map<string, OutOfFilterReason>
  focusTarget: string | null
  /** Lançamentos com a categoria sendo salva. */
  saving: ReadonlySet<string>
  readOnly: boolean
  onCategoryChange: (tx: Transaction, category: string | null) => void
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
            {/* Faixa opaca (fica por cima das linhas ao rolar), mais clara que bg-muted para o texto passar de 4,5:1. */}
            <div className="sticky top-14 z-[1] flex items-center justify-between gap-4 border-b bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))] px-4 py-2 text-sm">
              <h2 id={headingId} className="flex items-baseline gap-1.5">
                <span className="font-medium">{heading.title}</span>
                <span className="text-muted-foreground text-xs">{heading.date}</span>
              </h2>
              <p className="text-foreground text-xs font-medium tabular-nums">
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
                  categories={categories}
                  outOfFilter={outOfFilter.get(tx.id) ?? null}
                  focusable={tx.id === focusTarget}
                  saving={saving.has(tx.id)}
                  readOnly={readOnly}
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
  categories,
  outOfFilter,
  focusable,
  saving,
  readOnly,
  onCategoryChange,
}: {
  tx: Transaction
  account: AccountOption | undefined
  categories: CategoryOption[]
  outOfFilter: OutOfFilterReason | null
  /** Alvo do foco programático (primeira linha revelada pelo "Mostrar mais"). */
  focusable: boolean
  saving: boolean
  readOnly: boolean
  onCategoryChange: (tx: Transaction, category: string | null) => void
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
    <li
      id={rowDomId(tx.id)}
      tabIndex={focusable ? -1 : undefined}
      className={cn(
        ROW_GRID,
        "focus-visible:ring-ring/50 gap-y-1.5 px-4 py-3 outline-none focus-visible:ring-[3px] focus-visible:ring-inset @3xl/list:items-center",
      )}
    >
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
        {outOfFilter && (
          <p className="text-muted-foreground mt-1 flex items-start gap-1.5 text-xs">
            <EyeOff className="mt-px size-3.5 shrink-0" aria-hidden />
            {OUT_OF_FILTER_NOTE[outOfFilter]}
          </p>
        )}
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
          original={tx.originalCategory}
          options={readOnly ? [] : categoryOptionsFor(categories, tx, account)}
          description={tx.description}
          pending={saving}
          pendingTransaction={tx.status === "PENDING"}
          readOnly={readOnly}
          onChange={(category) => onCategoryChange(tx, category)}
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
