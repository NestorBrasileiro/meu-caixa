"use client"

import { EyeOff, Lock, SearchX, TriangleAlert } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { apiRequest, ClientApiError } from "@/lib/api/client"
import type { IsoDate, Transaction } from "@/lib/api/types"
import { READ_ONLY_HINT } from "@/lib/data/mode"
import { categoryLabel } from "@/lib/format/category"
import { formatDateShort } from "@/lib/format/date"
import { FilterBar } from "./filter-bar"
import { formatCount, plural } from "./format"
import {
  ALL,
  applyFilters,
  buildSearchIndex,
  categoryOptions,
  DEFAULT_FILTERS,
  groupByDay,
  hasActiveFilters,
  NO_CATEGORY,
  PAGE_SIZE,
  periodRange,
  staleAccounts,
  summarize,
  visibleCount,
  type AccountOption,
  type Filters,
} from "./model"
import {
  applyEdits,
  KNOWN_CATEGORIES,
  pruneSaved,
  recategorizeBody,
  saveFailureDescription,
  without,
  type PendingEdits,
  type SavedEdits,
} from "./recategorize"
import { SummaryStrip } from "./summary-strip"
import { rowDomId, TransactionList } from "./transaction-list"

/**
 * Tela de transações: dona de todo o estado de filtro (no cliente, sem URL),
 * da recategorização e da paginação "mostrar mais".
 *
 * Recategorizar: a linha muda na hora (com spinner no badge) e o PATCH vai
 * para a API. A resposta fica guardada e vale até a página do servidor
 * refletir a mudança — o `router.refresh()` em segundo plano atualiza o
 * cabeçalho e o cache da rota sem recarregar a lista nem perder filtros.
 * Se falhar, a linha volta para a categoria anterior e um toast diz por quê.
 */
