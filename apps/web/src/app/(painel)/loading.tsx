import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Esqueleto neutro para as rotas sem loading.tsx próprio: título e cards
 * genéricos, sem imitar a grade de nenhuma tela. A visão geral tem o seu em
 * app/(overview)/loading.tsx.
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <span role="status" className="sr-only">
        Carregando…
      </span>
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      {["h-40", "h-64"].map((height) => (
        <Card key={height}>
          <CardHeader className="gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </CardHeader>
          <CardContent>
            <Skeleton className={`${height} w-full`} />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
