import type { Loan } from "@/lib/api/loans"
import type { Cents, IsoDate } from "@/lib/api/types"

/** Empréstimos: o que o cartão mostra a partir do que cada banco compartilhou (quase tudo opcional). */

export interface LoanView {
  id: string
  institutionName: string
  productName: string
  outstanding: Cents | null
  /** Pagas de quantas; null quando o banco não deu o bastante para a conta. */
  installments: { paid: number; total: number } | null
  /** Fração paga (0–1), para o medidor. */
  progress: number | null
  remaining: number | null
  overdue: number
  next: { dueDate: IsoDate; amount: Cents | null } | null
  finalDueDate: IsoDate | null
  interestRateAnnual: number | null
  cetAnnual: number | null
}

const count = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null

/** Completa pagas/total com o que houver: pagas = total − restantes; total = pagas + restantes. */
export function installmentCounts(installments: Loan["installments"]): { paid: number; total: number } | null {
  const total = count(installments.total)
  const paid = count(installments.paid)
  const remaining = count(installments.remaining)
  const resolvedTotal = total ?? (paid !== null && remaining !== null ? paid + remaining : null)
  const resolvedPaid = paid ?? (total !== null && remaining !== null ? Math.max(0, total - remaining) : null)
  if (resolvedTotal === null || resolvedPaid === null || resolvedTotal <= 0) return null
  return { paid: Math.min(resolvedPaid, resolvedTotal), total: resolvedTotal }
}

export function loanView(loan: Loan): LoanView {
  const installments = installmentCounts(loan.installments)
  const next = loan.nextInstallment
    ? { dueDate: loan.nextInstallment.dueDate, amount: loan.nextInstallment.amount ?? loan.installmentAmount }
    : null
  return {
    id: loan.id,
    institutionName: loan.institutionName,
    productName: loan.productName,
    outstanding: loan.outstandingBalance,
    installments,
    progress: installments ? installments.paid / installments.total : null,
    remaining: count(loan.installments.remaining) ?? (installments ? installments.total - installments.paid : null),
    overdue: count(loan.installments.overdue) ?? 0,
    next,
    finalDueDate: loan.finalDueDate,
    interestRateAnnual: loan.interestRateAnnual,
    cetAnnual: loan.cetAnnual,
  }
}

/** Maior saldo devedor primeiro; os sem saldo informado por último, na ordem da API. */
export function sortLoans(loans: LoanView[]): LoanView[] {
  return [...loans].sort((a, b) => (b.outstanding ?? -Infinity) - (a.outstanding ?? -Infinity))
}

/** Soma dos saldos devedores informados e quantos empréstimos ficaram de fora por não ter saldo. */
export function totalOutstanding(loans: Pick<LoanView, "outstanding">[]): { total: Cents; missing: number } {
  let total = 0
  let missing = 0
  for (const loan of loans) {
    if (loan.outstanding === null) missing += 1
    else total += loan.outstanding
  }
  return { total, missing }
}

const rate = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 })

/** 27.6 → "27,6% a.a." */
export function formatAnnualRate(percent: number): string {
  return `${rate.format(percent)}% a.a.`
}

/** "Juros 27,6% a.a. · CET 30,12% a.a." (só o que veio); null sem nenhuma das duas. */
export function ratesLabel(loan: Pick<LoanView, "interestRateAnnual" | "cetAnnual">): string | null {
  const parts = [
    loan.interestRateAnnual !== null ? `Juros ${formatAnnualRate(loan.interestRateAnnual)}` : null,
    loan.cetAnnual !== null ? `CET ${formatAnnualRate(loan.cetAnnual)}` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(" · ") : null
}

/** "1 parcela atrasada", "2 parcelas atrasadas". */
export function overdueLabel(overdue: number): string {
  return overdue === 1 ? "1 parcela atrasada" : `${overdue} parcelas atrasadas`
}
