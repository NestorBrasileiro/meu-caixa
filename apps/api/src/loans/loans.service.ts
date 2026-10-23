import { Injectable } from '@nestjs/common';
import type { LoanDto } from './loan.dto.js';

/** Empréstimos e financiamentos sincronizados (esqueleto: implementação em andamento). */
@Injectable()
export class LoansService {
  async list(): Promise<LoanDto[]> {
    return [];
  }
}
