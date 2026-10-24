import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

/** Esqueleto da exportação, na grade da página: o formulário à esquerda e as dicas ao lado. */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <span role="status" className="sr-only">
        Carregando a exportação…
      </span>

      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-[32rem] max-w-full" />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,48rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="gap-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Skeleton className="h-4 w-16" />
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="h-[4.25rem] w-full rounded-lg" />
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <Skeleton className="h-4 w-16" />
              <div className="flex flex-wrap gap-2">
                {["w-20", "w-32", "w-32", "w-32", "w-28"].map((width, index) => (
                  <Skeleton key={index} className={`h-8 ${width} rounded-md`} />
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <Skeleton className="h-4 w-24" />
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 8 }, (_, index) => (
                  <div key={index} className="flex gap-3">
                    <Skeleton className="size-4 shrink-0 rounded-[4px]" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-28" />
                      <Skeleton className="h-3 w-48 max-w-full" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <Skeleton className="h-9 w-40" />
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
          {["h-28", "h-16"].map((height) => (
            <Card key={height}>
              <CardHeader className="gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56 max-w-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className={`${height} w-full`} />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