export function TransactionsView({
  transactions,
  accounts,
  today,
  readOnly = false,
}: {
  transactions: Transaction[]
  accounts: AccountOption[]
  today: IsoDate
  /** `DATA_SOURCE=mock`: nada é salvo, então as categorias não abrem menu. */
  readOnly?: boolean
}) {
  const router = useRouter()
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [limit, setLimit] = useState(PAGE_SIZE)
  /** Categorias pedidas cujo PATCH ainda não voltou. */
  const [pending, setPending] = useState<PendingEdits>({})
  /** Respostas da API que a página do servidor ainda não reflete. */
  const [saved, setSaved] = useState<SavedEdits>({})
  /** Página do servidor da última renderização: quando muda (refresh), descarta o que ela já reflete. */
  const [serverRows, setServerRows] = useState(transactions)
  if (serverRows !== transactions) {
    setServerRows(transactions)
    setSaved((current) => pruneSaved(current, transactions))
  }
  /** Mesmo conjunto de `pending`, lido em handlers (o "Desfazer" do toast roda depois, com closure antiga). */
  const inFlight = useRef(new Set<string>())
  /** Aviso para leitores de tela enquanto salva (o resultado vem no toast, que também é anunciado). */
  const [announcement, setAnnouncement] = useState("")
  /**
   * Lançamentos recategorizados desde a última mudança de filtro. Ficam na
   * lista mesmo que a nova categoria não passe nos filtros: a linha não some
   * debaixo do clique, e os totais não mudam sem explicação.
   */
  const [pinned, setPinned] = useState<ReadonlySet<string>>(() => new Set())
  /** Primeira linha revelada pelo "Mostrar mais": recebe o foco, já que o botão pode sumir. */
  const [focusTarget, setFocusTarget] = useState<string | null>(null)
  const search = useDeferredValue(filters.search)

  const accountsById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts])
  const searchIndex = useMemo(() => buildSearchIndex(transactions), [transactions])
  const effective = useMemo(() => applyEdits(transactions, saved, pending), [transactions, saved, pending])
  const saving = useMemo(() => new Set(Object.keys(pending)), [pending])

  // Filtro: categorias que existem nos dados (e a escolhida, mesmo que tenha ficado vazia).
  const selected = filters.category
  const filterCategories = useMemo(
    () => categoryOptions(effective, selected === ALL ? [] : [selected === NO_CATEGORY ? null : selected]),
    [effective, selected],
  )
  // Menu: as dos dados, as originais e as conhecidas (dá para mover para uma categoria ainda sem lançamentos).
  const menuCategories = useMemo(
    () => categoryOptions(effective, [...KNOWN_CATEGORIES, ...transactions.map((tx) => tx.originalCategory)]),
    [effective, transactions],
  )

  const range = useMemo(() => periodRange(filters.period, today), [filters.period, today])
  const { rows, hiddenInternal, outOfFilter } = useMemo(
    () => applyFilters(effective, { ...filters, search }, range, searchIndex, pinned),
    [effective, filters, search, range, searchIndex, pinned],
  )
  const summary = useMemo(() => summarize(rows), [rows])
  const shown = visibleCount(rows, limit)
  const groups = useMemo(() => groupByDay(rows.slice(0, shown)), [rows, shown])
  const stale = staleAccounts(accounts, filters.accountId, range)
  const active = hasActiveFilters(filters)

  useEffect(() => {
    if (focusTarget) document.getElementById(rowDomId(focusTarget))?.focus()
  }, [focusTarget])

  function startOver(next: Filters | ((current: Filters) => Filters)) {
    setFilters(next)
    setLimit(PAGE_SIZE)
    setPinned(new Set())
    setFocusTarget(null)
  }

  function updateFilters(patch: Partial<Filters>) {
    startOver((current) => ({ ...current, ...patch }))
  }

  function resetFilters() {
    startOver(DEFAULT_FILTERS)
  }

  function showMore() {
    setFocusTarget(rows[shown]?.id ?? null)
    setLimit(shown + PAGE_SIZE)
  }

  /** `tx` é a linha como está na tela; `target` é a categoria efetiva desejada. */
  async function changeCategory(tx: Transaction, target: string | null) {
    if (readOnly || inFlight.current.has(tx.id) || target === tx.category) return
    const previous = tx.category
    inFlight.current.add(tx.id)
    setPinned((current) => (current.has(tx.id) ? current : new Set(current).add(tx.id)))
    setPending((current) => ({ ...current, [tx.id]: target }))
    setAnnouncement(`Salvando a categoria de ${tx.description}…`)
    try {
      const updated = await apiRequest<Transaction>(`/api/transactions/${tx.id}`, {
        method: "PATCH",
        body: recategorizeBody(target, tx.originalCategory),
      })
      setSaved((current) => ({ ...current, [tx.id]: updated }))
      const label = categoryLabel(updated.category)
      toast.success(
        updated.category === updated.originalCategory
          ? `“${tx.description}” voltou para ${label}`
          : `“${tx.description}” agora está em ${label}`,
        { action: { label: "Desfazer", onClick: () => void changeCategory(updated, previous) } },
      )
      // Atualiza o cabeçalho e o cache da rota sem bloquear a linha (o estado da tela é mantido).
      startTransition(() => router.refresh())
    } catch (error) {
      // 401: o cliente já está levando para o login.
      if (error instanceof ClientApiError && error.status === 401) return
      toast.error("Não deu para salvar a categoria", {
        description: saveFailureDescription(error, tx.description, categoryLabel(previous)),
      })
      // O lançamento sumiu (sincronização): a página nova o tira da lista.
      if (error instanceof ClientApiError && error.status === 404) startTransition(() => router.refresh())
    } finally {
      inFlight.current.delete(tx.id)
      setPending((current) => without(current, tx.id))
      if (inFlight.current.size === 0) setAnnouncement("")
    }
  }

  return (
    <div className="space-y-4">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <FilterBar
        filters={filters}
        onChange={updateFilters}
        onReset={resetFilters}
        active={active}
        accounts={accounts}
        categories={filterCategories}
        hiddenInternal={hiddenInternal}
      />

      <SummaryStrip summary={summary} range={range} />

      {(stale.length > 0 || readOnly) && (
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
          {readOnly && (
            <p className="text-muted-foreground flex items-start gap-2">
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>Categorias só para consulta. {READ_ONLY_HINT}</span>
            </p>
          )}
        </div>
      )}

      {rows.length === 0 && hiddenInternal > 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <EyeOff aria-hidden />
            </EmptyMedia>
            <EmptyTitle>
              {hiddenInternal === 1
                ? "1 lançamento oculto"
                : `${formatCount(hiddenInternal)} lançamentos ocultos`}
            </EmptyTitle>
            <EmptyDescription>
              {hiddenInternal === 1 ? "O lançamento que corresponde" : "Os lançamentos que correspondem"}{" "}
              {search.trim() ? "à busca e aos filtros" : "aos filtros"}{" "}
              {hiddenInternal === 1 ? "é uma movimentação interna" : "são movimentações internas"}{" "}
              (pagamento de fatura ou transferência entre suas contas), e a opção “Ocultar movimentações internas”
              está ligada.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" size="sm" onClick={() => updateFilters({ hideInternal: false })}>
              Mostrar movimentações internas
            </Button>
          </EmptyContent>
        </Empty>
      ) : rows.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchX aria-hidden />
            </EmptyMedia>
            <EmptyTitle>Nenhum lançamento encontrado</EmptyTitle>
            <EmptyDescription>
              Nada corresponde à busca e aos filtros escolhidos. Tente ampliar o período ou limpar os filtros.
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
            categories={menuCategories}
            outOfFilter={outOfFilter}
            focusTarget={focusTarget}
            saving={saving}
            readOnly={readOnly}
            onCategoryChange={changeCategory}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <p className="text-muted-foreground text-sm" aria-live="polite">
              {shown === rows.length
                ? `Mostrando ${plural(rows.length, "lançamento", "lançamentos")}`
                : `Mostrando ${formatCount(shown)} de ${formatCount(rows.length)}`}
            </p>
            {shown < rows.length && (
              <Button variant="outline" size="sm" onClick={showMore}>
                Mostrar mais
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
