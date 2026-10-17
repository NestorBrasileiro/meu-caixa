import { Landmark, RefreshCw } from "lucide-react"
import Link from "next/link"
import { SETTINGS_HREF } from "@/components/settings/open-finance"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import type { NoDataReason } from "./model"

const COPY: Record<NoDataReason, { title: string; description: string; href: string; action: string }> = {
  "no-accounts": {
    title: "Nenhum banco conectado ainda",
    description:
      "Conecte seus bancos nas configurações do Open Finance. Depois da primeira sincronização, os lançamentos dos últimos 12 meses aparecem aqui.",
    href: SETTINGS_HREF,
    action: "Configurar Open Finance",
  },
  "not-synced": {
    title: "Nada sincronizado ainda",
    description:
      "Suas contas estão conectadas, mas a sincronização ainda não trouxe lançamentos dos últimos 12 meses. Acompanhe ou sincronize de novo em Contas.",
    href: "/contas",
    action: "Ir para Contas",
  },
}

/** Usuário sem nenhum lançamento: no lugar de filtros e totais vazios, diz o que falta e onde resolver. */
export function NoTransactions({ reason }: { reason: NoDataReason }) {
  const { title, description, href, action } = COPY[reason]
  const Icon = reason === "no-accounts" ? Landmark : RefreshCw
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline" size="sm" asChild>
          <Link href={href}>{action}</Link>
        </Button>
      </EmptyContent>
    </Empty>
  )
}
