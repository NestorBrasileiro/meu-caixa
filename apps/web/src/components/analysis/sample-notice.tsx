import { Info } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

/**
 * Aviso de que o relatório é de exemplo (até a integração MCP, marco de 100%).
 * `role="note"` em vez do `alert` padrão: é informação de contexto, não um
 * problema, e não deve ser anunciada como urgente.
 */
export function SampleNotice() {
  return (
    <Alert role="note">
      <Info aria-hidden />
      <AlertTitle>Relatório de exemplo</AlertTitle>
      <AlertDescription>
        <p>
          A análise das suas próprias transações chega com a integração MCP{" "}
          <span className="whitespace-nowrap">(marco de 100%).</span> Até lá, os números abaixo são ilustrativos e não
          vêm das suas contas.
        </p>
      </AlertDescription>
    </Alert>
  )
}
