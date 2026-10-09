import {
  dueDate,
  firstDueDate,
  installmentDueDate,
  lastDayOf,
  monthRange,
  monthsBetween,
  occurrencesUntil,
  shiftMonth,
} from './months.js';

describe('months', () => {
  it('desloca meses atravessando o ano', () => {
    expect(shiftMonth('2026-11', 3)).toBe('2027-02');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(monthsBetween('2025-11', '2026-02')).toBe(3);
    expect(monthsBetween('2026-02', '2025-11')).toBe(-3);
  });

  it('calcula o intervalo do mês, inclusive fevereiro bissexto', () => {
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(lastDayOf('2026-02')).toBe(28);
    expect(lastDayOf('2026-04')).toBe(30);
  });

  it('limita o vencimento ao último dia do mês', () => {
    expect(dueDate('2026-02', 31)).toBe('2026-02-28');
    expect(dueDate('2028-02', 30)).toBe('2028-02-29');
    expect(dueDate('2026-04', 31)).toBe('2026-04-30');
    expect(dueDate('2026-05', 31)).toBe('2026-05-31');
    expect(dueDate('2026-05', 5)).toBe('2026-05-05');
  });

  it('acha o primeiro vencimento em ou depois do início', () => {
    // Começa antes do dia: vence no mesmo mês.
    expect(firstDueDate('2026-03-01', 10)).toBe('2026-03-10');
    // Começa no próprio dia: vence nele.
    expect(firstDueDate('2026-03-10', 10)).toBe('2026-03-10');
    // Começa depois do dia: só no mês seguinte.
    expect(firstDueDate('2026-03-11', 10)).toBe('2026-04-10');
    // Dia 31 em fevereiro vira 28; começando em 28/fev ainda vence nele.
    expect(firstDueDate('2026-02-28', 31)).toBe('2026-02-28');
    expect(firstDueDate('2026-01-31', 31)).toBe('2026-01-31');
    expect(firstDueDate('2026-12-15', 10)).toBe('2027-01-10');
  });

  it('data da parcela n conta a partir do primeiro vencimento, limitada ao mês', () => {
    expect(installmentDueDate('2026-01-31', 31, 1)).toBe('2026-01-31');
    expect(installmentDueDate('2026-01-31', 31, 2)).toBe('2026-02-28');
    expect(installmentDueDate('2026-01-31', 31, 4)).toBe('2026-04-30');
    expect(installmentDueDate('2026-03-11', 10, 1)).toBe('2026-04-10');
    expect(installmentDueDate('2023-09-10', 10, 120)).toBe('2033-08-10');
  });

  it('conta vencimentos estritamente antes de hoje', () => {
    // Set/2023 a set/2026 = 37; a de 10/out ainda não venceu em 07/out.
    expect(occurrencesUntil('2023-09-10', 10, '2026-10-07')).toBe(37);
    // No dia do vencimento a parcela ainda não foi paga: é a próxima.
    expect(occurrencesUntil('2023-09-10', 10, '2026-10-10')).toBe(37);
    expect(occurrencesUntil('2023-09-10', 10, '2026-10-11')).toBe(38);
    // Ainda não começou.
    expect(occurrencesUntil('2026-11-01', 10, '2026-10-07')).toBe(0);
    // Primeiro vencimento hoje: nenhuma paga.
    expect(occurrencesUntil('2026-10-01', 10, '2026-10-10')).toBe(0);
    // Começou depois do dia: o 1º vencimento é só no mês seguinte.
    expect(occurrencesUntil('2026-09-15', 10, '2026-10-09')).toBe(0);
    expect(occurrencesUntil('2026-09-15', 10, '2026-10-11')).toBe(1);
    // O dia do compromisso manda, não o dia de startsOn.
    expect(occurrencesUntil('2026-08-01', 10, '2026-10-09')).toBe(2);
  });

  it('dia 31 vence no último dia dos meses curtos', () => {
    // 31/jan venceu; 28/fev vence hoje (não paga).
    expect(occurrencesUntil('2026-01-31', 31, '2026-02-28')).toBe(1);
    expect(occurrencesUntil('2026-01-31', 31, '2026-03-01')).toBe(2);
    // Abril tem 30 dias: em 30/abr a de abril ainda é a próxima.
    expect(occurrencesUntil('2026-01-31', 31, '2026-04-30')).toBe(3);
    expect(occurrencesUntil('2026-01-31', 31, '2026-05-01')).toBe(4);
  });
});
