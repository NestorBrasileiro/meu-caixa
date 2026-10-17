"use client"

import { ArrowRight, Landmark, Lock, Plus, Trash2 } from "lucide-react"
import Link from "next/link"
import { useEffect, useId, useRef, useState, type RefObject } from "react"
import { toast } from "sonner"
import { institutionInitials } from "@/components/accounts/format"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { apiRequest } from "@/lib/api/client"
import type { OpenFinanceItem, OpenFinanceSettings } from "@/lib/api/settings"
import type { IsoDateTime } from "@/lib/api/types"
import { HelpToggle } from "./credentials-section"
import {
  itemNeedsAttention,
  itemStatusView,
  itemTitle,
  itemUpdatedLabel,
  parseItemId,
  type OpenFinanceView,
} from "./open-finance"
import { DisabledHint, ErrorAlert, ExternalAnchor, Note, ToneBadge, useSettingsAction, useSyncStartedToast } from "./parts"

/**
 * Bancos (items da Pluggy): a lista com o status de cada um, adicionar pelo id do item e remover.
 * Quando a lista vem do servidor (PLUGGY_ITEM_IDS), fica só para leitura.
 */
export function ItemsPanel({
  view,
  connectUrl,
  now,
  titleId,
}: {
  view: OpenFinanceView
  connectUrl: string
  now: IsoDateTime
  /** Título da seção: recebe o foco quando o banco removido some e não há campo para focar. */
  titleId: string
}) {
  const { list, fromEnv, canAdd, canRemove, hint, inactiveNote } = view.items
  const inputRef = useRef<HTMLInputElement>(null)

  function focusAfterRemoval() {
    requestAnimationFrame(() => {
      const input = inputRef.current
      if (input && !input.disabled) input.focus()
      else document.getElementById(titleId)?.focus()
    })
  }

  return (
    <>
      {inactiveNote && <Note>{inactiveNote}</Note>}

      {list.length > 0 ? (
        <ul aria-label="Bancos adicionados" className="divide-y rounded-lg border">
          {list.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              now={now}
              connectUrl={connectUrl}
              canRemove={canRemove}
              showRemove={!fromEnv}
              readOnlyHint={view.readOnly ? hint : null}
              onRemoved={focusAfterRemoval}
            />
          ))}
        </ul>
      ) : (
        <div className="text-muted-foreground flex items-center gap-3 rounded-lg border border-dashed px-4 py-3 text-sm">
          <Landmark className="size-4 shrink-0" aria-hidden />
          Nenhum banco adicionado ainda.
        </div>
      )}

      {/* No modo mock, a dica já está no topo do cartão e nos botões desabilitados. */}
      {hint && !view.readOnly && <Note icon={fromEnv ? Lock : undefined}>{hint}</Note>}

      {!fromEnv && (
        <AddItemForm
          inputRef={inputRef}
          disabled={!canAdd}
          existing={list.map((item) => item.id)}
        />
      )}

      <HelpToggle label="Como pego o id do item?">
        <ol className="text-muted-foreground list-decimal space-y-1.5 pl-4 text-sm text-pretty marker:text-xs">
          <li>
            Conecte o banco no <ExternalAnchor href={connectUrl}>Meu Pluggy</ExternalAnchor>, com a mesma conta das
            credenciais. É gratuito para uso pessoal, até 5 conexões do mesmo titular.
          </li>
          <li>
            Copie o id do item dessa conexão (36 caracteres, no formato{" "}
            <code className="bg-muted text-foreground rounded px-1 py-0.5 font-mono text-xs">1a2b3c4d-…</code>), mostrado
            no Meu Pluggy ou na lista de items do dashboard da Pluggy.
          </li>
          <li>Cole aqui. O Meu Caixa confere o item com a Pluggy e começa a sincronizar.</li>
        </ol>
      </HelpToggle>

      {list.length > 0 && (
        <Button variant="link" size="sm" className="h-auto px-0 has-[>svg]:px-0" asChild>
          <Link href="/contas">
            Ver contas e a sincronização
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      )}
    </>
  )
}

function ItemRow({
  item,
  now,
  connectUrl,
  canRemove,
  showRemove,
  readOnlyHint,
  onRemoved,
}: {
  item: OpenFinanceItem
  now: IsoDateTime
  connectUrl: string
  canRemove: boolean
  showRemove: boolean
  readOnlyHint: string | null
  onRemoved: () => void
}) {
  const title = itemTitle(item)
  const status = itemStatusView(item.status)
  const attention = itemNeedsAttention(item)

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span
        className="bg-muted text-muted-foreground mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold"
        aria-hidden
      >
        {item.institutionName ? institutionInitials(item.institutionName) : <Landmark className="size-4" />}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="min-w-0 text-sm font-medium break-words">{title}</p>
          <ToneBadge status={status} />
        </div>
        <p className="text-muted-foreground text-xs">{itemUpdatedLabel(item, now)}</p>
        <p className="text-muted-foreground truncate font-mono text-xs" title={item.id}>
          <span className="sr-only">id do item </span>
          {item.id}
        </p>
        {(item.error || attention) && (
          <p className="text-xs text-pretty">
            {item.error && <span className="text-foreground">{item.error} </span>}
            {attention && <ExternalAnchor href={connectUrl}>Reconectar no Meu Pluggy</ExternalAnchor>}
          </p>
        )}
      </div>
      {showRemove && (
        <RemoveItem item={item} title={title} disabled={!canRemove} hint={readOnlyHint} onRemoved={onRemoved} />
      )}
    </li>
  )
}

