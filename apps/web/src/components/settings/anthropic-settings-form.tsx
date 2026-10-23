"use client"

import { AlertCircle, CheckCircle2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition, type FormEvent } from "react"
import { DeleteDialog } from "@/components/planning/delete-dialog"
import { FormField } from "@/components/planning/form-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { apiRequest } from "@/lib/api/client"
import type { AnthropicSettings, AnthropicSettingsInput } from "@/lib/api/settings"
import { READ_ONLY_HINT } from "@/lib/data/mode"
import { saveErrorMessage } from "./save-error"

const PATH = "/api/settings/anthropic"

export function AnthropicSettingsForm({ settings, readOnly }: { settings: AnthropicSettings; readOnly: boolean }) {
  const router = useRouter()
  const [apiKey, setApiKey] = useState("")
  const [model, setModel] = useState(settings.model)
  const [keyError, setKeyError] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [pending, startTransition] = useTransition()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const key = apiKey.trim()
    if (!key && !settings.configured) {
      setKeyError("Informe a chave da Anthropic.")
      return
    }
    const input: AnthropicSettingsInput = key ? { apiKey: key, model } : { model }
    setError(null)
    startTransition(async () => {
      try {
        await apiRequest(PATH, { method: "PUT", body: input })
      } catch (cause) {
        setError(saveErrorMessage(cause))
        return
      }
      startTransition(() => {
        setApiKey("")
        setSaved(true)
        router.refresh()
      })
    })
  }

  return (
    <>
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
            <AlertTitle>Chave salva</AlertTitle>
            <AlertDescription>“Gerar análise” e “Pergunte ao Claude” já usam esta configuração.</AlertDescription>
          </Alert>
        )}

        <fieldset disabled={readOnly || pending} className="contents">
          <FieldGroup className="gap-5">
            <FormField
              id="anthropic-apiKey"
              label="Chave da API"
              description={
                settings.configured
                  ? "Já existe uma salva, guardada cifrada. Deixe em branco para manter."
                  : "Fica guardada cifrada no banco e nunca volta para o navegador."
              }
              error={keyError}
            >
              {(control) => (
                <Input
                  {...control}
                  type="password"
                  autoComplete="new-password"
                  spellCheck={false}
                  placeholder={settings.configured ? "•••••••• (salva)" : "sk-ant-…"}
                  className="font-mono text-sm"
                  value={apiKey}
                  onChange={(event) => {
                    setApiKey(event.target.value)
                    setSaved(false)
                    setKeyError(undefined)
                  }}
                />
              )}
            </FormField>

            <FormField id="anthropic-model" label="Modelo" description="Preço por milhão de tokens de entrada / saída.">
              {(control) => (
                <Select
                  value={model}
                  onValueChange={(value) => {
                    setModel(value)
                    setSaved(false)
                  }}
                >
                  <SelectTrigger {...control} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {settings.models.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          </FieldGroup>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={readOnly || pending}>
            {pending && <Spinner aria-hidden />}
            {pending ? "Validando na Anthropic…" : "Salvar"}
          </Button>
          {settings.configured && !readOnly && (
            <Button type="button" variant="outline" disabled={pending} onClick={() => setRemoving(true)}>
              Remover chave
            </Button>
          )}
          {readOnly && <span className="text-muted-foreground text-sm">{READ_ONLY_HINT}</span>}
        </div>
      </form>

      <DeleteDialog
        open={removing}
        onOpenChange={setRemoving}
        path={PATH}
        copy={{
          title: "Remover a chave da Anthropic?",
          description:
            "“Gerar análise” e “Pergunte ao Claude” ficam desligados até você cadastrar uma chave de novo. A análise pelo seu Claude via MCP continua funcionando.",
          confirm: "Remover chave",
          success: "Chave da Anthropic removida",
        }}
        onDeleted={() => setSaved(false)}
      />
    </>
  )
}
