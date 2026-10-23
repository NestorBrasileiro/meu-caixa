import type { Cents, IsoDate } from '../domain/finance.js';

/**
 * Empréstimo/financiamento como a API devolve (`GET /api/loans`) e como a
 * exportação consome. Valores em centavos; taxas em % ao ano.
 */
export interface LoanDto {
  id: string;
  connectionId: string;
  institutionName: string;
  /** Nome amigável em pt-BR (ex.: "Crédito pessoal", "Financiamento de veículo"). */
  productName: string;
  /** Tipo bruto do Open Finance (ex.: PERSONAL_LOAN), quando houver. */
  type: string | null;
  contractNumber: string | null;
  contractedAmount: Cents | null;
  /** Saldo devedor. */
  outstandingBalance: Cents | null;
  currency: string;
  contractDate: IsoDate | null;
  finalDueDate: IsoDate | null;
  installments: {
    total: number | null;
    paid: number | null;
    remaining: number | null;
    overdue: number | null;
  };
  nextInstallment: { dueDate: IsoDate; amount: Cents | null } | null;
  /** Valor da parcela regular, quando conhecido. */
  installmentAmount: Cents | null;
  interestRateAnnual: number | null;
  cetAnnual: number | null;
  /** Periodicidade em pt-BR (ex.: "Mensal"). */
  periodicity: string | null;
  updatedAt: string;
}
