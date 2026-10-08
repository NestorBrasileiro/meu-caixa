/**
 * Classes compartilhadas do planejamento. Módulo comum (sem "use client")
 * para valer em Server e Client Components.
 */

/** Ticks dos eixos no tom de eixo da paleta (o ChartContainer usa muted-foreground). */
export const CHART_AXIS_CLASS = "[&_.recharts-cartesian-axis-tick_text]:fill-chart-axis"

/**
 * No celular a ação do cabeçalho ocupa só a linha do título e a descrição usa
 * a largura toda (o padrão do CardHeader espreme a descrição ao lado da ação).
 */
export const HEADER_ACTION_CLASS = "max-sm:row-end-2"
export const HEADER_DESCRIPTION_CLASS = "max-sm:col-span-2"

/** Abaixo disso a sobra prevista do mês é considerada apertada. */
export const TIGHT_MARGIN: number = 500_00

/** Texto da dica dos botões que só funcionam com a API. */
export const EDIT_SOON = "A edição chega com a API de planejamento (marco de 75%)."
