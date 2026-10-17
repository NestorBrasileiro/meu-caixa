import type { Metadata } from "next"
import { PageHeader } from "@/components/page-header"
import { OpenFinanceCard } from "@/components/settings/open-finance-card"
import { CAN_WRITE, getNow, getOpenFinanceSettings } from "@/lib/data"

export const metadata: Metadata = { title: "Configurações" }

/**
 * Configurações do Meu Caixa. Hoje só o Open Finance; cada assunto novo entra como mais um cartão
 * na mesma coluna.
 */
export default async function Page() {
  const [settings, now] = await Promise.all([getOpenFinanceSettings(), getNow()])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Configurações" description="Como o Meu Caixa se conecta aos seus bancos." />
      <OpenFinanceCard settings={settings} now={now} canWrite={CAN_WRITE} />
    </div>
  )
}
