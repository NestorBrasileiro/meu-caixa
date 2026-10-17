"use client"

import { AlertCircle, Info, Sparkles, X } from "lucide-react"
import type { ReactElement } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatTime } from "@/lib/format/date"
import { cn } from "@/lib/utils"
import { generateButton } from "./generation"
import { useGeneration } from "./generation-provider"

/** Botão desabilitado não recebe foco nem hover: o wrapper mantém a dica acessível pelo teclado. */
export function DisabledHint({ hint, children }: { hint: string; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="focus-visible:ring-ring/50 inline-flex rounded-md outline-none focus-visible:ring-[3px]"
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-pretty">{hint}</TooltipContent>
    </Tooltip>
  )
}

/**
 * "Gerar análise" / "Gerar nova análise". Enquanto gera, fica indisponível com `aria-disabled` em
 * vez de `disabled`: quem chegou pelo teclado não perde o foco, e o aviso no topo anuncia o andamento.
 */
export function GenerateButton({ variant = "default" }: { variant?: "default" | "outline" }) {
  const { state, availability, hasReport, start } = useGeneration()
  const button = generateButton(availability, state, hasReport)

  if (button.hint) {
    return (
      <DisabledHint hint={button.hint}>
        <Button size="sm" variant={variant} disabled>
          <Sparkles aria-hidden />
          {button.label}
        </Button>
      </DisabledHint>
    )
  }

  return (
    <Button
      size="sm"
      variant={variant}
      aria-disabled={button.busy || undefined}
      className={cn(
        "aria-disabled:cursor-progress",
        variant === "default" ? "aria-disabled:hover:bg-primary" : "aria-disabled:hover:bg-background",
      )}
      onClick={() => {
        if (!button.busy) start()
      }}
    >
      {button.busy ? <Spinner role="presentation" aria-label={undefined} aria-hidden /> : <Sparkles aria-hidden />}
      {button.label}
    </Button>
  )
}

/**
 * Andamento e resultado da geração, no topo da página. A região `status` existe sempre (vazia
 * quando não há nada): leitores de tela só anunciam mudanças em regiões que já estavam na página.
 */
export function GenerationStatus() {
  const { state, dismiss } = useGeneration()
  const notice = state.phase === "idle" ? state.notice : null

  return (
    <>
      <div role="status" aria-live="polite" className="empty:hidden">
        {state.phase !== "idle" && (
          <div className="bg-card flex items-start gap-3 rounded-lg border px-4 py-3 text-sm">
            <Spinner role="presentation" aria-label={undefined} aria-hidden className="text-muted-foreground mt-0.5" />
            <div className="min-w-0 space-y-0.5">
              <p className="font-medium">
                {state.phase === "refreshing"
                  ? "Análise pronta. Trazendo o relatório…"
                  : state.phase === "starting"
                    ? "Pedindo a análise ao Claude…"
                    : "O Claude está analisando suas transações… isso leva alguns minutos."}
              </p>
              {state.phase === "running" && (
                <p className="text-muted-foreground text-pretty">
                  Começou às {formatTime(state.startedAt)}. Pode continuar usando o app: o relatório aparece aqui
                  quando ficar pronto.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
      {notice && (
        <Alert
          role={notice.tone === "error" ? "alert" : "status"}
          variant={notice.tone === "error" ? "destructive" : "default"}
          className="pr-12"
        >
          {notice.tone === "error" ? <AlertCircle aria-hidden /> : <Info aria-hidden />}
          <AlertTitle>{notice.title}</AlertTitle>
          <AlertDescription>
            <p>{notice.message}</p>
          </AlertDescription>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground absolute top-2 right-2"
            aria-label="Fechar aviso"
            onClick={dismiss}
          >
            <X aria-hidden />
          </Button>
        </Alert>
      )}
    </>
  )
}
