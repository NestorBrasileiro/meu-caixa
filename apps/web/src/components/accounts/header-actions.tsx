"use client"

import { ExternalLink, RefreshCw } from "lucide-react"
import { useEffect, type ReactElement } from "react"
import { followRun, startSync, useSyncTracker } from "@/components/shell/sync-tracker"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { READ_ONLY_HINT } from "@/lib/data/mode"
import { cn } from "@/lib/utils"
import { MEU_PLUGGY_URL } from "./format"

/** Ações do cabeçalho: conectar banco (link externo) e sincronizar agora. */
export function AccountsHeaderActions({
  readOnly,
  runningRunId,
}: {
  /** Dados de exemplo: não há API para sincronizar. */
  readOnly: boolean
  /** Execução que o servidor viu rodando ao montar a página: a tela já abre acompanhando. */
  runningRunId: string | null
}) {
  return (
    <>
      <Button variant="outline" size="sm" asChild>
        <a href={MEU_PLUGGY_URL} target="_blank" rel="noopener noreferrer">
          <ExternalLink aria-hidden />
          Conectar banco
          <span className="sr-only">(abre o Meu Pluggy em nova aba)</span>
        </a>
      </Button>
      {readOnly ? (
        <ReadOnlyHint>
          <Button size="sm" disabled>
            <RefreshCw aria-hidden />
            Sincronizar agora
          </Button>
        </ReadOnlyHint>
      ) : (
        <SyncNowButton runningRunId={runningRunId} />
      )}
    </>
  )
}

/**
 * Dispara a sincronização e acompanha até o fim (o aviso e os dados novos chegam juntos). Enquanto
 * roda, o botão fica indisponível com `aria-disabled` em vez de `disabled`: quem chegou pelo teclado
 * não perde o foco, e a região de status anuncia o andamento.
 */
function SyncNowButton({ runningRunId }: { runningRunId: string | null }) {
  const tracker = useSyncTracker()

  useEffect(() => {
    if (runningRunId) followRun(runningRunId, true)
  }, [runningRunId])

  // Antes do efeito acima rodar (no HTML do servidor), a execução vista pelo servidor já conta.
  const busy = tracker.phase !== "idle" || (runningRunId !== null && !tracker.abandoned.has(runningRunId))

  return (
    <>
      <Button
        size="sm"
        aria-disabled={busy || undefined}
        className="aria-disabled:hover:bg-primary aria-disabled:cursor-progress"
        onClick={() => {
          if (!busy) void startSync()
        }}
      >
        {busy ? <Spinner role="presentation" aria-label={undefined} aria-hidden /> : <RefreshCw aria-hidden />}
        {/* Os dois rótulos ocupam a mesma célula: o botão não muda de largura (nem empurra o vizinho). */}
        <span className="grid">
          <span className={cn("col-start-1 row-start-1", busy && "invisible")}>Sincronizar agora</span>
          <span className={cn("col-start-1 row-start-1", !busy && "invisible")}>Sincronizando…</span>
        </span>
      </Button>
      <span role="status" className="sr-only">
        {busy ? "Sincronização em andamento" : ""}
      </span>
    </>
  )
}

/** Botão desabilitado não recebe foco nem hover: o wrapper mantém a dica acessível. */
function ReadOnlyHint({ children }: { children: ReactElement }) {
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
      <TooltipContent>{READ_ONLY_HINT}</TooltipContent>
    </Tooltip>
  )
}
