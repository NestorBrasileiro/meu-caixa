import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

/** Esqueleto das configurações: cabeçalho e o cartão do Open Finance com os três passos. */
function SubsectionSkeleton({ rows }: { rows: number }) {
  return (
    <div className="grid gap-4 py-6 first:pt-0 last:pb-0 md:grid-cols-[15rem_minmax(0,1fr)] md:gap-8">
      <div className="flex gap-3">
        <Skeleton className="size-6 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2 pt-0.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48 max-w-full" />
          <Skeleton className="h-3 w-40 max-w-full" />
        </div>
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </div>
    </div>
  )
}

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6" aria-busy="true">
      <span role="status" className="sr-only">
        Carregando as configurações…
      </span>
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Card>
        <CardHeader className="gap-2">
          <Skeleton className="h-5 w-56 max-w-full" />
          <Skeleton className="h-3 w-full max-w-xl" />
          <Skeleton className="h-3 w-3/4 max-w-md" />
        </CardHeader>
        <CardContent className="divide-y">
          <SubsectionSkeleton rows={1} />
          <SubsectionSkeleton rows={2} />
          <SubsectionSkeleton rows={2} />
        </CardContent>
      </Card>
    </div>
  )
}
