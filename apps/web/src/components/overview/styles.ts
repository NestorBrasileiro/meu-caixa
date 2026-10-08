/**
 * Classes compartilhadas da visão geral. Ficam num módulo comum (sem
 * "use client") para valerem também em Server Components: constantes
 * exportadas de um módulo cliente viram referências de cliente no servidor.
 */

/** Ticks dos eixos no tom de eixo da paleta (o ChartContainer usa muted-foreground). */
export const CHART_AXIS_CLASS = "[&_.recharts-cartesian-axis-tick_text]:fill-chart-axis"

/**
 * No celular a ação do cabeçalho ocupa só a linha do título e a descrição usa
 * a largura toda (o padrão do CardHeader espreme a descrição ao lado da ação).
 */
export const HEADER_ACTION_CLASS = "max-sm:row-end-2"
export const HEADER_DESCRIPTION_CLASS = "max-sm:col-span-2"
