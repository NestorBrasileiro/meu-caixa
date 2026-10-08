import { CalendarCheck, TriangleAlert } from "lucide-react"
import type { Account, Connection, Invoice, IsoDate, IsoDateTime } from "@/lib/api/types"
import { ACCOUNT_TYPE } from "@/components/finance/account-type"
import { ConnectionStatusBadge } from "@/components/finance/connection-status"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDateShort, formatRelative } from "@/lib/format/date"
import { formatMoney } from "@/lib/format/money"
import { CreditLimitMeter } from "./credit-limit-meter"
import { daysBetween, formatDayMonth, institutionInitials } from "./format"

/** Sincronização com mais de N dias de atraso é sinalizada mesmo com a conexão ativa. */
const STALE_AFTER_DAYS = 2

type OpenInvoice = Pick<Invoice, "dueDate" | "closingDate" | "total">

/** Um banco conectado: status da conexão e as contas que ele trouxe. */
export function ConnectionCard({
  connection,
  accounts,
  openInvoices,
  today,
  now,
}: {
  connection: Connection
  accounts: Account[]
  /** Fatura aberta por id de conta de cartão. */
  openInvoices: Record<string, OpenInvoice | null>
  today: IsoDate
  now: IsoDateTime
}) {
  // O card ocupa duas linhas da grade do pai (subgrid): cabeçalho e contas. Assim os cabeçalhos de uma
  // mesma fileira têm a mesma altura e as divisórias ficam alinhadas, mesmo quando um nome quebra linha.
  return (
    <Card className="row-span-2 grid grid-rows-subgrid gap-4">
      <CardHeader className="block">
        <div className="flex items-start gap-3">
          <Avatar size="lg" className="rounded-lg">
            {connection.institutionLogoUrl && <AvatarImage src={connection.institutionLogoUrl} alt="" />}
            <AvatarFallback className="text-foreground rounded-lg text-xs font-medium">
              {institutionInitials(connection.institutionName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-1">
            {/* Nome nunca é espremido nem cortado: sem espaço, o status desce para a linha de baixo. */}
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
              <CardTitle className="pt-0.5 leading-snug text-pretty">
                <h3>{connection.institutionName}</h3>
              </CardTitle>
              <ConnectionStatusBadge status={connection.status} />
            </div>
            <CardDescription className="text-xs">
              {connection.lastRefreshedAt
                ? `Atualizado pelo banco ${formatRelative(connection.lastRefreshedAt, now)}`
                : "Ainda não atualizado pelo banco"}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {accounts.length === 0 ? (
          <p className="text-muted-foreground border-t pt-4 text-sm">Nenhuma conta trazida por esta conexão.</p>
        ) : (
          <ul className="divide-y border-t" aria-label={`Contas em ${connection.institutionName}`}>
            {accounts.map((account) => (
              <li key={account.id} className="py-4 last:pb-0">
                <AccountItem
                  account={account}
                  connectionActive={connection.status === "ACTIVE"}
                  openInvoice={openInvoices[account.id] ?? null}
                  today={today}
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function AccountItem({
  account,
  connectionActive,
  openInvoice,
  today,
}: {
  account: Account
  connectionActive: boolean
  openInvoice: OpenInvoice | null
  today: IsoDate
}) {
  const { label, icon: Icon } = ACCOUNT_TYPE[account.type]
  const isCard = account.type === "CREDIT_CARD"
  const sameAsName = label.localeCompare(account.name, "pt-BR", { sensitivity: "base" }) === 0
  const secondary = [sameAsName ? null : label, account.number].filter((part): part is string => Boolean(part))

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md">
          <Icon className="size-4" aria-hidden />
        </div>
        {/* Nada aqui usa reticências: o nome quebra linha e o número da conta desce inteiro, nunca cortado. */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-pretty break-words">{account.name}</p>
          {secondary.length > 0 && (
            <p className="text-muted-foreground flex flex-wrap gap-x-1 text-xs">
              {secondary.map((part, index) => (
                <span key={index} className="whitespace-nowrap">
                  {part}
                  {index < secondary.length - 1 && " ·"}
                </span>
              ))}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-medium tabular-nums">{formatMoney(account.balance)}</p>
          <p className="text-muted-foreground text-xs">{isCard ? "fatura em aberto" : "saldo"}</p>
        </div>
      </div>

      {isCard && <CardDetails account={account} openInvoice={openInvoice} />}

      <SyncedThrough
        date={account.transactionsSyncedThrough}
        stale={
          !connectionActive ||
          (account.transactionsSyncedThrough !== null &&
            daysBetween(account.transactionsSyncedThrough, today) > STALE_AFTER_DAYS)
        }
      />
    </div>
  )
}

function CardDetails({ account, openInvoice }: { account: Account; openInvoice: OpenInvoice | null }) {
  const limit = account.creditLimit
  const used = limit !== null && account.availableCredit !== null ? limit - account.availableCredit : account.balance

  return (
    <div className="space-y-3 pl-11">
      {limit !== null && limit > 0 && <CreditLimitMeter used={used} limit={limit} />}
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-xs">
        {account.availableCredit !== null && (
          <>
            <dt className="text-muted-foreground">Limite disponível</dt>
            <dd className="text-right tabular-nums">{formatMoney(account.availableCredit)}</dd>
          </>
        )}
        {openInvoice ? (
          <>
            {openInvoice.closingDate && (
              <>
                <dt className="text-muted-foreground">Fatura fecha em</dt>
                <dd className="text-right">{formatDateShort(openInvoice.closingDate)}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Vence em</dt>
            <dd className="text-right">{formatDateShort(openInvoice.dueDate)}</dd>
          </>
        ) : (
          <>
            <dt className="text-muted-foreground">Fatura em aberto</dt>
            <dd className="text-right">Nenhuma</dd>
          </>
        )}
      </dl>
    </div>
  )
}

/** Até quando há transações. Atrasado = ícone de alerta + a palavra "desatualizado" (nunca só o ícone). */
function SyncedThrough({ date, stale }: { date: IsoDate | null; stale: boolean }) {
  const warn = stale || !date
  const Icon = warn ? TriangleAlert : CalendarCheck
  return (
    <p className="text-muted-foreground flex items-start gap-1.5 pl-11 text-xs">
      <Icon className={warn ? "text-status-warning mt-0.5 size-3 shrink-0" : "mt-0.5 size-3 shrink-0"} aria-hidden />
      <span>
        {date ? (
          <>
            Sincronizado até {formatDayMonth(date)}
            {stale && <span className="text-foreground"> · desatualizado</span>}
          </>
        ) : (
          "Transações ainda não sincronizadas"
        )}
      </span>
    </p>
  )
}
