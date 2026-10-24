import type { Metadata } from "next"
import { ShieldAlert } from "lucide-react"
import { ExportForm } from "@/components/export/export-form"
import { defaultPeriodFor } from "@/components/export/period"
import { PageHeader } from "@/components/page-header"
import { loadOrNull } from "@/components/shell/fail-soft"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { EXPORT_FORMATS, EXPORT_MAX_MONTHS, EXPORT_SECTIONS, type ExportOptions } from "@/lib/api/export"
import { CAN_WRITE, getExportOptions, getToday } from "@/lib/data"

export const metadata: Metadata = { title: "Exportar" }

/**
 * Se `GET /api/export/options` falhar, a tela monta o pedido com o catálogo do contrato; o próprio
 * download avisa se a API estiver mesmo fora.
 */
async function loadOptions(): Promise<ExportOptions> {
  const options = await loadOrNull("as opções da exportação", getExportOptions)
  if (options && options.formats.length > 0 && options.sections.length > 0) return options
  return {
    formats: EXPORT_FORMATS,
    sections: EXPORT_SECTIONS,
    defaultPeriod: defaultPeriodFor(await getToday()),
    maxMonths: EXPORT_MAX_MONTHS,
  }
}

export default async function Page() {
  const options = await loadOptions()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exportar"
        description="Tudo num arquivo: para abrir no Excel ou no Google Sheets, imprimir em PDF ou colar o Markdown numa conversa com uma IA."
      />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,48rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Montar o arquivo</h2>
            </CardTitle>
            <CardDescription>Escolha o formato, o período e o que entra. O arquivo sai na hora.</CardDescription>
          </CardHeader>
          <CardContent>
            <ExportForm options={options} readOnly={!CAN_WRITE} />
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Perguntar a uma IA</h2>
              </CardTitle>
              <CardDescription>Funciona com qualquer uma, sem a chave da Anthropic.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="text-muted-foreground list-decimal space-y-2 pl-5 text-sm">
                <li>
                  Escolha <span className="text-foreground">Markdown (.md)</span>.
                </li>
                <li>
                  Clique em <span className="text-foreground">Copiar para a área de transferência</span> (ou baixe
                  o arquivo e anexe).
                </li>
                <li>
                  Cole numa conversa com o <span className="text-foreground">ChatGPT</span>, o{" "}
                  <span className="text-foreground">Claude.ai</span> ou o{" "}
                  <span className="text-foreground">Gemini</span> e pergunte, por exemplo: “onde dá para cortar
                  gastos?”.
                </li>
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Antes de compartilhar</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-muted-foreground flex gap-3 text-sm">
                <ShieldAlert className="text-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                <p>
                  O arquivo leva seus saldos, transações e nomes de quem pagou ou recebeu. Envie só para pessoas
                  e serviços em que você confia.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
