import { FakeFinanceProvider } from './fake-finance-provider.js';

describe('FakeFinanceProvider', () => {
  const provider = new FakeFinanceProvider({
    timeZone: 'America/Sao_Paulo',
    now: () => new Date('2026-10-23T15:00:00Z'),
  });

  it('tem dois empréstimos no Banco Exemplo e nenhum no emissor do cartão', async () => {
    const loans = await provider.getLoans('fake-bank');

    expect(loans).toEqual([
      expect.objectContaining({
        productName: 'Crédito pessoal',
        contractDate: '2025-10-03',
        firstInstallmentDueDate: '2025-11-12',
        finalDueDate: '2027-10-12',
        installments: { total: 24, paid: 12, remaining: 12, overdue: 0 },
        contractedAmount: 1_500_000,
      }),
      expect.objectContaining({
        productName: 'Financiamento de veículo',
        installments: { total: 48, paid: 2, remaining: 46, overdue: 0 },
        contractedAmount: 6_200_000,
      }),
    ]);
    for (const loan of loans!) {
      expect(loan.outstandingBalance).toBeGreaterThan(0);
      expect(loan.outstandingBalance).toBeLessThan(loan.contractedAmount!);
    }
    await expect(provider.getLoans('fake-card-issuer')).resolves.toEqual([]);
  });

  it('debita as parcelas na conta corrente, uma por parcela paga', async () => {
    const [personal] = (await provider.getLoans('fake-bank'))!;
    const transactions = await provider.getTransactions('fake-checking', {
      from: '2025-01-01',
      to: '2026-10-23',
    });
    const installments = transactions.filter((t) => t.description === 'Parcela crédito pessoal');

    expect(installments).toHaveLength(personal!.installments.paid!);
    expect(new Set(installments.map((t) => t.amount))).toEqual(
      new Set([-personal!.installmentAmount!]),
    );
  });
});
