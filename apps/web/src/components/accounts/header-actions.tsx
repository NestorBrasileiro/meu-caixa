import { ExternalLink, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { MEU_PLUGGY_URL } from "./format"

/** Ações do cabeçalho: conectar banco (link externo) e sincronizar (chega com a API). */
export function AccountsHeaderActions() {
  return (
    <>
      <Button variant="outline" size="sm" asChild>
        <a href={MEU_PLUGGY_URL} target="_blank" rel="noopener noreferrer">
          <ExternalLink aria-hidden />
          Conectar banco
          <span className="sr-only">(abre o Meu Pluggy em nova aba)</span>
        </a>
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* Botão desabilitado não recebe foco nem hover: o wrapper mantém a dica acessível. */}
          <span tabIndex={0} className="focus-visible:ring-ring/50 rounded-md outline-none focus-visible:ring-[3px]">
            <Button size="sm" disabled>
              <RefreshCw aria-hidden />
              Sincronizar agora
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Disponível quando a interface estiver ligada à API</TooltipContent>
      </Tooltip>
    </>
  )
}
