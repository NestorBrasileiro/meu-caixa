"use client"

import { PencilLine, SearchX, TriangleAlert } from "lucide-react"
import Link from "next/link"
import { useDeferredValue, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import type { IsoDate, Transaction } from "@/lib/api/types"
import { formatDateShort } from "@/lib/format/date"
import { FilterBar } from "./filter-bar"
import { formatCount, plural } from "./format"
import {
  applyFilters,
  buildSearchIndex,
  categoryOptions,
  DEFAULT_FILTERS,
  groupByDay,
  hasActiveFilters,
  PAGE_SIZE,
  periodRange,
  staleAccounts,
  summarize,
  type AccountOption,
  type Filters,
} from "./model"
import { SummaryStrip } from "./summary-strip"
import { TransactionList } from "./transaction-list"

/**
 * Tela de transações: dona de todo o estado de filtro (no cliente, sem URL),
 * das categorias editadas localmente e da paginação "mostrar mais".
 */
export function TransactionsView({
  transactions,
  accounts,
  today,
}: {
  transactions: Transaction[]
  accounts: AccountOption[]
  today: IsoDate
}) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [limit, setLimit] = useState(PAGE_SIZE)
  /** id do lançamento → categoria escolhida pelo usuário (só nesta sessão). */
  const [edits, setEdits] = useState<Record<string, string | null>>({})
  const search = useDeferredValue(filters.search)

  const accountsById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts])
  const originals = useMemo(() => new Map(transactions.map((tx) => [tx.id, tx.category])), [transactions])
  const searchIndex = useMemo(() => buildSearchIndex(transactions), [transactions])
  const categories = useMemo(() => categoryOptions(transactions), [transactions])

  const effective = useMemo(
    () => transactions.map((tx) => (tx.id in edits ? { ...tx, category: edits[tx.id] } : tx)),
    [transactions, edits],
  )
  const range = useMemo(() => periodRange(filters.period, today), [filters.period, today])
  const { rows, hiddenInternal } = useMemo(
    () => applyFilters(effective, { ...filters, search }, range, searchIndex),
    [effective, filters, search, range, searchIndex],
  )
  const summary = useMemo(() => summarize(rows), [rows])
  const groups = useMemo(() => groupByDay(rows, limit), [rows, limit])
  const stale = staleAccounts(accounts, filters.accountId, range)
  const editedCount = Object.keys(edits).length
  const active = hasActiveFilters(filters)
  const shown = Math.min(limit, rows.length)

  function updateFilters(patch: Partial<Filters>) {
    setFilters((current) => ({ ...current, ...patch }))
    setLimit(PAGE_SIZE)
  }

  function resetFilters() {
    setFilters(DEFAULT_FILTERS)
    setLimit(PAGE_SIZE)
  }

  function changeCategory(transactionId: string, category: string | null) {
    setEdits((current) => {
      const next = { ...current }
      if (category === originals.get(transactionId)) delete next[transactionId]
      else next[transactionId] = category
      return next
    })
  }

  return (
    <div className="space-y-4">
      <FilterBar
        filters={filters}
        onChange={updateFilters}
        onReset={resetFilters}
        active={active}
        accounts={accounts}
        categories={categories}
        hiddenInternal={hiddenInternal}
      />

      <SummaryStrip summary={summary} range={range} />

      {(stale.length > 0 || editedCount > 0) && (
        <div className="space-y-1.5 text-sm">
          {stale.map((account) => (
            <p key={account.id} className="text-muted-foreground flex items-start gap-2">
              <TriangleAlert className="text-status-warning mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                <span className="text-foreground font-medium">{account.name}</span> ({account.institutionName}) só tem
                lançamentos até {formatDateShort(account.transactionsSyncedThrough!)}: a conexão pede um novo login.{" "}
                <Link href="/contas" className="text-foreground underline underline-offset-4">
                  Ver contas
                </Link>
              </span>
            </p>
          ))}
          {editedCount > 0 && (
            <p className="text-muted-foreground flex items-start gap-2" role="status">
              <PencilLine className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {editedCount === 1 ? "1 categoria editada" : `${formatCount(editedCount)} categorias editadas`} nesta
                tela. As mudanças passam a ser salvas quando a interface estiver ligada à API.{" "}
                <button
                  type="button"
                  onClick={() => setEdits({})}
                  className="text-foreground underline underline-offset-4"
                >
                  Desfazer
                </button>
              </span>
            </p>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchX aria-hidden />
            </EmptyMedia>
            <EmptyTitle>Nenhum lançamento encontrado</EmptyTitle>
            <EmptyDescription>
              {transactions.length === 0
                ? "Os lançamentos aparecem aqui depois da primeira sincronização com os bancos."
                : "Nada corresponde à busca e aos filtros escolhidos. Tente ampliar o período ou limpar os filtros."}
            </EmptyDescription>
          </EmptyHeader>
          {active && (
            <EmptyContent>
              <Button variant="outline" size="sm" onClick={resetFilters}>
                Limpar filtros
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <Card className="gap-0 overflow-clip py-0">
          <TransactionList
            groups={groups}
            today={today}
            accountsById={accountsById}
            originals={originals}
            categories={categories}
            onCategoryChange={changeCategory}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <p className="text-muted-foreground text-sm" aria-live="polite">
              {shown === rows.length
                ? `Mostrando ${plural(rows.length, "lançamento", "lançamentos")}`
                : `Mostrando ${formatCount(shown)} de ${formatCount(rows.length)}`}
            </p>
            {shown < rows.length && (
              <Button variant="outline" size="sm" onClick={() => setLimit((current) => current + PAGE_SIZE)}>
                Mostrar mais
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
