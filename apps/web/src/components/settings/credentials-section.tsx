"use client"

import { ChevronDown, CircleHelp, Eye, EyeOff, KeyRound, Lock, Trash2 } from "lucide-react"
import { useId, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { apiRequest } from "@/lib/api/client"
import { cn } from "@/lib/utils"
import { PLUGGY_DASHBOARD_URL, validateCredentials, type CredentialsErrors, type OpenFinanceView } from "./open-finance"
import { DisabledHint, ErrorAlert, ExternalAnchor, Note, TONE_ICON, useSettingsAction } from "./parts"

/** Ajuda recolhível ("Onde encontro?"), usada nas duas seções. */
export function HelpToggle({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Collapsible className="group/help">
      <CollapsibleTrigger asChild>
        <Button type="button" variant="link" size="sm" className="text-muted-foreground hover:text-foreground h-auto gap-1.5 px-0 py-0.5 has-[>svg]:px-0">
          <CircleHelp aria-hidden />
          {label}
          <ChevronDown className="transition-transform group-data-[state=open]/help:rotate-180" aria-hidden />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="bg-muted/50 mt-2 rounded-md border px-4 py-3">{children}</CollapsibleContent>
    </Collapsible>
  )
}

/**
 * Credenciais da Pluggy: o status (nunca o secret, que não volta da API), o formulário de salvar/trocar
 * e a remoção. "Testar e salvar" só grava depois que a API confirmou com a Pluggy.
 */
export function CredentialsPanel({ view }: { view: OpenFinanceView }) {
  const { configured, fromEnv, status, editable, removable, hint } = view.credentials
  const [editing, setEditing] = useState(false)
  const statusRef = useRef<HTMLParagraphElement>(null)
  const { icon: Icon, className: iconClass } = TONE_ICON[status.tone]

  // Sem credenciais, o formulário já aparece aberto; com credenciais, só em "Trocar".
  const showForm = editable && (!configured || editing)

  function focusStatus() {
    // O formulário (ou o botão) vai sumir: o foco passa antes para o status, que sempre está lá.
    statusRef.current?.focus()
  }

  return (
    <>
      <div className="space-y-1">
        <p ref={statusRef} tabIndex={-1} className="flex items-start gap-2 text-sm font-medium outline-none">
          <Icon className={cn("mt-0.5 size-4 shrink-0", iconClass)} aria-hidden />
          <span className="min-w-0 break-words">{status.label}</span>
        </p>
        {status.detail && <p className="text-muted-foreground pl-6 text-xs">{status.detail}</p>}
      </div>

      {/* No modo mock, a dica já está no topo do cartão e nos botões desabilitados. */}
      {hint && !view.readOnly && <Note icon={Lock}>{hint}</Note>}

      {showForm ? (
        <CredentialsForm
          replacing={configured}
          onCancel={
            configured
              ? () => {
                  setEditing(false)
                  focusStatus()
                }
              : undefined
          }
          onSaved={() => {
            setEditing(false)
            focusStatus()
          }}
        />
      ) : (
        configured &&
        !fromEnv && (
          <div className="flex flex-wrap gap-2">
            <DisabledHint hint={view.readOnly ? hint : null}>
              <Button variant="outline" size="sm" disabled={!editable} onClick={() => setEditing(true)}>
                <KeyRound aria-hidden />
                Trocar credenciais
              </Button>
            </DisabledHint>
            <RemoveCredentials disabled={!removable} hint={view.readOnly ? hint : null} onRemoved={focusStatus} />
          </div>
        )
      )}

      <HelpToggle label="Onde encontro?">
        <ol className="text-muted-foreground list-decimal space-y-1.5 pl-4 text-sm text-pretty marker:text-xs">
          <li>
            Entre no <ExternalAnchor href={PLUGGY_DASHBOARD_URL}>dashboard da Pluggy</ExternalAnchor> com a mesma conta
            do Meu Pluggy.
          </li>
          <li>Abra a sua aplicação (ou crie uma, se ainda não tiver).</li>
          <li>
            Copie o <span className="text-foreground font-medium">Client ID</span> e o{" "}
            <span className="text-foreground font-medium">Client Secret</span> e cole aqui.
          </li>
        </ol>
      </HelpToggle>
    </>
  )
}

function CredentialsForm({
  replacing,
  onCancel,
  onSaved,
}: {
  /** Já há credenciais: estas substituem as atuais. */
  replacing: boolean
  onCancel?: () => void
  onSaved: () => void
}) {
  const id = useId()
  const [clientId, setClientId] = useState("")
  const [clientSecret, setClientSecret] = useState("")
  const [showSecret, setShowSecret] = useState(false)
  const [errors, setErrors] = useState<CredentialsErrors>({})
  const mutation = useSettingsAction("credentials")

  function submit() {
    const result = validateCredentials({ clientId, clientSecret })
    if (!result.ok) {
      setErrors(result.errors)
      mutation.setError(null)
      // Foco no primeiro campo com problema (os dois já existem; só ganham o erro na próxima renderização).
      document.getElementById(result.errors.clientId ? `${id}-client-id` : `${id}-client-secret`)?.focus()
      return
    }
    setErrors({})
    mutation.run(
      () => apiRequest("/api/settings/open-finance/credentials", { method: "PUT", body: result.value }),
      () => {
        setClientId("")
        setClientSecret("")
        setShowSecret(false)
        toast.success(replacing ? "Credenciais trocadas" : "Credenciais salvas", {
          description: "A Pluggy confirmou o acesso. Elas ficam só no servidor.",
        })
        onSaved()
      },
    )
  }

  const clientIdError = errors.clientId
  const secretError = errors.clientSecret

  return (
    <form
      noValidate
      autoComplete="off"
      aria-busy={mutation.pending}
      aria-label={replacing ? "Trocar credenciais da Pluggy" : "Credenciais da Pluggy"}
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!mutation.pending) submit()
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && onCancel && !mutation.pending) onCancel()
      }}
    >
      <fieldset disabled={mutation.pending} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <Field data-invalid={clientIdError ? true : undefined} className="gap-2">
          <FieldLabel htmlFor={`${id}-client-id`}>Client ID</FieldLabel>
          <Input
            id={`${id}-client-id`}
            name="pluggy-client-id"
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            placeholder="1a2b3c4d-…"
            className="font-mono text-[0.8125rem] md:text-[0.8125rem]"
            aria-invalid={clientIdError ? true : undefined}
            aria-describedby={clientIdError ? `${id}-client-id-error` : undefined}
          />
          {clientIdError && (
            <FieldError id={`${id}-client-id-error`} className="text-xs">
              {clientIdError}
            </FieldError>
          )}
        </Field>
        <Field data-invalid={secretError ? true : undefined} className="gap-2">
          <FieldLabel htmlFor={`${id}-client-secret`}>Client Secret</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id={`${id}-client-secret`}
              name="pluggy-client-secret"
              type={showSecret ? "text" : "password"}
              value={clientSecret}
              onChange={(event) => setClientSecret(event.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              className="font-mono text-[0.8125rem] md:text-[0.8125rem]"
              aria-invalid={secretError ? true : undefined}
              aria-describedby={secretError ? `${id}-client-secret-error` : undefined}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                aria-label={showSecret ? "Ocultar o Client Secret" : "Mostrar o Client Secret"}
                aria-pressed={showSecret}
                onClick={() => setShowSecret((shown) => !shown)}
              >
                {showSecret ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          {secretError && (
            <FieldError id={`${id}-client-secret-error`} className="text-xs">
              {secretError}
            </FieldError>
          )}
        </Field>
      </fieldset>

      {mutation.error && <ErrorAlert error={mutation.error} />}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={mutation.pending}>
          {mutation.pending && <Spinner aria-hidden />}
          {mutation.pending ? "Testando com a Pluggy…" : "Testar e salvar"}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" disabled={mutation.pending} onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {mutation.pending ? "Testando as credenciais com a Pluggy…" : ""}
      </span>
    </form>
  )
}

function RemoveCredentials({
  disabled,
  hint,
  onRemoved,
}: {
  disabled: boolean
  hint: string | null
  onRemoved: () => void
}) {
  const [open, setOpen] = useState(false)
  const removed = useRef(false)
  const mutation = useSettingsAction("removeCredentials")

  function confirm() {
    mutation.run(
      () => apiRequest("/api/settings/open-finance/credentials", { method: "DELETE" }),
      () => {
        removed.current = true
        setOpen(false)
        toast.success("Credenciais removidas", {
          description: "As sincronizações dos seus bancos param até você salvar credenciais novas.",
        })
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
          size="sm"
          disabled={disabled}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => setOpen(true)}
        >
          <Trash2 aria-hidden />
          Remover credenciais
        </Button>
      </DisabledHint>
      <AlertDialogContent
        aria-busy={mutation.pending}
        onCloseAutoFocus={(event) => {
          // Removidas: o botão some, o foco vai para o status. Cancelado: volta ao botão (padrão).
          if (!removed.current) return
          event.preventDefault()
          onRemoved()
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="leading-snug">Remover as credenciais da Pluggy?</AlertDialogTitle>
          <AlertDialogDescription>
            O Meu Caixa deixa de sincronizar seus bancos até você salvar credenciais novas. O que já foi
            sincronizado continua aqui.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {mutation.error && <ErrorAlert error={mutation.error} />}
        <AlertDialogFooter className="max-sm:grid max-sm:grid-cols-2">
          <AlertDialogCancel disabled={mutation.pending}>Cancelar</AlertDialogCancel>
          <Button variant="destructive" onClick={confirm} disabled={mutation.pending}>
            {mutation.pending && <Spinner aria-hidden />}
            {mutation.pending ? "Removendo…" : "Remover credenciais"}
          </Button>
        </AlertDialogFooter>
        <span role="status" aria-live="polite" className="sr-only">
          {mutation.pending ? "Removendo as credenciais…" : ""}
        </span>
      </AlertDialogContent>
    </AlertDialog>
  )
}
