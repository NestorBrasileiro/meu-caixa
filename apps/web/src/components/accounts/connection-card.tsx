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
  return (
    <Card className="gap-4">
      <CardHeader>
        {/*
          Avatar | nome (quebra linha, nunca reticências) | status.
          A linha de atualização ocupa também a coluna do status, para caber inteira em cards estreitos.
        */}
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1">
          <Avatar size="lg" className="row-span-2 rounded-lg">
            {connection.institutionLogoUrl && <AvatarImage src={connection.institutionLogoUrl} alt="" />}
            <AvatarFallback className="text-foreground rounded-lg text-xs font-medium">
              {institutionInitials(connection.institutionName)}
            </AvatarFallback>
          </Avatar>
          <CardTitle className="pt-0.5 leading-snug text-pretty">{connection.institutionName}</CardTitle>
          <ConnectionStatusBadge status={connection.status} />
          <CardDescription className="col-span-2 col-start-2 text-xs">
            {connection.lastRefreshedAt
              ? `Atualizado pelo banco ${formatRelative(connection.lastRefreshedAt, now)}`
              : "Ainda não atualizado pelo banco"}
          </CardDescription>
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
  const secondary = [sameAsName ? null : label, account.number].filter(Boolean).join(" · ")

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md">
          <Icon className="size-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{account.name}</p>
          {secondary && <p className="text-muted-foreground truncate text-xs">{secondary}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-medium tabular-nums">{formatMoney(account.balance)}</p>
          <p className="text-muted-foreground text-xs">{isCard ? "fatura aberta" : "saldo"}</p>
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
            <dt className="text-muted-foreground">Fatura aberta</dt>
            <dd className="text-right">Nenhuma</dd>
          </>
        )}
      </dl>
    </div>
  )
}

function SyncedThrough({ date, stale }: { date: IsoDate | null; stale: boolean }) {
  const Icon = stale || !date ? TriangleAlert : CalendarCheck
  return (
    <p className="text-muted-foreground flex items-center gap-1.5 pl-11 text-xs">
      <Icon className={stale || !date ? "text-status-warning size-3" : "size-3"} aria-hidden />
      {date ? `Sincronizado até ${formatDayMonth(date)}` : "Transações ainda não sincronizadas"}
    </p>
  )
}
