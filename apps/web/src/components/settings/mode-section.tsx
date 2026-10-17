"use client"

import { CheckCircle2, FlaskConical, Landmark, Lock, TriangleAlert, type LucideIcon } from "lucide-react"
import { useId, useRef, useState } from "react"
import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui"
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
import { Spinner } from "@/components/ui/spinner"
import { apiRequest } from "@/lib/api/client"
import type { OpenFinanceMode, OpenFinanceSettings } from "@/lib/api/settings"
import { cn } from "@/lib/utils"
import { MODE_LABEL, modeSuccessToast, modeSwitchCopy, type OpenFinanceView } from "./open-finance"
import { ErrorAlert, Note, useSettingsAction, useSyncStartedToast } from "./parts"

const OPTIONS: { value: OpenFinanceMode; icon: LucideIcon; description: string }[] = [
  { value: "pluggy", icon: Landmark, description: "Suas contas reais, pelo Open Finance." },
  { value: "fake", icon: FlaskConical, description: "Bancos fictícios, para conhecer o app." },
]

/**
 * Fonte dos dados: duas opções em grupo de rádio (setas movem, Espaço/Enter escolhe). Trocar de uma
 * fonte para a outra apaga os dados sincronizados da anterior, então pede confirmação; sem fonte
 * escolhida ainda, não há o que apagar e a escolha vale na hora.
 */
export function ModeChoice({ view }: { view: OpenFinanceView }) {
  const { value, locked, hint, missing } = view.mode
  const disabled = locked || view.readOnly
  // No modo mock, a dica já está no topo do cartão: aqui só o motivo do servidor (variável de ambiente).
  const note = view.readOnly ? null : hint
  const groupId = useId()
  const groupRef = useRef<HTMLDivElement>(null)
  const [target, setTarget] = useState<OpenFinanceMode | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const mutation = useSettingsAction("mode")
  const syncToast = useSyncStartedToast()
  const copy = target ? modeSwitchCopy(value, target) : null

  function save(next: OpenFinanceMode) {
    mutation.run(
      () => apiRequest<OpenFinanceSettings>("/api/settings/open-finance/mode", { method: "PUT", body: { mode: next } }),
      () => {
        setDialogOpen(false)
        const message = modeSuccessToast(next)
        syncToast(message.title, message.description)
      },
    )
  }

  function choose(next: string) {
    if (next !== "pluggy" && next !== "fake") return // clicar na já escolhida não desmarca
    if (next === value || mutation.pending) return
    setTarget(next)
    if (modeSwitchCopy(value, next)) {
      mutation.setError(null)
      setDialogOpen(true)
    } else {
      save(next)
    }
  }

  // Erro sem diálogo (primeira escolha): aparece embaixo das opções.
  const inlineError = !dialogOpen && mutation.error

  return (
    <>
      <ToggleGroupPrimitive.Root
        ref={groupRef}
        type="single"
        value={value === "none" ? "" : value}
        onValueChange={choose}
        disabled={disabled}
        aria-label="Fonte dos dados"
        aria-describedby={note ? `${groupId}-hint` : undefined}
        aria-busy={mutation.pending || undefined}
        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
      >
        {OPTIONS.map(({ value: option, icon: Icon, description }) => {
          const selected = option === value
          const switching = mutation.pending && target === option
          return (
            <ToggleGroupPrimitive.Item
              key={option}
              id={`${groupId}-${option}`}
              value={option}
              className={cn(
                "group/option relative flex min-w-0 items-start gap-3 rounded-lg border p-3 text-left text-sm transition-[color,box-shadow,border-color] outline-none",
                "hover:bg-accent/50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
                "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent",
                "data-[state=on]:border-primary data-[state=on]:bg-primary/5 data-[state=on]:ring-primary/30 data-[state=on]:ring-1",
              )}
            >
              <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md group-data-[state=on]/option:bg-primary group-data-[state=on]/option:text-primary-foreground">
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 space-y-0.5 pr-5">
                <span className="block leading-snug font-medium">{MODE_LABEL[option]}</span>
                <span className="text-muted-foreground block text-xs text-pretty">{description}</span>
              </span>
              {switching ? (
                <Spinner className="absolute top-3 right-3 size-4" aria-hidden />
              ) : selected ? (
                <CheckCircle2 className="text-primary absolute top-3 right-3 size-4" aria-hidden />
              ) : null}
            </ToggleGroupPrimitive.Item>
          )
        })}
      </ToggleGroupPrimitive.Root>

      <span role="status" aria-live="polite" className="sr-only">
        {mutation.pending ? "Trocando a fonte dos dados…" : ""}
      </span>

      {note && (
        <Note icon={locked ? Lock : undefined} className="-mt-1">
          <span id={`${groupId}-hint`}>{note}</span>
        </Note>
      )}
      {value === "pluggy" && missing && (
        <Note icon={TriangleAlert} className="text-foreground -mt-1 [&>svg]:text-status-warning">
          {missing}
        </Note>
      )}
      {inlineError && <ErrorAlert error={inlineError} />}

      <AlertDialog open={dialogOpen} onOpenChange={(next) => (mutation.pending ? undefined : setDialogOpen(next))}>
        <AlertDialogContent
          aria-busy={mutation.pending}
          // Sem gatilho próprio: o foco volta para a opção escolhida (a nova, se trocou).
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            groupRef.current?.querySelector<HTMLElement>("[data-state=on]")?.focus()
          }}
        >
          {copy && target && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle className="leading-snug">{copy.title}</AlertDialogTitle>
                <AlertDialogDescription>{copy.description}</AlertDialogDescription>
              </AlertDialogHeader>
              {mutation.error && <ErrorAlert error={mutation.error} />}
              <AlertDialogFooter className="max-sm:grid max-sm:grid-cols-2">
                <AlertDialogCancel disabled={mutation.pending}>Cancelar</AlertDialogCancel>
                {/* Botão comum (não AlertDialogAction): o diálogo fica aberto até a API responder. */}
                <Button variant="destructive" onClick={() => save(target)} disabled={mutation.pending}>
                  {mutation.pending && <Spinner aria-hidden />}
                  {mutation.pending ? "Trocando…" : copy.confirm}
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
