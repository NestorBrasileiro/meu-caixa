"use client"

import { CloudOff, RotateCw } from "lucide-react"
import { useEffect, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"

/**
 * Falha ao carregar uma tela do painel (API fora do ar, Keycloak indisponível, um 5xx). Fica dentro da
 * moldura (menu lateral e cabeçalho continuam) e oferece tentar de novo: `retry` busca os dados no
 * servidor outra vez e, se der certo, a tela volta no lugar da mensagem.
 *
 * Em produção a mensagem de um erro do servidor é genérica (o Next não repassa detalhes); o `digest`
 * liga o que o usuário vê ao log do servidor.
 */
export default function PainelError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [retrying, startTransition] = useTransition()

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <Empty className="min-h-[60vh] border" role="alert">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CloudOff aria-hidden />
        </EmptyMedia>
        <EmptyTitle>
          <h1>Não foi possível carregar os dados</h1>
        </EmptyTitle>
        <EmptyDescription>
          A API pode estar fora do ar ou reiniciando. Seus dados continuam guardados; tente de novo em instantes.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => startTransition(() => retry())} disabled={retrying}>
          {retrying ? <Spinner aria-hidden /> : <RotateCw aria-hidden />}
          {retrying ? "Tentando…" : "Tentar de novo"}
        </Button>
        {error.digest && <p className="text-muted-foreground text-xs">Código do erro: {error.digest}</p>}
      </EmptyContent>
    </Empty>
  )
}
