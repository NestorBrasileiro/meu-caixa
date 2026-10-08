import { monthRange, occurrencesUntil, shiftMonth } from './months.js';

describe('months', () => {
  it('desloca meses atravessando o ano', () => {
    expect(shiftMonth('2026-11', 3)).toBe('2027-02');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('calcula o intervalo do mês, inclusive fevereiro bissexto', () => {
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('conta parcelas já vencidas', () => {
    // Set/2023 a set/2026 = 37; a de 10/out ainda não venceu em 07/out.
    expect(occurrencesUntil('2023-09-10', '2026-10-07')).toBe(37);
    expect(occurrencesUntil('2023-09-10', '2026-10-10')).toBe(38);
    expect(occurrencesUntil('2026-11-01', '2026-10-07')).toBe(0);
  });
});
