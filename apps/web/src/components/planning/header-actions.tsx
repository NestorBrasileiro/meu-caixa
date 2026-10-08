import { Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { EDIT_SOON } from "./styles"

/** "Editar" ainda sem API: desabilitado, com a dica de quando chega. */
export function PlanningHeaderActions() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Botão desabilitado não recebe foco nem hover: o wrapper mantém a dica acessível. */}
        <span tabIndex={0} className="focus-visible:ring-ring/50 rounded-md outline-none focus-visible:ring-[3px]">
          <Button variant="outline" size="sm" disabled>
            <Pencil aria-hidden />
            Editar
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{EDIT_SOON}</TooltipContent>
    </Tooltip>
  )
}
