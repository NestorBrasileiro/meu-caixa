import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

/** Mesma grade da página: coluna flexível + coluna lateral de 22rem no desktop. */
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

function GroupSkeleton({ cards }: { cards: number }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="size-8" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-64 max-w-full" />
        </div>
      </div>
      {Array.from({ length: cards }, (_, index) => (
        <InsightSkeleton key={index} />
      ))}
    </div>
  )
}

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando a análise do Claude">
      {/* Título, descrição e "Gerar nova análise", como o PageHeader. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-8 w-44" />
      </div>

      {/* Herói + "Para onde vai o dinheiro" */}
      <div className={`${COLUMNS} gap-4`}>
        <Card className="@container justify-center">
          <CardContent className="grid gap-6 @2xl:grid-cols-[auto_minmax(0,1fr)] @2xl:gap-8">
            <div className="space-y-3">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-12 w-56 max-w-full" />
              <Skeleton className="h-3 w-48" />
            </div>
            <div className="space-y-3 @2xl:border-l @2xl:pl-8">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="gap-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-52" />
          </CardHeader>
          <CardContent className="flex-1 space-y-4">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </CardContent>
          <CardFooter className="border-t [.border-t]:pt-4">
            <Skeleton className="h-4 w-full" />
          </CardFooter>
        </Card>
      </div>

      {/* Grupos de insights em duas colunas de largura total */}
      <div className="grid gap-6 xl:grid-cols-2 xl:items-start xl:gap-x-4">
        <div className="space-y-6">
          <GroupSkeleton cards={1} />
          <GroupSkeleton cards={2} />
        </div>
        <div className="space-y-6">
          <GroupSkeleton cards={2} />
          <GroupSkeleton cards={1} />
        </div>
      </div>

      {/* "De onde vem a economia" + "Pergunte ao Claude" */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="xl:self-start">
          <CardHeader className="gap-2">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-3 w-56" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-44 w-full" />
          </CardContent>
          <CardFooter className="border-t [.border-t]:pt-4">
            <Skeleton className="h-4 w-full" />
          </CardFooter>
        </Card>
        <Card>
          <CardContent className="flex flex-1 flex-col gap-4">
            <div className="flex items-start gap-3">
              <Skeleton className="size-8 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
            <Skeleton className="min-h-28 w-full flex-1" />
          </CardContent>
          <CardFooter className="border-t [.border-t]:pt-4">
            <Skeleton className="h-3 w-48" />
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
