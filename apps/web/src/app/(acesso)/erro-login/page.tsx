import { TriangleAlert } from "lucide-react"
import type { Metadata } from "next"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

export const metadata: Metadata = { title: "Não foi possível entrar" }

/**
 * Quando o callback do Keycloak falha, a API volta para `/?authError=…` e o
 * next.config redireciona para cá. Sem esta parada, o painel tentaria logar de
 * novo sozinho e, com o SSO ativo, entraria em loop.
 */
export default function Page() {
  return (
    <Empty className="max-w-md">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <TriangleAlert />
        </EmptyMedia>
        <EmptyTitle>
          <h1>Não foi possível entrar</h1>
        </EmptyTitle>
        <EmptyDescription>
          O login no Keycloak não foi concluído. Tente de novo; se continuar falhando, saia e entre com a conta outra
          vez.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center">
        <Button asChild>
          <a href="/auth/login">Tentar de novo</a>
        </Button>
        <Button asChild variant="outline">
          <a href="/auth/logout">Sair</a>
        </Button>
      </EmptyContent>
    </Empty>
  )
}
