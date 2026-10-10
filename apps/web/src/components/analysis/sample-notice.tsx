import { Info } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

/**
 * Aviso de que o relatório é de exemplo (modo `DATA_SOURCE=mock`, sem API). `role="note"` em vez do
 * `alert` padrão: é informação de contexto, não um problema, e não deve ser anunciada como urgente.
 */
export function SampleNotice() {
  return (
    <Alert role="note">
      <Info aria-hidden />
      <AlertTitle>Relatório de exemplo</AlertTitle>
      <AlertDescription>
        <p>
          Estes são dados de exemplo <span className="whitespace-nowrap">(DATA_SOURCE=mock)</span>: os números abaixo
          são ilustrativos e não vêm de contas reais. Com a API, aparece aqui a última análise do Claude — pedida
          pelo app ou pelo seu Claude via MCP.
        </p>
      </AlertDescription>
    </Alert>
  )
}
