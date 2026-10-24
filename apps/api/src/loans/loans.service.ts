import { Inject, Injectable } from '@nestjs/common';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { connections, loans, type LoanRow } from '../database/schema.js';
import { today } from '../domain/dates.js';
import { nextInstallment } from '../domain/loans.js';
import type { LoanDto } from './loan.dto.js';

/** Empréstimos e financiamentos sincronizados, lidos do banco. */
@Injectable()
export class LoansService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Do maior saldo devedor para o menor (sem saldo informado vão por último). */
  async list(userId: string): Promise<LoanDto[]> {
    const rows = await this.db
      .select({ loan: loans, institutionName: connections.institutionName })
      .from(loans)
      .innerJoin(connections, eq(loans.connectionId, connections.id))
      .where(eq(loans.userId, userId))
      .orderBy(
        sql`${loans.outstandingBalance} desc nulls last`,
        desc(loans.contractedAmount),
        asc(loans.productName),
        asc(loans.id),
      );

    // A próxima parcela é calculada na leitura: continua certa entre sincronizações.
    const todayDate = today(this.env.TIMEZONE);
    return rows.map(({ loan, institutionName }) => toDto(loan, institutionName, todayDate));
  }
}

function toDto(loan: LoanRow, institutionName: string, todayDate: string): LoanDto {
  const installments = {
    total: loan.installmentsTotal,
    paid: loan.installmentsPaid,
    remaining: loan.installmentsRemaining,
    overdue: loan.installmentsOverdue,
  };
  return {
    id: loan.id,
    connectionId: loan.connectionId,
    institutionName,
    productName: loan.productName,
    type: loan.type,
    contractNumber: loan.contractNumber,
    contractedAmount: loan.contractedAmount,
    outstandingBalance: loan.outstandingBalance,
    currency: loan.currency,
    contractDate: loan.contractDate,
    finalDueDate: loan.finalDueDate,
    installments,
    nextInstallment: nextInstallment(
      {
        firstInstallmentDueDate: loan.firstInstallmentDueDate,
        finalDueDate: loan.finalDueDate,
        periodicity: loan.periodicity,
        installments,
        installmentAmount: loan.installmentAmount,
        scheduledInstallments: loan.scheduledInstallments,
      },
      todayDate,
    ),
    installmentAmount: loan.installmentAmount,
    interestRateAnnual: loan.interestRateAnnual,
    cetAnnual: loan.cetAnnual,
    periodicity: loan.periodicityLabel,
    updatedAt: loan.updatedAt.toISOString(),
  };
}
