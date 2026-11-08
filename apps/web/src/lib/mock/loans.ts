import type { Loan } from "@/lib/api/loans"
import { IDS } from "./generator"

/**
 * Empréstimos fictícios dos bancos do dataset (hoje = 07/10/2026): um crédito pessoal em dia no
 * Banco Exemplo e um empréstimo com uma parcela atrasada no Banco Digital Exemplo (a conexão que
 * pede reautenticação).
 */
export function buildLoans(): Loan[] {
  const updatedAt = "2026-10-07T12:00:41.000Z"
  return [
    {
      id: "b0a1b2c3-0001-4000-8000-000000000001",
      connectionId: IDS.bank,
      institutionName: "Banco Exemplo",
      productName: "Crédito pessoal",
      type: "EMPRESTIMO_CREDITO_PESSOAL_SEM_CONSIGNACAO",
      contractNumber: "0012345678",
      contractedAmount: 12_600_00,
      outstandingBalance: 8_746_19,
      currency: "BRL",
      contractDate: "2025-07-15",
      finalDueDate: "2028-07-15",
      // 1ª parcela em ago/2025: de ago/2025 a set/2026 são 14 pagas.
      installments: { total: 36, paid: 14, remaining: 22, overdue: 0 },
      nextInstallment: { dueDate: "2026-10-15", amount: 498_37 },
      installmentAmount: 498_37,
      interestRateAnnual: 27.6,
      cetAnnual: 30.12,
      periodicity: "MENSAL",
      updatedAt,
    },
    {
      id: "b0a1b2c3-0002-4000-8000-000000000002",
      connectionId: IDS.digital,
      institutionName: "Banco Digital Exemplo",
      productName: "Empréstimo pessoal",
      type: "EMPRESTIMO_CREDITO_PESSOAL_SEM_CONSIGNACAO",
      contractNumber: null,
      contractedAmount: 3_500_00,
      outstandingBalance: 1_012_45,
      currency: "BRL",
      contractDate: "2025-12-05",
      finalDueDate: "2026-12-05",
      // A parcela de 05/10 ficou em aberto: 9 pagas, 1 atrasada, 3 por pagar (contando a atrasada).
      installments: { total: 12, paid: 9, remaining: 3, overdue: 1 },
      nextInstallment: { dueDate: "2026-11-05", amount: 341_90 },
      installmentAmount: 341_90,
      interestRateAnnual: 58.4,
      cetAnnual: null,
      periodicity: "MENSAL",
      updatedAt,
    },
  ]
}
