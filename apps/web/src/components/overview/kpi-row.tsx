import { AlertTriangle, CreditCard, Gauge, TrendingUp, Wallet } from "lucide-react"
import type { ReactNode } from "react"
import { StatTile } from "@/components/finance/stat-tile"
import { Money } from "@/components/finance/money"
import type { Cents, IsoDate } from "@/lib/api/types"
import type { PeriodTotals } from "@/lib/finance/aggregate"
import { formatDateShort } from "@/lib/format/date"
import { formatMoney, formatPercent } from "@/lib/format/money"

export interface KpiData {
  cash: { total: Cents; accounts: number; stale: number }
  invoice: { total: Cents; dueDate: IsoDate | null }
  credit: { available: Cents; limit: Cents } | null
  month: { totals: PeriodTotals; label: string }
}

/** Valor do tile: um passo menor no celular para caber em duas colunas. */
function TileValue({ children }: { children: ReactNode }) {
  return <span className="text-xl sm:text-2xl">{children}</span>
}

/** No celular (2 colunas estreitas) o ícone sai para o rótulo caber numa linha. */
const iconClass = "text-muted-foreground max-sm:hidden"

export function KpiRow({ data }: { data: KpiData }) {
  const { cash, invoice, credit, month } = data
  const used = credit ? credit.limit - credit.available : 0
  const usedShare = credit && credit.limit > 0 ? used / credit.limit : 0

  return (
    <section aria-label="Indicadores" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <StatTile
        label="Saldo em contas"
        icon={<Wallet className={iconClass} aria-hidden />}
        value={
          <TileValue>
            <Money cents={cash.total} />
          </TileValue>
        }
        hint={
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span>{cash.accounts === 1 ? "1 conta" : `${cash.accounts} contas`}</span>
            {cash.stale > 0 && (
              <span className="inline-flex items-center gap-1">
                <AlertTriangle className="text-status-warning size-3" aria-hidden />
                {cash.stale === 1 ? "1 desatualizada" : `${cash.stale} desatualizadas`}
              </span>
            )}
          </span>
        }
      />
      <StatTile
        label="Fatura em aberto"
        icon={<CreditCard className={iconClass} aria-hidden />}
        value={
          <TileValue>
            <Money cents={invoice.total} />
          </TileValue>
        }
        hint={invoice.dueDate ? `Vence em ${formatDateShort(invoice.dueDate)}` : "Nenhuma fatura em aberto"}
      />
      <StatTile
        label="Limite disponível"
        icon={<Gauge className={iconClass} aria-hidden />}
        value={
          <TileValue>
            {credit ? <Money cents={credit.available} /> : <span className="text-muted-foreground">—</span>}
          </TileValue>
        }
      >
        {credit ? (
          <div className="space-y-1.5 pt-1">
            <div
              role="meter"
              aria-label="Limite do cartão em uso"
              aria-valuemin={0}
              aria-valuemax={credit.limit}
              aria-valuenow={used}
              aria-valuetext={`${formatPercent(usedShare)} em uso`}
              className="bg-chart-1/15 h-1.5 overflow-hidden rounded-full"
            >
              <div className="bg-chart-1 h-full rounded-full" style={{ width: `${Math.min(usedShare, 1) * 100}%` }} />
            </div>
            <p className="text-muted-foreground text-xs">
              {formatPercent(usedShare)} de {formatMoney(credit.limit)} em uso
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">Nenhum cartão conectado</p>
        )}
      </StatTile>
      <StatTile
        label="Resultado do mês"
        icon={<TrendingUp className={iconClass} aria-hidden />}
        value={
          <TileValue>
            <Money cents={month.totals.net} tone="flow" />
          </TileValue>
        }
        hint={
          <span className="flex flex-col gap-0.5">
            <span>{month.label}</span>
            <span>
              Entradas {formatMoney(month.totals.income)} · gastos {formatMoney(month.totals.spending)}
            </span>
          </span>
        }
      />
    </section>
  )
}
