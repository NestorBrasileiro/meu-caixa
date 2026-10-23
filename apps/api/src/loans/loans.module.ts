import { Module } from '@nestjs/common';
import { LoansService } from './loans.service.js';

@Module({
  providers: [LoansService],
  exports: [LoansService],
})
export class LoansModule {}
