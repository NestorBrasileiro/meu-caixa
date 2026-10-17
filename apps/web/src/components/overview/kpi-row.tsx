import { AlertTriangle, CreditCard, Gauge, TrendingUp, Wallet } from "lucide-react"
import type { ReactNode } from "react"
import { StatTile } from "@/components/finance/stat-tile"
import { Money } from "@/components/finance/money"
import type { Cents, IsoDate } from "@/lib/api/types"
import type { PeriodTotals } from "@/lib/finance/aggregate"
import { formatDateShort } from "@/lib/format/date"
import { formatMoney, formatPercent } from "@/lib/format/money"
import { hasPeriodMovement, plural } from "./model"

export interface KpiData {
  cash: { total: Cents; accounts: number; stale: number }
  invoice: { total: Cents; dueDate: IsoDate | null; cards: number }
  credit: { available: Cents; limit: Cents } | null
  month: {
    totals: PeriodTotals
    /** Até que dia do mês corrente há dados. */
    day: number
  }
}

/** Valor do tile: um passo menor no celular para caber em duas colunas. */
function TileValue({ children }: { children: ReactNode }) {
  return <span className="text-xl sm:text-2xl">{children}</span>
}

/** Sem dado para mostrar (nenhuma conta, nenhum cartão): traço em vez de um "R$ 0,00" enganoso. */
function NoValue() {
  return (
    <>
      <span className="text-muted-foreground" aria-hidden>
        —
      </span>
      <span className="sr-only">Sem dados</span>
    </>
  )
}

/** Rótulo e valor que não se separam numa quebra de linha. */
function Pair({ children }: { children: ReactNode }) {
  return <span className="whitespace-nowrap">{children}</span>
}

/** No celular (2 colunas estreitas) o ícone sai para o rótulo caber numa linha. */
const iconClass = "text-muted-foreground max-sm:hidden"

export function KpiRow({ data }: { data: KpiData }) {
  const { cash, invoice, credit, month } = data
  const used = credit ? credit.limit - credit.available : 0
  const usedShare = credit && credit.limit > 0 ? used / credit.limit : 0
  const moved = hasPeriodMovement(month.totals)

  return (
    <section aria-label="Indicadores" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <StatTile
        label="Saldo em contas"
        icon={<Wallet className={iconClass} aria-hidden />}
        value={<TileValue>{cash.accounts > 0 ? <Money cents={cash.total} /> : <NoValue />}</TileValue>}
        hint={
          cash.accounts === 0 ? (
            "Nenhuma conta conectada"
          ) : (
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span>{plural(cash.accounts, "conta", "contas")}</span>
              {cash.stale > 0 && (
                <span className="inline-flex items-center gap-1">
                  <AlertTriangle className="text-status-warning size-3" aria-hidden />
                  {cash.stale === 1 ? "1 desatualizada" : `${cash.stale} desatualizadas`}
                </span>
              )}
            </span>
          )
        }
      />
      <StatTile
        label="Fatura em aberto"
        icon={<CreditCard className={iconClass} aria-hidden />}
        value={<TileValue>{invoice.cards > 0 ? <Money cents={invoice.total} /> : <NoValue />}</TileValue>}
        hint={
          invoice.cards === 0
            ? "Nenhum cartão conectado"
            : invoice.dueDate
              ? `Vence em ${formatDateShort(invoice.dueDate)}`
              : "Nenhuma fatura em aberto"
        }
      />
      <StatTile
        label="Limite disponível"
        icon={<Gauge className={iconClass} aria-hidden />}
        value={<TileValue>{credit ? <Money cents={credit.available} /> : <NoValue />}</TileValue>}
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
              {formatPercent(usedShare)} de <Pair>{formatMoney(credit.limit)}</Pair> em uso
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">Nenhum cartão conectado</p>
        )}
      </StatTile>
      <StatTile
        label="Resultado do mês"
        icon={<TrendingUp className={iconClass} aria-hidden />}
        value={<TileValue>{moved ? <Money cents={month.totals.net} tone="flow" /> : <NoValue />}</TileValue>}
        hint={
          !moved ? (
            cash.accounts === 0 ? (
              "Aparece após a primeira sincronização"
            ) : (
              `Nenhuma entrada ou gasto até dia ${month.day}`
            )
          ) : (
            <span className="flex flex-col gap-0.5">
              <span>
                <Pair>Entradas {formatMoney(month.totals.income)}</Pair> ·{" "}
                <Pair>gastos {formatMoney(month.totals.spending)}</Pair>
              </span>
              {/* Gastos por data da compra (cartão incluído), ao contrário do "Líquido" do fluxo de caixa. */}
              <span>Até dia {month.day} · gastos incluem o cartão</span>
            </span>
          )
        }
      />
    </section>
  )
}
