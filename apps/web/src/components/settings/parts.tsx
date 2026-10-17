"use client"

import {
  AlertCircle,
  Check,
  CheckCircle2,
  CircleDashed,
  CircleX,
  ExternalLink,
  Info,
  RefreshCw,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition, type ReactElement, type ReactNode } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { settingsError, type SettingsAction, type SettingsError, type StatusView, type Tone } from "./open-finance"

/** Pedaços comuns das seções de configuração. */

export const TONE_ICON: Record<Tone, { icon: LucideIcon; className: string }> = {
  good: { icon: CheckCircle2, className: "text-status-good" },
  neutral: { icon: CircleDashed, className: "text-muted-foreground" },
  warning: { icon: TriangleAlert, className: "text-status-warning" },
  critical: { icon: CircleX, className: "text-status-critical" },
  running: { icon: RefreshCw, className: "text-muted-foreground" },
}

/** Status em pílula: ícone colorido + rótulo (a cor nunca carrega o sentido sozinha). */
export function ToneBadge({ status, className }: { status: StatusView; className?: string }) {
  const { icon: Icon, className: iconClass } = TONE_ICON[status.tone]
  return (
    <Badge variant="outline" className={cn("gap-1 font-normal", className)}>
      <Icon className={cn("size-3", iconClass)} aria-hidden />
      {status.label}
    </Badge>
  )
}

/** Nota discreta com ícone (por que algo está desabilitado, de onde vem um valor). */
export function Note({ children, icon: Icon = Info, className }: { children: ReactNode; icon?: LucideIcon; className?: string }) {
  return (
    <p className={cn("text-muted-foreground flex items-start gap-2 text-xs text-pretty", className)}>
      <Icon className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

/** Link externo: abre em nova aba e avisa leitores de tela. */
export function ExternalAnchor({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("text-foreground inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline", className)}
    >
      {children}
      <ExternalLink className="size-3.5 shrink-0" aria-hidden />
      <span className="sr-only">(abre em nova aba)</span>
    </a>
  )
}

/** Erro do servidor, logo abaixo do que o causou. */
export function ErrorAlert({ error, className }: { error: SettingsError; className?: string }) {
  return (
    <Alert variant="destructive" className={className}>
      <AlertCircle aria-hidden />
      <AlertTitle>{error.title}</AlertTitle>
      <AlertDescription>{error.description}</AlertDescription>
    </Alert>
  )
}

/** Botão desabilitado não recebe foco nem hover: o wrapper mantém a dica acessível. */
export function DisabledHint({ hint, children }: { hint: string | null; children: ReactElement }) {
  if (!hint) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="focus-visible:ring-ring/50 inline-flex rounded-md outline-none focus-visible:ring-[3px]">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-pretty">{hint}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Uma parte da seção: à esquerda o passo, o título e o que ele faz; à direita os controles. No
 * celular, um embaixo do outro. O título recebe o foco quando uma ação some com o elemento focado.
 */
export function Subsection({
  id,
  step,
  done,
  title,
  description,
  children,
}: {
  id: string
  step: number
  done: boolean
  title: string
  description: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="grid gap-4 py-6 first:pt-0 last:pb-0 md:grid-cols-[15rem_minmax(0,1fr)] md:gap-8">
      <div className="flex gap-3">
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums",
            done && "border-status-good/40 bg-status-good/10 text-status-good",
          )}
        >
          {done ? <Check className="size-3.5" aria-hidden /> : <span aria-hidden>{step}</span>}
          <span className="sr-only">{done ? `Passo ${step}, concluído:` : `Passo ${step}:`}</span>
        </span>
        <div className="min-w-0 space-y-1">
          <h3 id={`${id}-title`} tabIndex={-1} className="text-sm leading-6 font-medium outline-none">
            {title}
          </h3>
          <div className="text-muted-foreground text-sm text-pretty">{description}</div>
        </div>
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  )
}

/**
 * Chamada de escrita + atualização dos dados do servidor numa transição só: `pending` fica
 * verdadeiro até o `router.refresh()` terminar, então a tela muda junto com os dados novos. Em caso
 * de erro, `error` traz título e explicação em pt-BR.
 */
export function useSettingsAction(action: SettingsAction) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<SettingsError | null>(null)

  function run<T>(request: () => Promise<T>, onSuccess: (result: T) => void) {
    setError(null)
    startTransition(async () => {
      let result: T
      try {
        result = await request()
      } catch (cause) {
        setError(settingsError(cause, action))
        return
      }
      startTransition(() => {
        onSuccess(result)
        router.refresh()
      })
    })
  }

  return { pending, error, setError, run }
}

/** Aviso de sucesso de uma ação que começou uma sincronização: leva para Contas, onde ela aparece. */
export function useSyncStartedToast() {
  const router = useRouter()
  return (title: string, description: string) =>
    toast.success(title, { description, action: { label: "Ver Contas", onClick: () => router.push("/contas") } })
}
