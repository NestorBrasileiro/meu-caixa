import { describe, expect, it } from "vitest"
import { formatAxisMoney } from "@/lib/format/money"
import { extremeLabelIndexes, niceAxis, niceStep } from "./chart-axis"

const distinctLabels = (ticks: number[]) => new Set(ticks.map(formatAxisMoney)).size === ticks.length

describe("planning/chart-axis: eixo", () => {
  it("passos redondos 1, 2 ou 5 × 10ⁿ", () => {
    expect(niceStep(61_954)).toBe(100_000)
    expect(niceStep(1_500)).toBe(2_000)
    expect(niceStep(4_200)).toBe(5_000)
    expect(niceStep(1_000)).toBe(1_000)
  })

  it("barras positivas iguais: parte do zero com ticks distintos", () => {
    const axis = niceAxis(Array(6).fill(2_478_17))
    expect(axis).toEqual({ domain: [0, 3_000_00], ticks: [0, 1_000_00, 2_000_00, 3_000_00] })
  })

  it("barras negativas iguais: não repete −3,9 mil e deixa espaço para o rótulo abaixo", () => {
    const axis = niceAxis(Array(6).fill(-3_855_90))
    expect(axis.ticks).toEqual([-4_000_00, -3_000_00, -2_000_00, -1_000_00, 0])
    expect(distinctLabels(axis.ticks)).toBe(true)
    // ~12% abaixo da barra, sem criar um tick a mais
    expect(axis.domain[1]).toBe(0)
    expect(axis.domain[0]).toBeLessThan(-4_000_00)
    expect(axis.domain[0]).toBeGreaterThan(-4_500_00)
  })

  it("valores dos dois lados do zero", () => {
    const axis = niceAxis([2_478_17, -1_200_00, 900_00])
    expect(axis.ticks).toContain(0)
    expect(axis.domain[0]).toBeLessThan(-1_200_00)
    expect(axis.domain[1]).toBeGreaterThanOrEqual(2_478_17)
    expect(distinctLabels(axis.ticks)).toBe(true)
  })

  it("tudo zero ainda tem um eixo legível", () => {
    expect(niceAxis([0, 0, 0])).toEqual({ domain: [0, 50_00], ticks: [0, 50_00] })
  })

  it("rótulos sempre distintos e o zero sempre presente", () => {
    for (const values of [[12_34], [999_99, 1_000_00], [-50_00, 10], [1_234_567_89], [-7_10, -7_00], [3_050_00]]) {
      const axis = niceAxis(values)
      expect(axis.ticks, String(values)).toContain(0)
      expect(distinctLabels(axis.ticks), String(values)).toBe(true)
      expect(axis.domain[0], String(values)).toBeLessThanOrEqual(Math.min(0, ...values))
      expect(axis.domain[1], String(values)).toBeGreaterThanOrEqual(Math.max(0, ...values))
      expect(axis.ticks.every((tick) => tick >= axis.domain[0] && tick <= axis.domain[1]), String(values)).toBe(true)
      expect(axis.ticks.length, String(values)).toBeLessThanOrEqual(7)
    }
  })
})

describe("planning/chart-axis: rótulos", () => {
  it("todas iguais: um rótulo só", () => {
    expect(extremeLabelIndexes(Array(6).fill(-3_855_90))).toEqual([0])
  })

  it("rotula maior e menor quando estão longe", () => {
    expect(extremeLabelIndexes([100, 200, 300, 250, 120, 50])).toEqual([2, 5])
  })

  it("lados opostos do zero nunca colidem, mesmo vizinhos", () => {
    expect(extremeLabelIndexes([100, 300, -200, 50])).toEqual([1, 2])
  })

  it("vizinhos do mesmo lado: só o menor (o mês que pede atenção)", () => {
    expect(extremeLabelIndexes([100, 300, 280, 50, 290, 299])).toEqual([3])
    expect(extremeLabelIndexes([-100, -300, -280, -50])).toEqual([1])
  })

  it("sem dados, sem rótulos", () => {
    expect(extremeLabelIndexes([])).toEqual([])
  })
})
