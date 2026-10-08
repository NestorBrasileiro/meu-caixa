import { ArrowUp, MessageCircleQuestion } from "lucide-react"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group"
import { cn } from "@/lib/utils"

/**
 * Perguntas em linguagem natural ao Claude. Chega com a integração MCP
 * (marco de 100%); até lá o campo e o botão ficam desabilitados.
 *
 * Na coluna lateral o cartão acompanha a altura do vizinho: o campo cresce
 * para ocupar a sobra e a nota vira um rodapé alinhado ao "Total por mês".
 */
export function AskClaudeCard({ className }: { className?: string }) {
  return (
    <Card className={cn("@container", className)}>
      {/* Estreito (coluna lateral): título em cima, campo embaixo. Largo: lado a lado. */}
      <CardContent className="flex flex-1 flex-col gap-4 @2xl:grid @2xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] @2xl:gap-8">
        <div className="flex items-start gap-3">
          <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-md">
            <MessageCircleQuestion className="text-muted-foreground size-4" aria-hidden />
          </span>
          <div className="space-y-1">
            <h3 id="pergunte-ao-claude" className="leading-tight font-semibold">
              Pergunte ao Claude
            </h3>
            <p className="text-muted-foreground text-sm text-pretty">
              Tire dúvidas sobre o seu dinheiro em linguagem natural, direto das suas transações.
            </p>
          </div>
        </div>
        <form aria-labelledby="pergunte-ao-claude" aria-describedby="pergunte-ao-claude-nota" className="flex flex-1 flex-col">
          <InputGroup data-disabled="true" className="flex-1">
            <InputGroupTextarea
              disabled
              rows={2}
              aria-label="Sua pergunta"
              placeholder="Ex.: quanto gastei com delivery este ano?"
              className="min-h-16"
            />
            <InputGroupAddon align="block-end" className="justify-end">
              <InputGroupButton type="submit" variant="default" size="sm" disabled>
                Perguntar
                <ArrowUp aria-hidden />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
      </CardContent>
      <CardFooter className="border-t [.border-t]:pt-4">
        <p id="pergunte-ao-claude-nota" className="text-muted-foreground text-xs leading-5">
          Disponível com a integração MCP <span className="whitespace-nowrap">(marco de 100%).</span>
        </p>
      </CardFooter>
    </Card>
  )
}
