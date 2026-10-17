import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/**
 * Esqueleto da tela de contas, na mesma grade da página: resumo, bancos e, embaixo, faturas e
 * histórico. Sem números nem nomes, para não sugerir dados que ainda não chegaram.
 */

function TileSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("gap-0 py-4", className)}>
      <CardContent className="space-y-2.5 px-4">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-7 w-36 max-w-full" />
        <Skeleton className="h-3 w-40 max-w-full" />
      </CardContent>
    </Card>
  )
}

function AccountRowSkeleton() {
  return (
    <div className="flex items-start gap-3 py-4 last:pb-0">
      <Skeleton className="size-8 shrink-0 rounded-md" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-10" />
      </div>
    </div>
  )
}

function ConnectionSkeleton({ rows }: { rows: number }) {
  return (
    <Card className="gap-4">
      <CardHeader className="flex items-start gap-3">
        <Skeleton className="size-10 shrink-0 rounded-lg" />
        <div className="flex-1 space-y-2 pt-0.5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-48 max-w-full" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="divide-y border-t">
          {Array.from({ length: rows }, (_, index) => (
            <AccountRowSkeleton key={index} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export default function Loading() {
  return (
    <div className="@container/page space-y-6" aria-busy="true">
      <span role="status" className="sr-only">
        Carregando as contas…
      </span>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-8 w-40" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 @min-[60rem]/page:grid-cols-3">
        <TileSkeleton className="col-span-2 @min-[60rem]/page:col-span-1" />
        <TileSkeleton />
        <TileSkeleton />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 @2xl/page:grid-cols-2">
        <ConnectionSkeleton rows={2} />
        <ConnectionSkeleton rows={1} />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 @min-[60rem]/page:grid-cols-2">
        {["h-64", "h-24"].map((height) => (
          <Card key={height}>
            <CardHeader className="gap-2">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-3 w-64 max-w-full" />
            </CardHeader>
            <CardContent>
              <Skeleton className={`${height} w-full`} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
