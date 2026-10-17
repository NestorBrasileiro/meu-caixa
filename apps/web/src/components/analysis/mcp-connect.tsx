"use client"

import { Check, Copy } from "lucide-react"
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MCP_OAUTH_CLIENT_ID, MCP_PROMPT, mcpReachabilityNote, mcpUrl } from "./mcp"

const noSubscription = () => () => {}

/** Origem da página no browser; null no HTML do servidor (atrás de proxy ele não sabe o domínio público). */
function useOrigin(): string | null {
  return useSyncExternalStore(
    noSubscription,
    () => window.location.origin,
    () => null,
  )
}

/** URL do servidor MCP com botão de copiar e o passo a passo do conector no claude.ai. */
export function McpConnect() {
  const origin = useOrigin()
  const url = origin ? mcpUrl(origin) : null
  const note = origin ? mcpReachabilityNote(origin) : null
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null)
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputId = useId()

  useEffect(() => () => {
    if (reset.current) clearTimeout(reset.current)
  }, [])

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied("ok")
    } catch {
      // Sem permissão de área de transferência (ou HTTP fora de localhost): a URL fica visível para copiar à mão.
      setCopied("failed")
    }
    if (reset.current) clearTimeout(reset.current)
    reset.current = setTimeout(() => setCopied(null), 2500)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor={inputId} className="text-sm font-medium">
          URL do servidor MCP
        </label>
        <div className="flex items-center gap-2">
          <Input
            id={inputId}
            readOnly
            value={url ?? ""}
            placeholder="Carregando…"
            onFocus={(event) => event.currentTarget.select()}
            className="h-8 min-w-0 flex-1 font-mono text-[0.8125rem] md:text-[0.8125rem]"
          />
          <Button variant="outline" size="sm" onClick={copy} disabled={!url} aria-label="Copiar a URL do servidor MCP">
            {copied === "ok" ? <Check aria-hidden /> : <Copy aria-hidden />}
            <span className="max-sm:hidden">{copied === "ok" ? "Copiada" : "Copiar"}</span>
          </Button>
        </div>
        <p role="status" className="text-muted-foreground min-h-4 text-xs empty:min-h-0">
          {copied === "ok" && "URL copiada."}
          {copied === "failed" && "Não deu para copiar: selecione a URL e copie à mão."}
        </p>
        {note && <p className="text-muted-foreground text-xs text-pretty">{note}</p>}
      </div>

      <ol className="text-muted-foreground list-decimal space-y-1.5 pl-5 text-sm text-pretty marker:text-xs">
        <li>
          No claude.ai, abra <span className="text-foreground font-medium">Configurações → Conectores</span> e clique
          em <span className="text-foreground font-medium">Adicionar conector personalizado</span>.
        </li>
        <li>
          Dê o nome <span className="text-foreground font-medium">Meu Caixa</span>, cole a URL e, em Configurações
          avançadas, use o OAuth Client ID{" "}
          <code className="bg-muted text-foreground rounded px-1 py-0.5 font-mono text-xs">{MCP_OAUTH_CLIENT_ID}</code> (sem
          secret).
        </li>
        <li>Conecte e entre com o seu usuário do Meu Caixa.</li>
        <li>
          Numa conversa, peça: <span className="text-foreground">“{MCP_PROMPT}”</span>. O relatório aparece aqui
          quando o Claude salvar.
        </li>
      </ol>
    </div>
  )
}
