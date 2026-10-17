import { CircleDashed } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { OpenFinanceSettings } from "@/lib/api/settings"
import type { IsoDateTime } from "@/lib/api/types"
import { READ_ONLY_HINT } from "@/lib/data/mode"
import { CredentialsPanel } from "./credentials-section"
import { ItemsPanel } from "./items-section"
import { ModeChoice } from "./mode-section"
import { openFinanceView } from "./open-finance"
import { Note, Subsection, ToneBadge } from "./parts"

export const OPEN_FINANCE_SECTION_ID = "open-finance"

/**
 * "Open Finance (Meu Pluggy)": de onde vêm os dados dos bancos, as credenciais da Pluggy e os
 * bancos (items). Os três passos ficam numa mesma seção, na ordem em que se configura.
 */
export function OpenFinanceCard({
  settings,
  now,
  canWrite,
}: {
  settings: OpenFinanceSettings
  now: IsoDateTime
  canWrite: boolean
}) {
  const view = openFinanceView(settings, { canWrite, readOnlyHint: READ_ONLY_HINT })
  const id = OPEN_FINANCE_SECTION_ID

  return (
    <Card id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <CardTitle>
            <h2 id={`${id}-title`} className="text-base leading-snug">
              Open Finance (Meu Pluggy)
            </h2>
          </CardTitle>
          <ToneBadge status={view.overall} />
        </div>
        <CardDescription className="max-w-prose text-pretty">
          O Meu Caixa lê seus bancos pelo Meu Pluggy, gratuito para uso pessoal (até 5 conexões do mesmo titular). As
          credenciais ficam só no servidor: depois de salvas, nem esta tela as mostra de volta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {view.notConfigured && (
          <Alert className="[&>svg]:text-status-warning">
            <CircleDashed aria-hidden />
            <AlertTitle>Open Finance ainda não configurado</AlertTitle>
            <AlertDescription>
              Enquanto nenhuma fonte for escolhida, a sincronização não traz nada. Escolha “Meu Pluggy” para usar seus
              bancos (depois cole as credenciais e adicione os bancos) ou “Dados de exemplo” para conhecer o app.
            </AlertDescription>
          </Alert>
        )}
        {view.readOnly && <Note>{READ_ONLY_HINT} Abaixo, um estado de exemplo.</Note>}

        <div className="divide-y">
          <Subsection
            id={`${id}-mode`}
            step={1}
            done={view.steps.mode}
            title="Fonte dos dados"
            description="De onde vêm contas, transações e faturas. Trocar apaga os dados sincronizados da fonte anterior; o planejamento fica."
          >
            <ModeChoice view={view} />
          </Subsection>

          <Subsection
            id={`${id}-credentials`}
            step={2}
            done={view.steps.credentials}
            title="Credenciais da Pluggy"
            description="Client ID e Client Secret da sua aplicação na Pluggy. O Meu Caixa testa com a Pluggy antes de salvar."
          >
            <CredentialsPanel view={view} />
          </Subsection>

          <Subsection
            id={`${id}-items`}
            step={3}
            done={view.steps.items}
            title="Bancos"
            description="Cada banco conectado no Meu Pluggy é um item, com um id próprio. Adicione aqui os que o Meu Caixa deve sincronizar."
          >
            <ItemsPanel view={view} connectUrl={settings.connectUrl} now={now} titleId={`${id}-items-title`} />
          </Subsection>
        </div>
      </CardContent>
    </Card>
  )
}
