import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

/** Mesma grade da página: formulário de até 42rem + coluna de ajuda no desktop. */
const COLUMNS = "grid gap-4 xl:grid-cols-[minmax(0,42rem)_minmax(0,1fr)]"

function SectionSkeleton({ fields }: { fields: number }) {
  return (
    <div className={COLUMNS}>
      <Card>
        <CardHeader className="gap-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-24" />
          </div>
          <Skeleton className="h-3 w-80 max-w-full" />
        </CardHeader>
        <CardContent className="space-y-5">
          {Array.from({ length: fields }, (_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
          <Skeleton className="h-9 w-24" />
        </CardContent>
      </Card>
      <Card className="h-fit">
        <CardHeader>
          <Skeleton className="h-5 w-44" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Esqueleto de Configurações (Pluggy, Claude e token do MCP). Também é a
 * fronteira de Suspense da rota: sem ela, navegar para cá bloqueia esperando a API.
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <span role="status" className="sr-only">
        Carregando configurações…
      </span>
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <SectionSkeleton fields={3} />
      <SectionSkeleton fields={2} />
      <SectionSkeleton fields={0} />
    </div>
  )
}
