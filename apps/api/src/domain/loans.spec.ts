import { detectLoans, nextInstallment, type NextInstallmentInput } from './loans.js';

const base: NextInstallmentInput = {
  firstInstallmentDueDate: '2026-01-31',
  finalDueDate: '2027-12-31',
  periodicity: 'MONTHLY',
  installments: { total: 24, paid: 9, remaining: 15, overdue: 0 },
  installmentAmount: 837_81,
  scheduledInstallments: [],
};

describe('nextInstallment', () => {
  it.each([
    ['2026-10-23', '2026-10-31'],
    ['2026-10-31', '2026-10-31'], // vence hoje: ainda é a próxima
    ['2026-11-01', '2026-11-30'], // dia 31 vira o último dia do mês
    ['2027-02-01', '2027-02-28'],
    ['2025-12-01', '2026-01-31'], // antes do primeiro vencimento
  ])('em %s, a próxima mensal vence em %s', (today, expected) => {
    expect(nextInstallment(base, today)).toEqual({ dueDate: expected, amount: 837_81 });
  });

  it('respeita o passo de periodicidades maiores e semanais', () => {
    expect(
      nextInstallment(
        { ...base, periodicity: 'QUARTERLY', firstInstallmentDueDate: '2026-01-15' },
        '2026-05-01',
      ),
    ).toMatchObject({ dueDate: '2026-07-15' });
    expect(
      nextInstallment(
        { ...base, periodicity: 'WEEKLY', firstInstallmentDueDate: '2026-10-01' },
        '2026-10-23',
      ),
    ).toMatchObject({ dueDate: '2026-10-29' });
  });

  it('sem o primeiro vencimento, conta para trás do vencimento final', () => {
    const loan = { ...base, firstInstallmentDueDate: null };
    // 15 a vencer terminando em 31/12/2027: a primeira delas é 31/10/2026.
    expect(nextInstallment(loan, '2026-10-23')).toMatchObject({ dueDate: '2026-10-31' });
    // Dado desatualizado (a "próxima" já passou): não chuta.
    expect(nextInstallment(loan, '2026-11-15')).toBeNull();
  });

  it('não devolve parcela depois do fim do contrato nem com tudo pago', () => {
    expect(nextInstallment(base, '2028-01-05')).toBeNull();
    expect(
      nextInstallment(
        { ...base, installments: { ...base.installments, remaining: 0 } },
        '2026-10-23',
      ),
    ).toBeNull();
  });

  it('sem dados suficientes, não inventa', () => {
    expect(nextInstallment({ ...base, periodicity: null }, '2026-10-23')).toBeNull();
    expect(nextInstallment({ ...base, periodicity: 'IRREGULAR' }, '2026-10-23')).toBeNull();
    expect(nextInstallment({ ...base, periodicity: 'FORTNIGHTLY' }, '2026-10-23')).toBeNull();
  });

  it('considera as parcelas não regulares com data própria', () => {
    const loan: NextInstallmentInput = {
      ...base,
      periodicity: 'IRREGULAR',
      scheduledInstallments: [
        { dueDate: '2026-12-20', amount: 5_000_00 },
        { dueDate: '2026-06-20', amount: 5_000_00 },
        { dueDate: '2026-11-05', amount: null },
      ],
    };
    expect(nextInstallment(loan, '2026-10-23')).toEqual({ dueDate: '2026-11-05', amount: null });

    const mixed = { ...base, scheduledInstallments: [{ dueDate: '2026-10-31', amount: 500_00 }] };
    expect(nextInstallment(mixed, '2026-10-23')).toEqual({
      dueDate: '2026-10-31',
      amount: 837_81 + 500_00,
    });
  });
});

describe('detectLoans', () => {
  const move = (
    date: string,
    amount: number,
    kind: 'credit' | 'payment' | 'other',
    accountName = 'Conta',
  ) => ({
    date,
    amount,
    institutionName: 'Banco',
    accountName,
    loanCredit: kind === 'credit',
    loanPayment: kind === 'payment',
  });

  it('soma liberações e parcelas por conta e guarda a última parcela', () => {
    expect(
      detectLoans([
        move('2026-01-10', 5_000_00, 'credit'),
        move('2026-02-10', -450_00, 'payment'),
        move('2026-03-10', -450_00, 'payment'),
        move('2026-03-11', -80_00, 'other'),
        move('2026-03-12', -100_00, 'payment', 'Outra conta'),
      ]),
    ).toEqual([
      {
        institutionName: 'Banco',
        accountName: 'Conta',
        released: 5_000_00,
        releases: 1,
        paid: 900_00,
        payments: 2,
        lastPaymentDate: '2026-03-10',
      },
      {
        institutionName: 'Banco',
        accountName: 'Outra conta',
        released: 0,
        releases: 0,
        paid: 100_00,
        payments: 1,
        lastPaymentDate: '2026-03-12',
      },
    ]);
  });

  it('sem liberação nem parcela, nada', () => {
    expect(detectLoans([move('2026-01-10', -50_00, 'other')])).toEqual([]);
  });
});
