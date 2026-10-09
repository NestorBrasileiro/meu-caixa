"use client"

import { AlertCircle, Trash2, X } from "lucide-react"
import { useRef, type ComponentProps, type ReactNode } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { normalizeMoneyInput } from "./forms"

/**
 * Diálogo de formulário do planejamento. No celular vira uma folha presa
 * embaixo, na largura toda; o corpo rola e os botões ficam sempre visíveis.
 */
export const SHEET_CONTENT_CLASS = cn(
  "flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg",
  "max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:max-h-[calc(100dvh-1rem)] max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0",
  "max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:data-[state=closed]:slide-out-to-bottom-8 max-sm:data-[state=open]:slide-in-from-bottom-8",
)

/** Rodapé fixo: no celular os botões dividem a largura; respeita a área segura do iPhone. */
export const SHEET_FOOTER_CLASS =
  "shrink-0 flex-row items-center border-t px-5 py-3 max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6"

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  pending,
  error,
  errorTitle = "Não foi possível salvar",
  submitLabel,
  onSubmit,
  onDelete,
  deleteLabel,
  onCloseAutoFocus,
  focusFirstField = true,
  className,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  pending: boolean
  /** Erro do servidor: o diálogo continua aberto com o aviso no topo do corpo. */
  error: string | null
  errorTitle?: string
  submitLabel: string
  onSubmit: () => void
  /** Só na edição: abre a confirmação de exclusão por cima. */
  onDelete?: (trigger: HTMLElement) => void
  /** Rótulo acessível do botão de excluir (o nome do item). */
  deleteLabel?: string
  onCloseAutoFocus?: ComponentProps<typeof DialogContent>["onCloseAutoFocus"]
  /** Foca o primeiro campo ao abrir (formulário novo); senão, o próprio diálogo. */
  focusFirstField?: boolean
  className?: string
  children: ReactNode
}) {
  const formRef = useRef<HTMLFormElement>(null)
  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <DialogContent
        showCloseButton={false}
        className={cn(SHEET_CONTENT_CLASS, className)}
        // Novo: o foco começa no primeiro campo (o padrão do Radix pararia no botão de fechar).
        // Edição: no próprio diálogo, sem selecionar o nome nem abrir o teclado do celular à toa.
        onOpenAutoFocus={(event) => {
          const target = focusFirstField
            ? formRef.current?.querySelector<HTMLElement>("fieldset input, fieldset textarea, fieldset button")
            : (event.currentTarget as HTMLElement | null)
          if (!target) return
          event.preventDefault()
          target.focus()
        }}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <form
          ref={formRef}
          noValidate
          aria-busy={pending}
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            if (!pending) onSubmit()
          }}
        >
          <DialogHeader className="shrink-0 gap-1.5 border-b px-5 pt-4 pb-3.5 text-left sm:px-6">
            <div className="flex items-start justify-between gap-3">
              <DialogTitle className="pt-1 leading-snug">{title}</DialogTitle>
              <DialogClose asChild>
                <Button type="button" variant="ghost" size="icon-sm" className="-mr-2 shrink-0" disabled={pending}>
                  <X aria-hidden />
                  <span className="sr-only">Fechar</span>
                </Button>
              </DialogClose>
            </div>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
            {error && (
              <Alert variant="destructive" className="mb-5">
                <AlertCircle aria-hidden />
                <AlertTitle>{errorTitle}</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <fieldset disabled={pending} className="min-w-0">
              {children}
            </fieldset>
          </div>

          <DialogFooter className={SHEET_FOOTER_CLASS}>
            {onDelete && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 mr-auto sm:w-auto sm:px-3"
                disabled={pending}
                onClick={(event) => onDelete(event.currentTarget)}
              >
                <Trash2 aria-hidden />
                <span className="max-sm:sr-only">Excluir</span>
                {deleteLabel && <span className="sr-only"> {deleteLabel}</span>}
              </Button>
            )}
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending} className="max-sm:flex-1">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending} className="max-sm:flex-1">
              {pending && <Spinner aria-hidden />}
              {pending ? "Salvando…" : submitLabel}
            </Button>
          </DialogFooter>
          {/* Anuncia o envio para leitores de tela (o botão só troca o texto). */}
          <span role="status" aria-live="polite" className="sr-only">
            {pending ? "Salvando…" : ""}
          </span>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export interface ControlProps {
  id: string
  "aria-invalid": true | undefined
  "aria-describedby": string | undefined
}

/** Rótulo + controle + descrição + erro, com os ids ligados (aria-invalid / aria-describedby). */
export function FormField({
  id,
  label,
  optional,
  description,
  error,
  className,
  children,
}: {
  id: string
  label: ReactNode
  optional?: boolean
  description?: ReactNode
  error?: string
  className?: string
  children: (control: ControlProps) => ReactNode
}) {
  const descriptionId = description ? `${id}-description` : null
  const errorId = error ? `${id}-error` : null
  return (
    <Field data-invalid={error ? true : undefined} className={cn("gap-2", className)}>
      <FieldLabel htmlFor={id}>
        {label}
        {optional && <span className="text-muted-foreground font-normal">(opcional)</span>}
      </FieldLabel>
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": [descriptionId, errorId].filter(Boolean).join(" ") || undefined,
      })}
      {description && (
        <FieldDescription id={descriptionId!} className="text-xs">
          {description}
        </FieldDescription>
      )}
      <FieldError id={errorId ?? undefined} className="text-xs">
        {error}
      </FieldError>
    </Field>
  )
}

/** Valor em reais com prefixo "R$": aceita "2.300,00" ou "2300" e reescreve no formato canônico ao sair. */
export function MoneyInput({
  value,
  onValueChange,
  placeholder = "0,00",
  ...control
}: ControlProps & { value: string; onValueChange: (value: string) => void; placeholder?: string }) {
  return (
    <InputGroup>
      <InputGroupAddon>
        <InputGroupText>R$</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        {...control}
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        className="tabular-nums"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onBlur={(event) => onValueChange(normalizeMoneyInput(event.target.value))}
      />
    </InputGroup>
  )
}

/** Leva o foco ao primeiro campo com erro (na ordem do formulário). */
export function focusFirstError<K extends string>(prefix: string, order: K[], errors: Partial<Record<K, string>>) {
  const first = order.find((field) => errors[field])
  if (!first) return
  const element = document.getElementById(`${prefix}-${first}`)
  element?.focus()
}
