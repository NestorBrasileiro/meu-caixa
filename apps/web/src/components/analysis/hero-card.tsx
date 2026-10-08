import { Sparkles } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import type { Cents } from "@/lib/api/types"
import { formatMoney } from "@/lib/format/money"
import { cn } from "@/lib/utils"
import { plural } from "./model"

/**
 * Abertura do relatório: a economia mensal possível é o número herói da
 * página; ao lado, a frase-resumo e o parágrafo do Claude.
 */
export function HeroCard({
  monthlySavings,
  suggestions,
  headline,
  summary,
  className,
}: {
  monthlySavings: Cents
  /** Quantas sugestões têm economia estimada. */
  suggestions: number
  headline: string
  summary: string
  className?: string
}) {
  return (
    <Card className={cn("@container justify-center", className)}>
      <CardContent className="grid gap-6 @xl:grid-cols-[auto_minmax(0,1fr)] @xl:gap-8">
        <div className="space-y-2">
          <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <Sparkles className="size-4" aria-hidden />
            Economia possível por mês
          </p>
          <p className="text-5xl font-semibold tracking-tight whitespace-nowrap">{formatMoney(monthlySavings)}</p>
          <p className="text-muted-foreground text-sm">
            <span className="whitespace-nowrap">{formatMoney(monthlySavings * 12)} por ano</span>
            {suggestions > 0 && (
              <>
                {" · "}
                <span className="whitespace-nowrap">em {plural(suggestions, "sugestão", "sugestões")}</span>
              </>
            )}
          </p>
        </div>
        <div className="space-y-2 @xl:border-l @xl:pl-8">
          <p className="text-lg leading-snug font-medium text-balance">{headline}</p>
          <p className="text-muted-foreground text-sm leading-relaxed text-pretty">{summary}</p>
        </div>
      </CardContent>
    </Card>
  )
}
