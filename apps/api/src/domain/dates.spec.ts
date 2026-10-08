import { addDays, isIsoDate, toLocalDate, today } from './dates.js';

describe('dates', () => {
  it('converte o instante para o dia local de São Paulo', () => {
    // 01:30 UTC ainda é dia anterior em São Paulo (UTC-3).
    expect(toLocalDate('2026-03-02T01:30:00.000Z', 'America/Sao_Paulo')).toBe('2026-03-01');
    expect(toLocalDate('2026-03-02T03:00:00.000Z', 'America/Sao_Paulo')).toBe('2026-03-02');
  });

  it('calcula hoje no fuso informado', () => {
    expect(today('America/Sao_Paulo', new Date('2026-10-08T02:00:00Z'))).toBe('2026-10-07');
  });

  it('soma e subtrai dias atravessando meses', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('valida datas ISO', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('28/02/2026')).toBe(false);
  });
});
