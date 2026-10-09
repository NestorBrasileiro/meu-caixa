import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

function CardSkeleton({ className, bodyClassName }: { className?: string; bodyClassName: string }) {
  return (
    <Card className={className}>
      <CardHeader className="gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-64 max-w-full" />
      </CardHeader>
      <CardContent>
        <Skeleton className={bodyClassName} />
      </CardContent>
    </Card>
  )
}

/** Esqueleto da visão geral: mesma grade da página, só para a rota "/". */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <span role="status" className="sr-only">
        Carregando visão geral…
      </span>
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="gap-0 py-4">
            <CardContent className="space-y-2 px-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-32 max-w-full" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <CardSkeleton className="lg:col-span-2 xl:col-span-1" bodyClassName="h-[280px] w-full" />
        <CardSkeleton bodyClassName="h-[280px] w-full" />
        <CardSkeleton
          className="lg:col-span-2 lg:row-start-3 xl:col-span-1 xl:col-start-1 xl:row-start-2"
          bodyClassName="h-[280px] w-full"
        />
        <CardSkeleton className="lg:col-start-2 lg:row-start-2" bodyClassName="h-[280px] w-full" />
      </div>
      <Card>
        <CardHeader className="gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-72 max-w-full" />
        </CardHeader>
        <CardContent className="@container">
          <div className="grid gap-3 @md:grid-cols-2 @5xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full @md:h-24" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
