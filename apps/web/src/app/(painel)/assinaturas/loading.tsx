import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

function RowSkeleton() {
  return (
    <div className="flex items-start gap-3 py-3">
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-44 max-w-full" />
        <Skeleton className="h-3 w-72 max-w-full" />
      </div>
      <div className="space-y-1.5">
        <Skeleton className="ml-auto h-4 w-24" />
        <Skeleton className="h-3 w-28" />
      </div>
    </div>
  )
}

/**
 * Esqueleto de Assinaturas: cabeçalho, quatro indicadores e a lista. Também é
 * a fronteira de Suspense da rota: sem ela, navegar para cá bloqueia esperando a API.
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <span role="status" className="sr-only">
        Carregando assinaturas…
      </span>
      <div className="space-y-2">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Card key={index} className="gap-0 py-4">
            <CardContent className="space-y-2 px-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-32" />
              <Skeleton className="h-3 w-40 max-w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader className="gap-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3 w-96 max-w-full" />
        </CardHeader>
        <CardContent className="divide-y">
          {Array.from({ length: 5 }, (_, index) => (
            <RowSkeleton key={index} />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
