import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

const COLUMNS = "grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem]"

function InsightSkeleton() {
  return (
    <Card className="gap-3 px-5 py-5">
      <Skeleton className="h-4 w-64 max-w-full" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <Skeleton className="mt-2 h-3 w-56 max-w-full" />
    </Card>
  )
}

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando a análise do Claude">
      <div className="space-y-2">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <div className={`${COLUMNS} gap-4`}>
        <Card>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-12 w-56 max-w-full" />
            <Skeleton className="h-3 w-48" />
            <Skeleton className="mt-4 h-5 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="gap-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-40" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-7 w-36" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </Card>
      </div>

      <div className={`${COLUMNS} gap-x-4 gap-y-6`}>
        <div className="space-y-6">
          {[1, 2].map((group) => (
            <div key={group} className="space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="size-8" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-64 max-w-full" />
                </div>
              </div>
              <InsightSkeleton />
              <InsightSkeleton />
            </div>
          ))}
        </div>
        <Card className="self-start">
          <CardHeader className="gap-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-52" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
