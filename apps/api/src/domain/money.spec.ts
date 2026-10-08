import { toCents } from './money.js';

describe('toCents', () => {
  it.each([
    [19.99, 1999],
    [-45.9, -4590],
    [0.1 + 0.2, 30],
    [1234567.89, 123456789],
    [-0.001, 0],
    [0, 0],
  ])('converte %d para %d centavos', (amount, expected) => {
    expect(toCents(amount)).toBe(expected);
  });

  it('rejeita valores não finitos', () => {
    expect(() => toCents(Number.NaN)).toThrow(RangeError);
  });
});
