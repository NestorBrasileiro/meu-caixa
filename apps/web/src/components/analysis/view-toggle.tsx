"use client"

import { BarChart3, Table2 } from "lucide-react"
import { TabsList, TabsTrigger } from "@/components/ui/tabs"

/**
 * Alterna gráfico e tabela (o equivalente acessível do gráfico). Usar dentro
 * de <Tabs>. No celular os rótulos ficam só para leitores de tela.
 */
export function ViewToggle() {
  return (
    <TabsList aria-label="Modo de exibição" className="h-8">
      <TabsTrigger value="chart" className="px-2 text-xs" title="Gráfico">
        <BarChart3 className="size-3.5" aria-hidden />
        <span className="max-sm:sr-only">Gráfico</span>
      </TabsTrigger>
      <TabsTrigger value="table" className="px-2 text-xs" title="Tabela">
        <Table2 className="size-3.5" aria-hidden />
        <span className="max-sm:sr-only">Tabela</span>
      </TabsTrigger>
    </TabsList>
  )
}
