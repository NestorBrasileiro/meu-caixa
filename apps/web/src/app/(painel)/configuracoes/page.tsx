import type { Metadata } from "next"
import { Info } from "lucide-react"
import { MEU_PLUGGY_URL } from "@/components/accounts/format"
import { PageHeader } from "@/components/page-header"
import { AnthropicSettingsForm } from "@/components/settings/anthropic-settings-form"
import { McpTokenForm } from "@/components/settings/mcp-token-form"
import { PluggySettingsForm } from "@/components/settings/pluggy-settings-form"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CAN_WRITE, getAnthropicSettings, getMcpToken, getPluggySettings } from "@/lib/data"
import { formatDateTime } from "@/lib/format/date"

export const metadata: Metadata = { title: "Configurações" }

const DASHBOARD_URL = "https://dashboard.pluggy.ai"
const ANTHROPIC_KEYS_URL = "https://console.anthropic.com/settings/keys"

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-4">
      {children}
      <span className="sr-only"> (abre em nova aba)</span>
    </a>
  )
}

export default async function Page() {
  const [settings, anthropic, mcpToken] = await Promise.all([
    getPluggySettings(),
    getAnthropicSettings(),
    getMcpToken(),
  ])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Só suas: credenciais da Pluggy (seus bancos), chave da Anthropic (análise pelo app) e token do MCP."
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,42rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>
                <h2>Pluggy</h2>
              </CardTitle>
              {settings.configured ? (
                <Badge variant="secondary">Configurada</Badge>
              ) : (
                <Badge variant="outline">Não configurada</Badge>
              )}
            </div>
            <CardDescription>
              {settings.updatedAt
                ? `Atualizada em ${formatDateTime(settings.updatedAt)}. Antes de salvar, o app confere tudo na Pluggy.`
                : "Antes de salvar, o app confere o Client ID, o Client Secret e cada item na Pluggy."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {settings.provider === "fake" && (
              <Alert>
                <Info aria-hidden />
                <AlertTitle>A API está com dados fictícios</AlertTitle>
                <AlertDescription>
                  Com FINANCE_PROVIDER=fake estas credenciais ficam salvas, mas só passam a valer com
                  FINANCE_PROVIDER=pluggy no .env da API.
                </AlertDescription>
              </Alert>
            )}
            <PluggySettingsForm settings={settings} readOnly={!CAN_WRITE} />
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>
              <h2>Onde achar cada dado</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="text-muted-foreground list-decimal space-y-2 pl-5 text-sm">
              <li>
                Conecte seus bancos no <ExternalLink href={MEU_PLUGGY_URL}>Meu Pluggy</ExternalLink>.
              </li>
              <li>
                No <ExternalLink href={DASHBOARD_URL}>dashboard da Pluggy</ExternalLink>, abra a sua Application:
                ali ficam o <span className="text-foreground">Client ID</span> e o{" "}
                <span className="text-foreground">Client Secret</span>.
              </li>
              <li>
                Na Application, clique em <span className="text-foreground">Ir para Demo</span> →{" "}
                <span className="text-foreground">Connect Account</span> e escolha o conector{" "}
                <span className="text-foreground">MeuPluggy</span> para trazer os bancos já conectados.
              </li>
              <li>
                Em <span className="text-foreground">Connected Items</span>, clique em cada banco e copie o{" "}
                <span className="text-foreground">itemId</span>.
              </li>
            </ol>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,42rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>
                <h2>Claude (análise pelo app)</h2>
              </CardTitle>
              {anthropic.configured ? (
                <Badge variant="secondary">Ligada</Badge>
              ) : (
                <Badge variant="outline">Desligada</Badge>
              )}
            </div>
            <CardDescription>
              {anthropic.updatedAt
                ? `Atualizada em ${formatDateTime(anthropic.updatedAt)}. Antes de salvar, o app confere a chave e o modelo na Anthropic.`
                : "Liga “Gerar análise” e “Pergunte ao Claude”. Antes de salvar, o app confere a chave e o modelo na Anthropic."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AnthropicSettingsForm settings={anthropic} readOnly={!CAN_WRITE} />
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>
              <h2>Sobre a chave</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-muted-foreground list-disc space-y-2 pl-5 text-sm">
              <li>
                Crie em <ExternalLink href={ANTHROPIC_KEYS_URL}>console.anthropic.com → API Keys</ExternalLink>.
              </li>
              <li>
                É <span className="text-foreground">cobrada por uso</span> na sua conta da Anthropic, a cada
                análise gerada ou pergunta respondida.
              </li>
              <li>A análise pelo seu Claude conectado via MCP não precisa desta chave.</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,42rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>
                <h2>Token do MCP</h2>
              </CardTitle>
              {mcpToken.exists ? (
                <Badge variant="secondary">Ativo</Badge>
              ) : (
                <Badge variant="outline">Nenhum</Badge>
              )}
            </div>
            <CardDescription>
              Para o Claude Code ou o Claude Desktop lerem as suas finanças sem o login pelo navegador.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <McpTokenForm status={mcpToken} readOnly={!CAN_WRITE} />
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>
              <h2>Sobre o token</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-muted-foreground list-disc space-y-2 pl-5 text-sm">
              <li>
                Dá acesso aos <span className="text-foreground">seus dados</span>, como se fosse você: guarde como
                uma senha.
              </li>
              <li>Fica guardado só como hash: se perder, gere outro (o antigo deixa de valer).</li>
              <li>O conector do claude.ai não precisa dele: ele entra pelo login (veja a tela Análise).</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
