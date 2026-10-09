import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

function CardSkeleton({ bodyClassName }: { bodyClassName: string }) {
  return (
    <Card>
      <CardHeader className="gap-2">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-3 w-72 max-w-full" />
      </CardHeader>
      <CardContent>
        <Skeleton className={bodyClassName} />
      </CardContent>
    </Card>
  )
}

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando planejamento">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-8 w-32" />
      </div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="gap-0 py-4">
            <CardContent className="space-y-2 px-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-7 w-32 max-w-full" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <CardSkeleton bodyClassName="h-[380px] w-full" />
        <div className="grid content-start gap-4 lg:grid-cols-2 xl:grid-cols-1">
          <CardSkeleton bodyClassName="h-[160px] w-full" />
          <CardSkeleton bodyClassName="h-[160px] w-full" />
        </div>
      </div>
      <CardSkeleton bodyClassName="h-[260px] w-full" />
      <CardSkeleton bodyClassName="h-[300px] w-full" />
    </div>
  )
}
