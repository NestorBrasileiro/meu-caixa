import { openInstallments, type InstallmentRow } from './card-installments.js';

const row = (overrides: Partial<InstallmentRow>): InstallmentRow => ({
  accountId: 'card',
  date: '2026-01-10',
  description: 'LOJA',
  amount: -10_000,
  installmentNumber: 1,
  installmentTotal: 3,
  ...overrides,
});

describe('openInstallments', () => {
  it('uma compra com centavos de arredondamento na 1ª parcela continua sendo uma só', () => {
    const rows = [
      row({ date: '2026-01-10', amount: -3334, installmentNumber: 1 }),
      row({ date: '2026-02-10', amount: -3333, installmentNumber: 2 }),
    ];
    expect(openInstallments(rows, '2026-02-20')).toEqual([
      {
        accountId: 'card',
        description: 'LOJA',
        amount: 3333,
        installments: { paid: 2, total: 3 },
        nextDueDate: '2026-03-10',
        endsOn: '2026-03-10',
      },
    ]);
  });

  it('ignora estornos (créditos) com metadados de parcela', () => {
    const rows = [
      row({ date: '2026-01-10', installmentNumber: 1 }),
      row({ date: '2026-02-10', amount: 10_000, installmentNumber: 2 }),
    ];
    const open = openInstallments(rows, '2026-02-01');
    expect(open).toHaveLength(1);
    expect(open[0]!.amount).toBe(10_000);
  });

  it('banco que data todas as parcelas no dia da compra: calendário a partir da compra, em qualquer ordem', () => {
    const rows = [4, 1, 3, 2].map((installmentNumber) =>
      row({ date: '2026-01-15', installmentNumber, installmentTotal: 10 }),
    );
    expect(openInstallments(rows, '2026-02-20')).toEqual([
      expect.objectContaining({
        installments: { paid: 2, total: 10 },
        nextDueDate: '2026-03-15',
        endsOn: '2026-10-15',
      }),
    ]);
  });

  it('compras iguais em meses diferentes ficam separadas', () => {
    const rows = [
      row({ date: '2026-01-10', installmentNumber: 1 }),
      row({ date: '2026-02-10', installmentNumber: 2 }),
      row({ date: '2026-02-10', installmentNumber: 1, amount: -5_000 }),
    ];
    const open = openInstallments(rows, '2026-02-20');
    expect(open.map((item) => item.installments)).toEqual([
      { paid: 2, total: 3 },
      { paid: 1, total: 3 },
    ]);
  });

  it('compra já quitada e lançamento à vista ficam de fora', () => {
    const rows = [
      row({ date: '2026-01-10', installmentNumber: 1 }),
      row({ date: '2026-03-10', installmentNumber: 3 }),
      row({ date: '2026-03-05', installmentNumber: 1, installmentTotal: 1 }),
    ];
    expect(openInstallments(rows, '2026-03-20')).toEqual([]);
  });
});
