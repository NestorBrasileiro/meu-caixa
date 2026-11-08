"use client"

import { AlertCircle, Check, Copy, KeyRound } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useId, useRef, useState, useTransition } from "react"
import { useOrigin } from "@/components/analysis/mcp-connect"
import { mcpUrl } from "@/components/analysis/mcp"
import { DeleteDialog } from "@/components/planning/delete-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { apiRequest } from "@/lib/api/client"
import type { IssuedMcpToken, McpTokenStatus } from "@/lib/api/settings"
import { READ_ONLY_HINT } from "@/lib/data/mode"
import { formatDateTime } from "@/lib/format/date"
import { claudeMcpAddCommand } from "./mcp-token"
import { saveErrorMessage } from "./save-error"

const PATH = "/api/settings/mcp-token"

/** Gerar, trocar e revogar o token pessoal do MCP. O token novo aparece uma vez só. */
export function McpTokenForm({ status, readOnly }: { status: McpTokenStatus; readOnly: boolean }) {
  const router = useRouter()
  const origin = useOrigin()
  const [issued, setIssued] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmingReplace, setConfirmingReplace] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [pending, startTransition] = useTransition()

  function issue() {
    setError(null)
    startTransition(async () => {
      let token: string
      try {
        token = (await apiRequest<IssuedMcpToken>(PATH, { method: "POST" })).token
      } catch (cause) {
        setError(saveErrorMessage(cause))
        return
      }
      startTransition(() => {
        setIssued(token)
        setConfirmingReplace(false)
        router.refresh()
      })
    })
  }

  return (
    <div className="space-y-5">
      <p className="text-muted-foreground text-sm">
        {status.exists && status.createdAt
          ? `Token terminado em …${status.hint}, gerado em ${formatDateTime(status.createdAt)}. ${
              status.lastUsedAt ? `Último uso em ${formatDateTime(status.lastUsedAt)}.` : "Ainda não foi usado."
            }`
          : "Nenhum token gerado."}
      </p>

      {error && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden />
          <AlertTitle>Não foi possível gerar o token</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {issued && (
        <Alert>
          <KeyRound aria-hidden />
          <AlertTitle>Copie agora: o token não aparece de novo</AlertTitle>
          <AlertDescription className="w-full space-y-3">
            <CopyField label="Token" value={issued} />
            {origin && <CopyField label="Comando do Claude Code" value={claudeMcpAddCommand(mcpUrl(origin), issued)} />}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {status.exists ? (
          <>
            <Button type="button" disabled={readOnly || pending} onClick={() => setConfirmingReplace(true)}>
              Gerar novo token
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={readOnly || pending}
              onClick={() => setRevoking(true)}
            >
              Revogar
            </Button>
          </>
        ) : (
          <Button type="button" disabled={readOnly || pending} onClick={issue}>
            {pending && <Spinner aria-hidden />}
            {pending ? "Gerando…" : "Gerar token"}
          </Button>
        )}
        {readOnly && <span className="text-muted-foreground text-sm">{READ_ONLY_HINT}</span>}
      </div>

      <AlertDialog open={confirmingReplace} onOpenChange={(next) => (pending ? undefined : setConfirmingReplace(next))}>
        <AlertDialogContent aria-busy={pending}>
          <AlertDialogHeader>
            <AlertDialogTitle className="leading-snug">Gerar um novo token?</AlertDialogTitle>
            <AlertDialogDescription>
              O token atual deixa de valer na hora: o Claude Code ou Desktop que usa ele precisa ser configurado de
              novo com o token novo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="max-sm:grid max-sm:grid-cols-2">
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <Button onClick={issue} disabled={pending}>
              {pending && <Spinner aria-hidden />}
              {pending ? "Gerando…" : "Gerar novo"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DeleteDialog
        open={revoking}
        onOpenChange={setRevoking}
        path={PATH}
        copy={{
          title: "Revogar o token do MCP?",
          description:
            "Quem usa este token (Claude Code ou Desktop) perde o acesso na hora. O conector do claude.ai, que entra pelo login, continua funcionando.",
          confirm: "Revogar token",
          success: "Token do MCP revogado",
        }}
        onDeleted={() => setIssued(null)}
      />
    </div>
  )
}

/** Valor só de leitura com botão de copiar (sem área de transferência, dá para selecionar e copiar à mão). */
function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null)
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputId = useId()

  useEffect(() => () => {
    if (reset.current) clearTimeout(reset.current)
  }, [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied("ok")
    } catch {
      setCopied("failed")
    }
    if (reset.current) clearTimeout(reset.current)
    reset.current = setTimeout(() => setCopied(null), 2500)
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="text-foreground text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={inputId}
          readOnly
          value={value}
          onFocus={(event) => event.currentTarget.select()}
          className="h-8 min-w-0 flex-1 font-mono text-[0.8125rem] md:text-[0.8125rem]"
        />
        <Button variant="outline" size="sm" onClick={copy} aria-label={`Copiar: ${label}`}>
          {copied === "ok" ? <Check aria-hidden /> : <Copy aria-hidden />}
          <span className="max-sm:hidden">{copied === "ok" ? "Copiado" : "Copiar"}</span>
        </Button>
      </div>
      <p role="status" className="text-muted-foreground min-h-4 text-xs empty:min-h-0">
        {copied === "ok" && `${label} copiado.`}
        {copied === "failed" && "Não deu para copiar: selecione o texto e copie à mão."}
      </p>
    </div>
  )
}