function RemoveItem({
  item,
  title,
  disabled,
  hint,
  onRemoved,
}: {
  item: OpenFinanceItem
  title: string
  disabled: boolean
  hint: string | null
  onRemoved: () => void
}) {
  const [open, setOpen] = useState(false)
  const removed = useRef(false)
  const mutation = useSettingsAction("removeItem")

  function confirm() {
    mutation.run(
      () => apiRequest(`/api/settings/open-finance/items/${encodeURIComponent(item.id)}`, { method: "DELETE" }),
      () => {
        removed.current = true
        setOpen(false)
        toast.success(`${title} removido`, { description: "Os dados desse banco foram apagados do Meu Caixa." })
      },
    )
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (mutation.pending) return
        if (next) {
          removed.current = false
          mutation.setError(null)
        }
        setOpen(next)
      }}
    >
      <DisabledHint hint={hint}>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 -mr-1 shrink-0"
          onClick={() => setOpen(true)}
        >
          <Trash2 aria-hidden />
          <span className="sr-only">Remover {title}</span>
        </Button>
      </DisabledHint>
      <AlertDialogContent
        aria-busy={mutation.pending}
        onCloseAutoFocus={(event) => {
          // Removido: a linha some junto com o diálogo; o foco vai para o campo de adicionar (ou o título).
          // Cancelado: volta ao botão (padrão).
          if (!removed.current) return
          event.preventDefault()
          onRemoved()
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="leading-snug">Remover {title}?</AlertDialogTitle>
          <AlertDialogDescription>
            As contas, transações e faturas sincronizadas desse banco (e as categorias que você ajustou nelas) serão
            apagadas do Meu Caixa. O planejamento continua. O banco segue conectado no Meu Pluggy: para trazê-lo de
            volta, adicione o item de novo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {mutation.error && <ErrorAlert error={mutation.error} />}
        <AlertDialogFooter className="max-sm:grid max-sm:grid-cols-2">
          <AlertDialogCancel disabled={mutation.pending}>Cancelar</AlertDialogCancel>
          <Button variant="destructive" onClick={confirm} disabled={mutation.pending}>
            {mutation.pending && <Spinner aria-hidden />}
            {mutation.pending ? "Removendo…" : "Remover banco"}
          </Button>
        </AlertDialogFooter>
        <span role="status" aria-live="polite" className="sr-only">
          {mutation.pending ? "Removendo o banco…" : ""}
        </span>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function AddItemForm({
  inputRef,
  disabled,
  existing,
}: {
  inputRef: RefObject<HTMLInputElement | null>
  disabled: boolean
  existing: string[]
}) {
  const id = useId()
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const mutation = useSettingsAction("item")
  const syncToast = useSyncStartedToast()
  const refocus = useRef(false)

  // O campo fica desabilitado durante o envio (e perde o foco): quando a tela já tem o banco novo,
  // o foco volta para ele, pronto para o próximo.
  useEffect(() => {
    if (mutation.pending || !refocus.current) return
    refocus.current = false
    inputRef.current?.focus()
  }, [mutation.pending, inputRef])

  function submit() {
    const result = parseItemId(value, existing)
    if (!result.ok) {
      setError(result.errors)
      mutation.setError(null)
      inputRef.current?.focus()
      return
    }
    setError(null)
    const itemId = result.value
    mutation.run(
      () =>
        apiRequest<OpenFinanceSettings>("/api/settings/open-finance/items", { method: "POST", body: { itemId } }),
      (settings) => {
        setValue("")
        const added = settings?.items?.list?.find((item) => item.id.toLowerCase() === itemId)
        syncToast(`${added ? itemTitle(added) : "Banco"} adicionado`, "A Pluggy confirmou o item e a sincronização começou.")
        refocus.current = true
      },
    )
  }

  const errorId = `${id}-error`
  return (
    <form
      noValidate
      autoComplete="off"
      aria-busy={mutation.pending}
      aria-label="Adicionar banco"
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (!mutation.pending && !disabled) submit()
      }}
    >
      <fieldset disabled={disabled || mutation.pending} className="min-w-0">
        <Field data-invalid={error ? true : undefined} className="gap-2">
          <FieldLabel htmlFor={`${id}-item`}>Id do item</FieldLabel>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              ref={inputRef}
              id={`${id}-item`}
              name="pluggy-item-id"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="1a2b3c4d-5e6f-…"
              className="min-w-0 flex-1 font-mono text-[0.8125rem] md:text-[0.8125rem]"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
            <Button type="submit" variant="outline" className="shrink-0">
              {mutation.pending ? <Spinner aria-hidden /> : <Plus aria-hidden />}
              {mutation.pending ? "Verificando o item…" : "Adicionar banco"}
            </Button>
          </div>
          {error && (
            <FieldError id={errorId} className="text-xs">
              {error}
            </FieldError>
          )}
        </Field>
      </fieldset>
      {mutation.error && <ErrorAlert error={mutation.error} />}
      <span role="status" aria-live="polite" className="sr-only">
        {mutation.pending ? "Verificando o item com a Pluggy…" : ""}
      </span>
    </form>
  )
}
