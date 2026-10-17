/**
 * Eixo e rótulos do gráfico da projeção (funções puras, testadas).
 *
 * O domínio sempre inclui o zero (barras partem dele) e os ticks são números
 * "redondos" e distintos (1, 2 ou 5 × 10ⁿ). Isso evita o eixo automático do
 * Recharts repetir o mesmo valor quando todas as barras são iguais.
 */

/** Passo redondo (1, 2 ou 5 × 10ⁿ) mais próximo acima de `raw`. */
export function niceStep(raw: number): number {
  const exponent = Math.floor(Math.log10(raw))
  const magnitude = 10 ** exponent
  const fraction = raw / magnitude
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return nice * magnitude
}

export interface Axis {
  domain: [number, number]
  ticks: number[]
}

/**
 * Domínio e ticks para valores em centavos. `intervals` é o número desejado de
 * faixas (o real pode ser ±1). Se o menor valor é negativo e fica colado no
 * fim do domínio, o domínio desce ~12% além dele (sem novo tick): o rótulo
 * abaixo da barra precisa de espaço.
 */
export function niceAxis(values: number[], intervals = 4, minSpan = 100_00): Axis {
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const span = Math.max(max - min, minSpan)
  const step = niceStep(span / intervals)
  const low = Math.floor(min / step)
  const high = max > 0 || min === 0 ? Math.max(1, Math.ceil(max / step)) : 0
  const top = high * step
  let bottom = low * step
  if (min < 0 && (min - bottom) / (top - bottom) < 0.1) bottom = Math.floor(min - 0.12 * (top - min))
  const first = Math.ceil(bottom / step)
  const ticks = Array.from({ length: high - first + 1 }, (_, i) => (first + i) * step)
  return { domain: [bottom, top], ticks }
}

/**
 * Quais barras ganham o valor escrito: só os extremos (maior e menor sobra).
 * Todas iguais → só a primeira. Os dois do mesmo lado do zero e a menos de
 * `minGap` barras um do outro → só o menor (o mês que pede atenção), para os
 * textos não se sobreporem nem no celular.
 */
export function extremeLabelIndexes(values: number[], minGap = 3): number[] {
  if (values.length === 0) return []
  const max = Math.max(...values)
  const min = Math.min(...values)
  if (max === min) return [0]
  const maxIndex = values.indexOf(max)
  const minIndex = values.indexOf(min)
  const sameSide = (max < 0) === (min < 0)
  if (sameSide && Math.abs(maxIndex - minIndex) < minGap) return [minIndex]
  return [maxIndex, minIndex].sort((a, b) => a - b)
}
