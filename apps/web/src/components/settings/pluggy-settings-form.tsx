"use client"

import { AlertCircle, CheckCircle2, RefreshCw } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition, type FormEvent } from "react"
import { FormField } from "@/components/planning/form-dialog"
import { startSync } from "@/components/shell/sync-tracker"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { apiRequest } from "@/lib/api/client"
import type { PluggySettings } from "@/lib/api/settings"
import { READ_ONLY_HINT } from "@/lib/data/mode"
import { validatePluggyForm, type PluggyField, type PluggyForm } from "./pluggy-form"
import { saveErrorMessage } from "./save-error"

export function PluggySettingsForm({ settings, readOnly }: { settings: PluggySettings; readOnly: boolean }) {
  const router = useRouter()
  const [form, setForm] = useState<PluggyForm>({
    clientId: settings.clientId ?? "",
    clientSecret: "",
    itemIds: settings.itemIds.join("\n"),
  })
  const [errors, setErrors] = useState<Partial<Record<PluggyField, string>>>({})
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  function update(field: PluggyField, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
    setSaved(false)
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = validatePluggyForm(form, settings.configured)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await apiRequest("/api/settings/pluggy", { method: "PUT", body: result.input })
      } catch (cause) {
        setError(saveErrorMessage(cause))
        return
      }
      startTransition(() => {
        setForm((current) => ({ ...current, clientSecret: "" }))
        setSaved(true)
        router.refresh()
      })
    })
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {error && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden />
          <AlertTitle>Não foi possível salvar</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {saved && (
        <Alert>
          <CheckCircle2 aria-hidden />
          <AlertTitle>Configuração salva</AlertTitle>
          <AlertDescription>
            <p>A próxima sincronização já usa estas credenciais.</p>
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void startSync()}>
              <RefreshCw aria-hidden />
              Sincronizar agora
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <fieldset disabled={readOnly || pending} className="contents">
        <FieldGroup className="gap-5">
          <FormField id="pluggy-clientId" label="Client ID" error={errors.clientId}>
            {(control) => (
              <Input
                {...control}
                autoComplete="off"
                spellCheck={false}
                className="font-mono text-sm"
                value={form.clientId}
                onChange={(event) => update("clientId", event.target.value)}
              />
            )}
          </FormField>

          <FormField
            id="pluggy-clientSecret"
            label="Client Secret"
            description={
              settings.configured
                ? "Já existe um salvo, guardado cifrado. Deixe em branco para manter."
                : "Fica guardado cifrado no banco e nunca volta para o navegador."
            }
            error={errors.clientSecret}
          >
            {(control) => (
              <Input
                {...control}
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                placeholder={settings.configured ? "•••••••• (salvo)" : undefined}
                className="font-mono text-sm"
                value={form.clientSecret}
                onChange={(event) => update("clientSecret", event.target.value)}
              />
            )}
          </FormField>

          <FormField
            id="pluggy-itemIds"
            label="Item IDs"
            description="Um por banco conectado: um por linha (ou separados por vírgula)."
            error={errors.itemIds}
          >
            {(control) => (
              <Textarea
                {...control}
                rows={3}
                spellCheck={false}
                className="font-mono text-sm"
                value={form.itemIds}
                onChange={(event) => update("itemIds", event.target.value)}
              />
            )}
          </FormField>
        </FieldGroup>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={readOnly || pending}>
          {pending && <Spinner aria-hidden />}
          {pending ? "Validando na Pluggy…" : "Salvar"}
        </Button>
        {readOnly && <span className="text-muted-foreground text-sm">{READ_ONLY_HINT}</span>}
      </div>
    </form>
  )
}
