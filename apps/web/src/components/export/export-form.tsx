"use client"

import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Download,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  FileText,
  type LucideIcon,
} from "lucide-react"
import { useId, useRef, useState, type FormEvent } from "react"
import { toast } from "sonner"
import { FormField } from "@/components/planning/form-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import type { ExportFormatId, ExportOptions } from "@/lib/api/export"
import { EXPORT_READ_ONLY_HINT } from "@/lib/data/mode"
import { cn } from "@/lib/utils"
import { copyFromPromise, ExportError, fetchExportFile, fetchExportText, saveBlob } from "./download"
import {
  DEFAULT_PRESET,
  hasPeriodErrors,
  PERIOD_PRESETS,
  periodSummary,
  presetPeriod,
  validatePeriod,
  type Period,
  type PeriodPresetId,
} from "./period"
import { buildExportPath, fallbackFilename } from "./request"

const FORMAT_ICON: Record<ExportFormatId, LucideIcon> = {
  xlsx: FileSpreadsheet,
  pdf: FileText,
  csv: FileArchive,
  md: FileCode,
}

const NO_SECTIONS = "Escolha ao menos uma seção."

type Pending = "download" | "copy" | null

/** Ext. como aparece no cartão: ".xlsx", ".zip". */
const dotted = (extension: string) => `.${extension.replace(/^\.+/, "")}`

