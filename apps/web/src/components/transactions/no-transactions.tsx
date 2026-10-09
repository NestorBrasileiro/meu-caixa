import { Landmark, RefreshCw } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import type { NoDataReason } from "./model"

const COPY: Record<NoDataReason, { title: string; description: string }> = {
  "no-accounts": {
    title: "Nenhum banco conectado ainda",
    description:
      "Conecte um banco em Contas. Depois da primeira sincronização, os lançamentos dos últimos 12 meses aparecem aqui.",
  },
  "not-synced": {
    title: "Nada sincronizado ainda",
    description:
      "Suas contas estão conectadas, mas a sincronização ainda não trouxe lançamentos dos últimos 12 meses. Acompanhe ou sincronize de novo em Contas.",
  },
}

/** Usuário sem nenhum lançamento: no lugar de filtros e totais vazios, diz o que falta e onde resolver. */
export function NoTransactions({ reason }: { reason: NoDataReason }) {
  const { title, description } = COPY[reason]
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
          <Link href="/contas">Ir para Contas</Link>
        </Button>
      </EmptyContent>
    </Empty>
  )
}
