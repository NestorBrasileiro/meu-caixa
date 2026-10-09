import { isIncome, isSpending } from './classify.js';

describe('classify', () => {
  it.each([
    [{ amount: -100, category: 'Groceries' }, true, false],
    [{ amount: -100, category: 'Credit card payment' }, false, false],
    [{ amount: 100, category: 'Credit card payment' }, false, false],
    [{ amount: -100, category: 'Transfer - Savings' }, false, false],
    [{ amount: 100, category: 'Transfer - Savings' }, false, false],
    [{ amount: 900, category: 'Salary' }, false, true],
    [{ amount: -50, category: null }, true, false],
  ])('%o → gasto=%s renda=%s', (tx, spending, income) => {
    expect(isSpending(tx)).toBe(spending);
    expect(isIncome(tx)).toBe(income);
  });
});