export function ExportForm({ options, readOnly }: { options: ExportOptions; readOnly: boolean }) {
  const ids = useId()
  const [format, setFormat] = useState<ExportFormatId>(options.formats[0]?.id ?? "xlsx")
  const [preset, setPreset] = useState<PeriodPresetId>(DEFAULT_PRESET)
  const [custom, setCustom] = useState<Period>(options.defaultPeriod)
  const [sections, setSections] = useState<Set<string>>(() => new Set(options.sections.map((section) => section.id)))
  const [pending, setPending] = useState<Pending>(null)
  const [error, setError] = useState<string | null>(null)
  const fromRef = useRef<HTMLInputElement>(null)
  const toRef = useRef<HTMLInputElement>(null)
  const sectionsRef = useRef<HTMLFieldSetElement>(null)

  const period = presetPeriod(preset, options.defaultPeriod) ?? custom
  const periodErrors = preset === "custom" ? validatePeriod(custom, options.maxMonths) : {}
  const sectionsError = sections.size === 0 ? NO_SECTIONS : undefined
  const selectedFormat = options.formats.find((option) => option.id === format) ?? { id: format }
  const busy = pending !== null

  function choosePreset(next: PeriodPresetId) {
    // Ao abrir o "Personalizado", as datas começam no período que estava escolhido.
    if (next === "custom" && preset !== "custom") setCustom(period)
    setPreset(next)
    setError(null)
  }

  function toggleSection(id: string, checked: boolean) {
    setSections((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
    setError(null)
  }

  /** O caminho do pedido, ou null (com o foco no primeiro campo com erro) se algo estiver errado. */
  function validPath(): string | null {
    if (periodErrors.from) fromRef.current?.focus()
    else if (periodErrors.to) toRef.current?.focus()
    else if (sectionsError) sectionsRef.current?.querySelector<HTMLElement>("button[role=checkbox]")?.focus()
    if (hasPeriodErrors(periodErrors) || sectionsError) return null
    return buildExportPath({ format, period, sections: [...sections] }, options.sections)
  }

  async function run(kind: Exclude<Pending, null>, action: () => Promise<void>) {
    setError(null)
    setPending(kind)
    try {
      await action()
    } catch (cause) {
      // 401: a página já está indo para o login.
      if (cause instanceof ExportError && cause.status === 401) return
      setError(cause instanceof ExportError ? cause.message : "Algo deu errado ao gerar o arquivo. Tente de novo.")
    } finally {
      setPending(null)
    }
  }

  function download(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (readOnly || busy) return
    const path = validPath()
    if (!path) return
    void run("download", async () => {
      const { blob, filename } = await fetchExportFile(path, fallbackFilename(selectedFormat))
      saveBlob(blob, filename)
      toast.success("Arquivo pronto", { description: `${filename} foi baixado.` })
    })
  }

  function copy() {
    if (readOnly || busy) return
    const path = validPath()
    if (!path) return
    // A busca começa já no clique: no Safari a cópia só vale dentro dele.
    const text = fetchExportText(path)
    void run("copy", async () => {
      await copyFromPromise(text)
      toast.success("Copiado para a área de transferência", {
        description: "Cole numa conversa com o ChatGPT, o Claude.ai ou o Gemini.",
      })
    })
  }

  const status =
    pending === "download" ? "Gerando o arquivo…" : pending === "copy" ? "Gerando o texto para copiar…" : ""

  return (
    <form onSubmit={download} noValidate aria-busy={busy} className="space-y-6">
      <fieldset disabled={busy} className="min-w-0 space-y-3">
        <legend className="mb-3 text-sm font-medium">Formato</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {options.formats.map((option) => {
            const Icon = FORMAT_ICON[option.id] ?? FileText
            const titleId = `${ids}-format-${option.id}-title`
            const descriptionId = `${ids}-format-${option.id}-description`
            return (
              <label
                key={option.id}
                className={cn(
                  "group relative flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                  "hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary/[0.04]",
                  "has-[:focus-visible]:border-ring has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-[3px]",
                  "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
                )}
              >
                <input
                  type="radio"
                  name="format"
                  value={option.id}
                  checked={format === option.id}
                  onChange={() => {
                    setFormat(option.id)
                    setError(null)
                  }}
                  aria-labelledby={titleId}
                  aria-describedby={descriptionId}
                  className="sr-only"
                />
                <span className="bg-muted text-muted-foreground group-has-[:checked]:bg-primary group-has-[:checked]:text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-md transition-colors">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1 space-y-0.5 pr-5">
                  <span id={titleId} className="flex flex-wrap items-baseline gap-x-1.5 text-sm font-medium">
                    {option.label}
                    <span className="text-muted-foreground font-mono text-xs font-normal">
                      {dotted(option.extension)}
                    </span>
                  </span>
                  <span id={descriptionId} className="text-muted-foreground block text-xs leading-snug">
                    {option.description}
                  </span>
                </span>
                {/* O escolhido tem o ícone preenchido e o check: o estado não depende só da cor da borda. */}
                <CheckCircle2
                  className="text-primary absolute top-3 right-3 size-4 opacity-0 transition-opacity group-has-[:checked]:opacity-100"
                  aria-hidden
                />
              </label>
            )
          })}
        </div>
      </fieldset>

      <Separator />

      <fieldset disabled={busy} className="min-w-0 space-y-3">
        <legend className="mb-3 text-sm font-medium">Período</legend>
        <div className="flex flex-wrap gap-2">
          {PERIOD_PRESETS.map((option) => (
            <label
              key={option.id}
              className={cn(
                "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm transition-colors",
                "hover:bg-muted/50 has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground",
                "has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-[3px]",
                "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
              )}
            >
              <input
                type="radio"
                name="period"
                value={option.id}
                checked={preset === option.id}
                onChange={() => choosePreset(option.id)}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>

        {preset === "custom" && (
          <div className="grid gap-3 pt-1 sm:grid-cols-2 sm:gap-4">
            <FormField id={`${ids}-from`} label="De" error={periodErrors.from}>
              {(control) => (
                <Input
                  {...control}
                  ref={fromRef}
                  type="date"
                  value={custom.from}
                  max={custom.to || undefined}
                  onChange={(event) => {
                    setCustom((current) => ({ ...current, from: event.target.value }))
                    setError(null)
                  }}
                />
              )}
            </FormField>
            <FormField id={`${ids}-to`} label="Até" error={periodErrors.to}>
              {(control) => (
                <Input
                  {...control}
                  ref={toRef}
                  type="date"
                  value={custom.to}
                  min={custom.from || undefined}
                  onChange={(event) => {
                    setCustom((current) => ({ ...current, to: event.target.value }))
                    setError(null)
                  }}
                />
              )}
            </FormField>
          </div>
        )}

        {/* Com erro nas datas, o aviso do campo já diz o que fazer. */}
        {!hasPeriodErrors(periodErrors) && (
          <p className="text-muted-foreground text-xs tabular-nums">{periodSummary(period)}</p>
        )}
      </fieldset>

      <Separator />

      <fieldset
        ref={sectionsRef}
        disabled={busy}
        aria-describedby={sectionsError ? `${ids}-sections-error` : undefined}
        className="min-w-0 space-y-3"
      >
        <legend className="sr-only">Seções</legend>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="text-sm font-medium" aria-hidden>
            Seções{" "}
            <span className="text-muted-foreground font-normal tabular-nums">
              · {sections.size} de {options.sections.length}
            </span>
          </p>
          <div className="-ml-2.5 flex gap-1 sm:-mr-2.5 sm:ml-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={sections.size === options.sections.length}
              onClick={() => {
                setSections(new Set(options.sections.map((section) => section.id)))
                setError(null)
              }}
            >
              Selecionar todas
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={sections.size === 0}
              onClick={() => setSections(new Set())}
            >
              Limpar
            </Button>
          </div>
        </div>

        <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {options.sections.map((section) => {
            const id = `${ids}-section-${section.id}`
            return (
              <li key={section.id} className="flex items-start gap-3">
                <Checkbox
                  id={id}
                  checked={sections.has(section.id)}
                  onCheckedChange={(checked) => toggleSection(section.id, checked === true)}
                  aria-describedby={`${id}-description`}
                  aria-invalid={sectionsError ? true : undefined}
                  className="mt-0.5"
                />
                <div className="grid min-w-0 gap-0.5">
                  <Label htmlFor={id} className="cursor-pointer leading-snug font-normal">
                    {section.label}
                  </Label>
                  <p id={`${id}-description`} className="text-muted-foreground text-xs leading-snug">
                    {section.description}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>

        {sectionsError && (
          <p id={`${ids}-sections-error`} className="text-destructive text-xs" role="alert">
            {sectionsError}
          </p>
        )}
      </fieldset>

      <Separator />

      <div className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden />
            <AlertTitle>Não foi possível gerar o arquivo</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Button type="submit" disabled={readOnly || busy}>
            {pending === "download" ? <Spinner aria-hidden /> : <Download aria-hidden />}
            {pending === "download" ? "Gerando o arquivo…" : "Baixar arquivo"}
          </Button>
          {format === "md" && (
            <Button type="button" variant="outline" disabled={readOnly || busy} onClick={copy}>
              {pending === "copy" ? <Spinner aria-hidden /> : <Copy aria-hidden />}
              {pending === "copy" ? "Gerando o texto…" : "Copiar para a área de transferência"}
            </Button>
          )}
          {readOnly && <span className="text-muted-foreground text-sm">{EXPORT_READ_ONLY_HINT}</span>}
        </div>
      </div>

      {/* Anuncia o andamento para leitores de tela (os botões só trocam o texto). */}
      <span role="status" aria-live="polite" className="sr-only">
        {status}
      </span>
    </form>
  )
}
