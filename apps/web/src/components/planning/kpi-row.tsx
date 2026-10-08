import { AlertTriangle, CalendarClock, PiggyBank, ShoppingBasket, Wallet } from "lucide-react"
import type { ReactNode } from "react"
import { Money } from "@/components/finance/money"
import { StatTile } from "@/components/finance/stat-tile"
import type { Cents } from "@/lib/api/types"
import { formatPercent } from "@/lib/format/money"
import { plural } from "./model"
import { TIGHT_MARGIN } from "./styles"

export interface PlanningKpis {
  commitments: { total: Cents; count: number; incomeShare: number | null }
  goals: { total: Cents; count: number }
  variableSpending: Cents | null
  nextMonth: { label: string; balance: Cents; income: Cents } | null
}

/** Valor do tile: um passo menor no celular para caber em duas colunas. */
function TileValue({ children }: { children: ReactNode }) {
  return <span className="text-xl sm:text-2xl">{children}</span>
}

/** Em tile estreito (celular, tablet ou 4 colunas a 1280px) o ícone sai para o rótulo caber numa linha. */
const iconClass = "text-muted-foreground @max-[16.5rem]/tile:hidden"

/**
 * Abaixo de ~230px os rótulos mais longos quebram em duas linhas: a linha do
 * rótulo reserva duas linhas em todos os tiles para os valores ficarem alinhados.
 */
const tileClass =
  "@container/tile @max-[230px]/tile:[&_[data-slot=card-content]>div:first-child]:min-h-10 @max-[230px]/tile:[&_[data-slot=card-content]>div:first-child]:items-start"

function BalanceHint({ balance }: { balance: Cents }) {
  if (balance < 0) {
    return (
      <span className="inline-flex items-center gap-1">
        <AlertTriangle className="text-status-critical size-3 shrink-0" aria-hidden />
        No vermelho
      </span>
    )
  }
  if (balance < TIGHT_MARGIN) {
    return (
      <span className="inline-flex items-center gap-1">
        <AlertTriangle className="text-status-warning size-3 shrink-0" aria-hidden />
        Margem apertada
      </span>
    )
  }
  return null
}

export function KpiRow({ data }: { data: PlanningKpis }) {
  const { commitments, goals, variableSpending, nextMonth } = data

  return (
    <section aria-label="Indicadores do planejamento" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <StatTile
        className={tileClass}
        label="Compromissos fixos"
        icon={<CalendarClock className={iconClass} aria-hidden />}
        value={
          <TileValue>
            <Money cents={commitments.total} />
          </TileValue>
        }
        hint={
          commitments.incomeShare !== null
            ? `Por mês · ${formatPercent(commitments.incomeShare)} da renda prevista`
            : `Por mês · ${plural(commitments.count, "compromisso", "compromissos")}`
        }
      />
      <StatTile
        className={tileClass}
        label="Aportes em metas"
        icon={<PiggyBank className={iconClass} aria-hidden />}
        value={
          <TileValue>
            <Money cents={goals.total} />
          </TileValue>
        }
        hint={goals.count > 0 ? `Por mês · ${plural(goals.count, "meta", "metas")}` : "Nenhuma meta cadastrada"}
      />
      <StatTile
        className={tileClass}
        label="Gasto variável médio"
        icon={<ShoppingBasket className={iconClass} aria-hidden />}
        value={
          <TileValue>
            {variableSpending !== null ? (
              <Money cents={variableSpending} />
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </TileValue>
        }
        hint="Por mês · sem os compromissos"
      />
      <StatTile
        className={tileClass}
        label={nextMonth ? `Sobra prevista em ${nextMonth.label}` : "Sobra prevista"}
        icon={<Wallet className={iconClass} aria-hidden />}
        value={
          <TileValue>
            {nextMonth ? <Money cents={nextMonth.balance} /> : <span className="text-muted-foreground">—</span>}
          </TileValue>
        }
        hint={
          nextMonth ? (
            <span className="flex flex-col gap-0.5">
              <BalanceHint balance={nextMonth.balance} />
              <span>
                Renda prevista de <Money cents={nextMonth.income} />
              </span>
            </span>
          ) : (
            "Sem projeção disponível"
          )
        }
      />
    </section>
  )
}
