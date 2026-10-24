import type { Cents, IsoDate, IsoDateTime } from "./types"

/** Empréstimos e financiamentos: contrato de `GET /api/loans` (módulo `loans` da API). */

/**
 * Um contrato de crédito trazido pelo Open Finance. Quase tudo pode faltar: cada banco compartilha
 * um pedaço diferente.
 */
export interface Loan {
  id: string
  connectionId: string
  institutionName: string
  productName: string
  type: string | null
  contractNumber: string | null
  contractedAmount: Cents | null
  outstandingBalance: Cents | null
  currency: string
  contractDate: IsoDate | null
  finalDueDate: IsoDate | null
  installments: {
    total: number | null
    paid: number | null
    remaining: number | null
    overdue: number | null
  }
  nextInstallment: { dueDate: IsoDate; amount: Cents | null } | null
  installmentAmount: Cents | null
  /** % ao ano (ex.: 27.6). */
  interestRateAnnual: number | null
  /** Custo efetivo total, % ao ano. */
  cetAnnual: number | null
  periodicity: string | null
  updatedAt: IsoDateTime
}
