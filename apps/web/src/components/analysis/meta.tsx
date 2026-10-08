import { Droplets, Flame, Lightbulb, Scissors, type LucideIcon } from "lucide-react"
import type { Insight, InsightKind } from "@/lib/api/analysis"
import { cn } from "@/lib/utils"

/**
 * Metadados de apresentação da análise. Módulo comum (sem "use client") para
 * valer em Server e Client Components.
 */

export const KIND: Record<InsightKind, { title: string; singular: string; description: string; icon: LucideIcon }> = {
  SIN: {
    title: "Gastos do pecado",
    singular: "Gasto do pecado",
    description: "Supérfluos recorrentes: pequenos prazeres que viraram rotina.",
    icon: Flame,
  },
  LEAK: {
    title: "Vazamentos",
    singular: "Vazamento",
    description: "Assinaturas esquecidas e tarifas que saem todo mês sem você notar.",
    icon: Droplets,
  },
  CUT: {
    title: "O que cortar",
    singular: "Corte possível",
    description: "Gastos que dá para reduzir sem abrir mão do hábito.",
    icon: Scissors,
  },
  SUGGESTION: {
    title: "Sugestões de planejamento",
    singular: "Sugestão de planejamento",
    description: "Como fazer a economia trabalhar a favor das suas metas.",
    icon: Lightbulb,
  },
}

type Confidence = Insight["confidence"]

const CONFIDENCE: Record<Confidence, { label: string; level: number }> = {
  HIGH: { label: "Confiança alta", level: 3 },
  MEDIUM: { label: "Confiança média", level: 2 },
  LOW: { label: "Confiança baixa", level: 1 },
}

/** Três barras crescentes; as acesas dizem o nível (a forma carrega o sentido, não a cor). */
function ConfidenceIcon({ level, className }: { level: number; className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={cn("size-3", className)} aria-hidden>
      {[0, 1, 2].map((bar) => (
        <rect
          key={bar}
          x={1 + bar * 4}
          y={8 - bar * 3}
          width={2}
          height={3 + bar * 3}
          rx={0.5}
          fill="currentColor"
          opacity={bar < level ? 1 : 0.25}
        />
      ))}
    </svg>
  )
}

/** Confiança do insight: ícone de nível + rótulo. */
export function ConfidenceLabel({ confidence, className }: { confidence: Confidence; className?: string }) {
  const { label, level } = CONFIDENCE[confidence]
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <ConfidenceIcon level={level} className="text-foreground" />
      {label}
    </span>
  )
}
