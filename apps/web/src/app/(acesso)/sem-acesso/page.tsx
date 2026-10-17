import { ShieldAlert } from "lucide-react"
import type { Metadata } from "next"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

export const metadata: Metadata = { title: "Sem acesso" }

/** A API responde 403 quando o usuário logado não tem a role exigida. */
export default function Page() {
  return (
    <Empty className="max-w-md">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ShieldAlert />
        </EmptyMedia>
        <EmptyTitle>
          <h1>Sem acesso aos dados</h1>
        </EmptyTitle>
        <EmptyDescription>
          Você entrou, mas sua conta não tem permissão para ver as finanças deste painel. Peça para incluírem a role{" "}
          <code>owner</code> no seu usuário do Keycloak.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild variant="outline">
          <a href="/auth/logout">Entrar com outra conta</a>
        </Button>
      </EmptyContent>
    </Empty>
  )
}
