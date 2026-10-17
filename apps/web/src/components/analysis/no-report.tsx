import { Plug, Sparkles } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { unavailableHint, type AppAvailability } from "./generation"
import { GenerateButton } from "./generation-ui"
import { McpConnect } from "./mcp-connect"

function OptionIcon({ icon: Icon }: { icon: typeof Sparkles }) {
  return (
    <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-md">
      <Icon className="text-muted-foreground size-4" aria-hidden />
    </span>
  )
}

/**
 * Ainda não há análise: explica os dois jeitos de pedir a primeira — pelo app (API da Anthropic,
 * precisa de ANTHROPIC_API_KEY) ou pelo Claude do próprio usuário, conectado ao servidor MCP.
 */
export function NoReport({ availability }: { availability: AppAvailability }) {
  const hint = unavailableHint(availability)

  return (
    <section aria-labelledby="sem-analise" className="space-y-4">
      <div className="max-w-2xl space-y-1">
        <h2 id="sem-analise" className="text-lg font-semibold">
          Nenhuma análise ainda
        </h2>
        <p className="text-muted-foreground text-sm text-pretty">
          O Claude lê as transações já sincronizadas e aponta onde dá para economizar: gastos do pecado, vazamentos,
          o que cortar e como isso ajuda nas suas metas. Há dois jeitos de pedir a primeira análise.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="grid-cols-[auto_1fr] gap-x-3">
            <div className="row-span-2">
              <OptionIcon icon={Sparkles} />
            </div>
            <CardTitle>
              <h3>Gerar aqui no app</h3>
            </CardTitle>
            <CardDescription className="text-pretty">
              O app pede a análise à API da Anthropic, com as mesmas ferramentas do MCP.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="text-muted-foreground list-disc space-y-1.5 pl-5 text-sm text-pretty">
              <li>Leva alguns minutos; dá para continuar usando o app enquanto isso.</li>
              <li>É cobrada por uso na conta da Anthropic cuja chave está configurada na API.</li>
              <li>O relatório fica salvo e aparece aqui e na visão geral.</li>
            </ul>
            <div className="space-y-2">
              <GenerateButton />
              {hint && <p className="text-muted-foreground text-xs text-pretty">{hint}</p>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="grid-cols-[auto_1fr] gap-x-3">
            <div className="row-span-2">
              <OptionIcon icon={Plug} />
            </div>
            <CardTitle>
              <h3>Pelo seu Claude (MCP)</h3>
            </CardTitle>
            <CardDescription className="text-pretty">
              Conecte o Meu Caixa ao seu Claude e peça a análise numa conversa. Usa a sua assinatura do Claude, sem
              chave da Anthropic.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <McpConnect />
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
