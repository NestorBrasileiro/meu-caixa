import type { Metadata } from "next"
import { ChevronRight, EyeOff, Landmark, Repeat, Settings, TrendingUp, Zap } from "lucide-react"
import Link from "next/link"
import { Money } from "@/components/finance/money"
import { StatTile } from "@/components/finance/stat-tile"
import { PageHeader } from "@/components/page-header"
import { plural } from "@/components/planning/model"
import { headerSummary, recentIncreases } from "@/components/subscriptions/model"
import { SubscriptionList } from "@/components/subscriptions/subscription-list"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { CAN_WRITE, getBudgetCategories, getConnections, getSubscriptions, getToday } from "@/lib/data"

export const metadata: Metadata = { title: "Assinaturas" }

export default async function Page() {
  const today = await getToday()
  const [overview, categories, connections] = await Promise.all([
    getSubscriptions(),
    // Só para o formulário de "Adicionar ao planejamento": sem elas, a página abre igual.
    getBudgetCategories().catch(() => []),
    getConnections(),
  ])
  const readOnly = !CAN_WRITE
  const shared = { categories, today, readOnly }

  if (connections.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Assinaturas" description={headerSummary(overview)} />
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Landmark aria-hidden />
            </EmptyMedia>
            <EmptyTitle>
              <h2>Nenhum banco conectado</h2>
            </EmptyTitle>
            <EmptyDescription>
              As assinaturas aparecem sozinhas a partir das suas transações. Cadastre a sua Pluggy em Configurações e
              sincronize em Contas.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button size="sm" asChild>
              <Link href="/configuracoes">
                <Settings aria-hidden />
                Abrir Configurações
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    )
  }

  const increases = recentIncreases(overview)
  const othersMonthly = overview.others.reduce((sum, item) => sum + item.monthlyCost, 0)

  return (
    <div className="space-y-6">
      <PageHeader title="Assinaturas" description={headerSummary(overview)} />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatTile
          label="Por mês"
          value={<Money cents={overview.totals.monthly} />}
          hint={plural(overview.totals.active, "assinatura ativa", "assinaturas ativas")}
          icon={<Repeat aria-hidden />}
        />
        <StatTile
          label="Por ano"
          value={<Money cents={overview.totals.yearly} />}
          hint="Se nada mudar nos próximos 12 meses"
        />
        <StatTile
          label="Aumentos recentes"
          value={increases.length}
          hint={increases.length > 0 ? increases.map((item) => item.name).join(", ") : "Nenhum preço subiu"}
          icon={<TrendingUp className={increases.length > 0 ? "text-status-warning" : undefined} aria-hidden />}
        />
        <StatTile
          label="Contas variáveis"
          value={<Money cents={othersMonthly} />}
          hint={`${plural(overview.others.length, "conta", "contas")} · média por mês`}
          icon={<Zap aria-hidden />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Assinaturas</h2>
          </CardTitle>
          <CardDescription>
            Cobranças de valor fixo que se repetem todo mês, da maior para a menor. Tem algo que não é assinatura? Use o
            menu da linha.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {overview.subscriptions.length === 0 ? (
            <Empty className="border p-6 md:p-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Repeat aria-hidden />
                </EmptyMedia>
                <EmptyTitle className="text-base">Nenhuma assinatura encontrada</EmptyTitle>
                <EmptyDescription>
                  Uma cobrança aparece aqui quando se repete com o mesmo valor em pelo menos dois meses. Se alguma das
                  cobranças variáveis abaixo for assinatura, marque pelo menu.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <SubscriptionList items={overview.subscriptions} section="active" label="Assinaturas ativas" {...shared} />
          )}
        </CardContent>
      </Card>

      {overview.others.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Outras cobranças recorrentes</h2>
            </CardTitle>
            <CardDescription>
              Todo mês, mas com valor que muda (luz, água, celular por consumo, cobranças em dólar). Valor mostrado: a
              média dos meses fechados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SubscriptionList items={overview.others} section="other" label="Outras cobranças recorrentes" {...shared} />
          </CardContent>
        </Card>
      )}

      {overview.stopped.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Pararam de cobrar</h2>
            </CardTitle>
            <CardDescription>
              Sem cobrança há mais de 40 dias: confirma um cancelamento ou avisa de um atraso.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SubscriptionList items={overview.stopped} section="stopped" label="Assinaturas que pararam de cobrar" {...shared} />
          </CardContent>
        </Card>
      )}

      {overview.hidden.length > 0 && (
        <details className="group rounded-xl border px-4 py-3">
          <summary className="text-muted-foreground flex cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
            <EyeOff className="size-4" aria-hidden />
            {plural(overview.hidden.length, "cobrança oculta", "cobranças ocultas")}
          </summary>
          <div className="mt-2">
            <SubscriptionList items={overview.hidden} section="hidden" label="Cobranças ocultas" {...shared} />
          </div>
        </details>
      )}
    </div>
  )
}
