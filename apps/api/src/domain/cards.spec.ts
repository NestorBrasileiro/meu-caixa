import { cardUsed, estimateOpenInvoiceDates, isBlockedCard } from './cards.js';

const card = (
  balance: number,
  availableCredit: number | null,
  creditLimit: number | null = 5_000_00,
) => ({
  type: 'CREDIT_CARD' as const,
  balance,
  creditLimit,
  availableCredit,
});

describe('cartões', () => {
  it('cartão sem dívida e sem disponível é bloqueado, e o uso é a dívida (0)', () => {
    expect(isBlockedCard(card(0, 0))).toBe(true);
    expect(cardUsed(card(0, 0))).toBe(0);
  });

  it('cartão com dívida ou com disponível não é bloqueado', () => {
    expect(isBlockedCard(card(1_200_00, 0))).toBe(false);
    expect(isBlockedCard(card(0, 5_000_00))).toBe(false);
    expect(isBlockedCard(card(0, null))).toBe(false);
    expect(cardUsed(card(1_200_00, 3_800_00))).toBe(1_200_00);
  });
});

describe('estimateOpenInvoiceDates', () => {
  it('um mês depois da última fatura fechada', () => {
    expect(
      estimateOpenInvoiceDates(
        [{ dueDate: '2026-10-10', closingDate: '2026-10-03' }],
        '2026-10-20',
      ),
    ).toEqual({ after: '2026-10-03', closingDate: '2026-11-03', dueDate: '2026-11-10' });
  });

  it('avança até o vencimento não ter passado e estima o fechamento sem a data', () => {
    expect(
      estimateOpenInvoiceDates([{ dueDate: '2026-08-10', closingDate: null }], '2026-10-20'),
    ).toEqual({
      after: '2026-10-03',
      closingDate: '2026-11-03',
      dueDate: '2026-11-10',
    });
  });

  it('com uma fatura que ainda vai vencer, não estima nada', () => {
    expect(
      estimateOpenInvoiceDates(
        [{ dueDate: '2026-11-10', closingDate: '2026-11-03' }],
        '2026-10-20',
      ),
    ).toBeNull();
    expect(estimateOpenInvoiceDates([], '2026-10-20')).toBeNull();
  });
});
