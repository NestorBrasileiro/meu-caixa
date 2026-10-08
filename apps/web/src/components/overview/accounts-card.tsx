import { ArrowRight, Landmark } from "lucide-react"
import Link from "next/link"
import { ACCOUNT_TYPE } from "@/components/finance/account-type"
import { ConnectionStatusBadge } from "@/components/finance/connection-status"
import { Money } from "@/components/finance/money"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import type { Account, IsoDate } from "@/lib/api/types"
import { formatDateShort } from "@/lib/format/date"
import { HEADER_ACTION_CLASS, HEADER_DESCRIPTION_CLASS } from "./styles"

function balanceCaption(account: Account, today: IsoDate): string {
  if (account.type === "CREDIT_CARD") return "Fatura em aberto"
  const synced = account.transactionsSyncedThrough
  if (account.connectionStatus !== "ACTIVE" && synced && synced < today) {
    return `Saldo de ${formatDateShort(synced)}`
  }
  return "Saldo disponível"
}

export function AccountsCard({ accounts, today }: { accounts: Account[]; today: IsoDate }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Contas</CardTitle>
        <CardDescription className={HEADER_DESCRIPTION_CLASS}>
          Saldo de cada conta conectada. No cartão, o valor da fatura em aberto.
        </CardDescription>
        <CardAction className={HEADER_ACTION_CLASS}>
          <Button variant="ghost" size="sm" className="-mr-2" asChild>
            <Link href="/contas">
              Ver contas
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {accounts.length === 0 ? (
          <Empty className="border p-6 md:p-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Landmark aria-hidden />
              </EmptyMedia>
              <EmptyTitle className="text-base">Nenhuma conta conectada</EmptyTitle>
              <EmptyDescription>Conecte um banco para ver saldos, faturas e limites aqui.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y sm:grid sm:grid-cols-2 sm:gap-3 sm:divide-y-0 xl:grid-cols-4">
            {accounts.map((account) => {
              const { label, icon: Icon } = ACCOUNT_TYPE[account.type]
              const stale = account.connectionStatus !== "ACTIVE"
              return (
                <li
                  key={account.id}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 sm:flex-col sm:items-stretch sm:rounded-lg sm:border sm:p-4 sm:first:pt-4 sm:last:pb-4"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3 sm:items-start">
                    <div className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-md">
                      <Icon className="text-muted-foreground size-4" aria-hidden />
                      <span className="sr-only">{label}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="max-w-full truncate text-sm font-medium">{account.name}</p>
                        {stale && <ConnectionStatusBadge status={account.connectionStatus} />}
                      </div>
                      <p className="text-muted-foreground truncate text-xs">
                        {account.institutionName}
                        {account.number ? ` · ${account.number}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end sm:mt-auto sm:items-start">
                    <p className="text-muted-foreground order-last text-xs sm:order-first">
                      {balanceCaption(account, today)}
                    </p>
                    <Money cents={account.balance} className="text-sm font-semibold sm:text-base" />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
