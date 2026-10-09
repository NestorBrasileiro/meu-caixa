import {
  contributionIn,
  isActiveIn,
  paidInstallments,
  scheduleEnd,
  type CommitmentSchedule,
} from './planning.js';

const schedule = (overrides: Partial<CommitmentSchedule> = {}): CommitmentSchedule => ({
  startsOn: '2026-01-15',
  dayOfMonth: 10,
  endsOn: null,
  installmentsTotal: null,
  ...overrides,
});

describe('planejamento', () => {
  describe('scheduleEnd', () => {
    it('sem fim nem parcelas não acaba', () => {
      expect(scheduleEnd(schedule())).toBeNull();
    });

    it('deriva o fim do vencimento da última parcela', () => {
      // Começa em 15/jan, dia 10: 1ª parcela em 10/fev, 3ª em 10/abr.
      expect(scheduleEnd(schedule({ installmentsTotal: 3 }))).toBe('2026-04-10');
      // Dia 31 limitado ao mês: 31/jan, 28/fev.
      expect(
        scheduleEnd(schedule({ startsOn: '2026-01-01', dayOfMonth: 31, installmentsTotal: 2 })),
      ).toBe('2026-02-28');
    });

    it('o fim explícito vence o derivado', () => {
      expect(scheduleEnd(schedule({ endsOn: '2026-12-31', installmentsTotal: 3 }))).toBe(
        '2026-12-31',
      );
    });
  });

  describe('paidInstallments', () => {
    it('conta só os vencimentos antes de hoje e para no total', () => {
      const parcelado = schedule({ installmentsTotal: 3 });
      expect(paidInstallments(schedule(), '2026-05-01')).toBeNull();
      expect(paidInstallments(parcelado, '2026-02-10')).toBe(0);
      expect(paidInstallments(parcelado, '2026-02-11')).toBe(1);
      expect(paidInstallments(parcelado, '2026-04-10')).toBe(2);
      expect(paidInstallments(parcelado, '2026-04-11')).toBe(3);
      expect(paidInstallments(parcelado, '2030-01-01')).toBe(3);
    });
  });

  describe('isActiveIn', () => {
    it('ativo do mês do 1º vencimento ao mês da última parcela', () => {
      // Começa em 15/jan, dia 10: 1º vencimento em fevereiro, último em abril.
      const parcelado = schedule({ installmentsTotal: 3 });
      expect(isActiveIn(parcelado, '2026-01')).toBe(false);
      expect(isActiveIn(parcelado, '2026-02')).toBe(true);
      expect(isActiveIn(parcelado, '2026-04')).toBe(true);
      expect(isActiveIn(parcelado, '2026-05')).toBe(false);
    });

    it('começando antes do dia, já vence no mesmo mês', () => {
      expect(isActiveIn(schedule({ startsOn: '2026-01-05' }), '2026-01')).toBe(true);
      expect(isActiveIn(schedule({ startsOn: '2026-01-05' }), '2025-12')).toBe(false);
    });

    it('sem fim fica ativo para sempre; com fim explícito, até o mês dele', () => {
      expect(isActiveIn(schedule(), '2040-01')).toBe(true);
      const comFim = schedule({ endsOn: '2026-06-05' });
      expect(isActiveIn(comFim, '2026-06')).toBe(true);
      expect(isActiveIn(comFim, '2026-07')).toBe(false);
    });
  });

  describe('contributionIn', () => {
    it('no último mês aporta só o que falta', () => {
      const carro = { target: 10_000_00, saved: 0, monthlyContribution: 1_500_00 };
      expect([1, 2, 3, 4, 5, 6, 7, 8].map((month) => contributionIn(carro, month))).toEqual([
        1_500_00, 1_500_00, 1_500_00, 1_500_00, 1_500_00, 1_500_00, 1_000_00, 0,
      ]);
    });

    it('desconta o que já foi guardado', () => {
      const meta = { target: 10_000_00, saved: 9_000_00, monthlyContribution: 1_500_00 };
      expect(contributionIn(meta, 1)).toBe(1_000_00);
      expect(contributionIn(meta, 2)).toBe(0);
    });

    it('meta atingida ou sem aporte não contribui', () => {
      expect(contributionIn({ target: 100_00, saved: 100_00, monthlyContribution: 50_00 }, 1)).toBe(
        0,
      );
      expect(contributionIn({ target: 100_00, saved: 150_00, monthlyContribution: 50_00 }, 1)).toBe(
        0,
      );
      expect(contributionIn({ target: 100_00, saved: 0, monthlyContribution: 0 }, 1)).toBe(0);
    });
  });
});
