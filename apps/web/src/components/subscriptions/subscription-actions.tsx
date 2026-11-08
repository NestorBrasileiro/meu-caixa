"use client"

import { CalendarPlus, EyeOff, MoreHorizontal, Pencil, Repeat, Undo2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { DialogMenu, DialogMenuItem, MenuReadOnlyNote, ReadOnlyHint } from "@/components/planning/actions"
import { CommitmentDialog } from "@/components/planning/commitment-dialog"
import { FormDialog, FormField } from "@/components/planning/form-dialog"
import { useMutation } from "@/components/planning/use-mutation"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { apiRequest } from "@/lib/api/client"
import type { BudgetCategory } from "@/lib/api/planning"
import type { Subscription, SubscriptionPreferenceInput } from "@/lib/api/subscriptions"
import type { IsoDate } from "@/lib/api/types"
import { commitmentDraft, type SubscriptionSection } from "./model"

const PATH = "/api/subscriptions/preferences"
const NAME_MAX = 80
/** Completa a mensagem de falta de permissão. */
const WHERE = "nas assinaturas"

interface DialogState {
  open: boolean
  key: number
  /** Quem abriu o diálogo (o "…" da linha): recebe o foco de volta ao fechar. */
  returnFocus: HTMLElement | null
}

function restoreFocus(event: Event, target: HTMLElement | null) {
  if (!target?.isConnected) return
  event.preventDefault()
  target.focus()
}

const opened = (focus: HTMLElement | null) => (current: DialogState | null) => ({
  open: true,
  key: (current?.key ?? 0) + 1,
  returnFocus: focus,
})

const withOpen = (open: boolean) => (current: DialogState | null) => (current ? { ...current, open } : current)

export function SubscriptionActions({
  subscription,
  section,
  categories,
  today,
  readOnly,
}: {
  subscription: Subscription
  section: SubscriptionSection
  categories: BudgetCategory[]
  today: IsoDate
  readOnly: boolean
}) {
  const mutation = useMutation()
  const [rename, setRename] = useState<DialogState | null>(null)
  const [planning, setPlanning] = useState<DialogState | null>(null)

  /** Ajuste direto pelo menu: sem diálogo aberto, o erro vira aviso. */
  const save = (input: SubscriptionPreferenceInput, success: string) =>
    mutation.run(() => apiRequest(PATH, { method: "PUT", body: input }), {
      action: "salvar",
      where: WHERE,
      onSuccess: () => toast.success(success),
      onError: (message) => toast.error(message),
    })

  if (section === "hidden") {
    const restore = (
      <Button
        variant="outline"
        size="sm"
        disabled={readOnly || mutation.pending}
        onClick={() => save({ key: subscription.key, kind: null }, `“${subscription.name}” voltou para a lista`)}
      >
        <Undo2 aria-hidden />
        Restaurar
      </Button>
    )
    return readOnly ? <ReadOnlyHint>{restore}</ReadOnlyHint> : restore
  }

  return (
    <>
      <DialogMenu
        className="min-w-56"
        trigger={
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-foreground data-[state=open]:bg-accent"
            aria-label={`Ações de ${subscription.name}`}
            disabled={mutation.pending}
          >
            <MoreHorizontal aria-hidden />
          </Button>
        }
      >
        {section === "other" && (
          <DropdownMenuItem
            disabled={readOnly}
            onSelect={() =>
              save({ key: subscription.key, kind: "SUBSCRIPTION" }, `“${subscription.name}” agora é assinatura`)
            }
          >
            <Repeat aria-hidden />
            É assinatura
          </DropdownMenuItem>
        )}
        <DialogMenuItem disabled={readOnly} onOpen={(focus) => setRename(opened(focus))}>
          <Pencil aria-hidden />
          Renomear
        </DialogMenuItem>
        {/* Só a que ainda cobra: planejar uma cancelada pesaria em todo mês da projeção. */}
        {section === "active" && !subscription.plannedCommitmentId && (
          <DialogMenuItem disabled={readOnly} onOpen={(focus) => setPlanning(opened(focus))}>
            <CalendarPlus aria-hidden />
            Adicionar ao planejamento
          </DialogMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={readOnly}
          onSelect={() => save({ key: subscription.key, kind: "IGNORED" }, `“${subscription.name}” foi para as ocultas`)}
        >
          <EyeOff aria-hidden />
          {section === "other" ? "Ocultar" : "Não é assinatura"}
        </DropdownMenuItem>
        {readOnly && <MenuReadOnlyNote />}
      </DialogMenu>

      {rename && (
        <RenameDialog
          key={rename.key}
          open={rename.open}
          onOpenChange={(next) => setRename(withOpen(next))}
          subscription={subscription}
          onCloseAutoFocus={(event) => restoreFocus(event, rename.returnFocus)}
        />
      )}
      {planning && (
        <CommitmentDialog
          key={planning.key}
          open={planning.open}
          onOpenChange={(next) => setPlanning(withOpen(next))}
          commitment={null}
          draft={commitmentDraft(subscription, today)}
          subscriptionKey={subscription.key}
          categories={categories}
          today={today}
          onDelete={() => undefined}
          onCloseAutoFocus={(event) => restoreFocus(event, planning.returnFocus)}
        />
      )}
    </>
  )
}

function RenameDialog({
  open,
  onOpenChange,
  subscription,
  onCloseAutoFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  subscription: Subscription
  onCloseAutoFocus: (event: Event) => void
}) {
  const mutation = useMutation()
  const [name, setName] = useState(subscription.customName ?? subscription.name)
  const [fieldError, setFieldError] = useState<string | undefined>()

  function submit() {
    const value = name.trim()
    if (value.length > NAME_MAX) {
      setFieldError(`Use até ${NAME_MAX} caracteres.`)
      return
    }
    mutation.run(() => apiRequest(PATH, { method: "PUT", body: { key: subscription.key, name: value || null } }), {
      action: "salvar",
      where: WHERE,
      onSuccess: () => {
        onOpenChange(false)
        toast.success(value ? `Renomeada para “${value}”` : "Voltou ao nome do extrato")
      },
    })
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Renomear assinatura"
      description={`No extrato aparece como “${subscription.detectedName}”.`}
      pending={mutation.pending}
      error={mutation.error}
      submitLabel="Salvar"
      onSubmit={submit}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <FormField
        id="subscription-name"
        label="Nome"
        description="Deixe em branco para voltar ao nome do extrato."
        error={fieldError}
      >
        {(control) => (
          <Input
            {...control}
            value={name}
            maxLength={NAME_MAX + 20}
            autoComplete="off"
            onChange={(event) => {
              setName(event.target.value)
              setFieldError(undefined)
            }}
          />
        )}
      </FormField>
    </FormDialog>
  )
}
