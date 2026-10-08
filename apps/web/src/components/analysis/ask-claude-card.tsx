import { ArrowUp, MessageCircleQuestion } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group"
import { cn } from "@/lib/utils"

/**
 * Perguntas em linguagem natural ao Claude. Chega com a integração MCP
 * (marco de 100%); até lá o campo e o botão ficam desabilitados.
 */
export function AskClaudeCard({ className }: { className?: string }) {
  return (
    <Card className={cn("@container", className)}>
      {/* Estreito (coluna lateral): título em cima, campo embaixo. Largo: lado a lado. */}
      <CardContent className="flex flex-1 flex-col justify-between gap-5 @2xl:grid @2xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] @2xl:gap-8">
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
        <div className="space-y-2">
          <form aria-labelledby="pergunte-ao-claude">
            <InputGroup data-disabled="true">
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
          <p className="text-muted-foreground text-xs">
            As perguntas chegam com a integração MCP <span className="whitespace-nowrap">(marco de 100%).</span>
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
