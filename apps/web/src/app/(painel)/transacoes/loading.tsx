import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Esqueleto da tela de transações: mesma ordem e alturas aproximadas (filtros,
 * resumo, lista por dia), para a página não "pular" quando os dados chegam.
 * Também é a fronteira de Suspense da rota: sem ela, navegar entre as telas do
 * painel bloqueia esperando a API.
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <span role="status" className="sr-only">
        Carregando transações…
      </span>
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>

      <div className="space-y-4">
        <div className="@container/filters space-y-2">
          <div className="grid grid-cols-2 gap-2 @2xl/filters:flex">
            <Skeleton className="col-span-2 h-9 @2xl/filters:flex-1" />
            <Skeleton className="h-9 @2xl/filters:w-60" />
            <Skeleton className="h-9 @2xl/filters:w-44" />
          </div>
          <div className="grid grid-cols-2 gap-2 @2xl/filters:flex @2xl/filters:items-center">
            <Skeleton className="col-span-2 h-9 @2xl/filters:w-52" />
            <Skeleton className="col-span-2 h-9 @2xl/filters:w-52" />
            <Skeleton className="col-span-2 h-9 @2xl/filters:w-40" />
            <Skeleton className="col-span-2 my-2 h-5 w-64" />
          </div>
        </div>

        <Card className="gap-0 overflow-hidden py-0">
          <div className="bg-border grid grid-cols-2 gap-px lg:grid-cols-4">
            {["Lançamentos", "Entradas", "Saídas", "Saldo"].map((cell) => (
              <div key={cell} className="bg-card space-y-2 px-4 py-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-28 max-w-full" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        </Card>

        <Card className="gap-0 overflow-clip py-0">
          {[3, 2, 2].map((rows, day) => (
            <div key={day}>
              <div className="flex items-center justify-between border-b bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))] px-4 py-2.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-16" />
              </div>
              {Array.from({ length: rows }, (_, row) => (
                <div key={row} className="flex items-center gap-3 border-b px-4 py-3">
                  <Skeleton className="size-8 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-40 max-w-full" />
                    <Skeleton className="h-3 w-28 max-w-full" />
                  </div>
                  <Skeleton className="hidden h-5 w-28 rounded-full md:block" />
                  <Skeleton className="h-4 w-20 shrink-0" />
                </div>
              ))}
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}
