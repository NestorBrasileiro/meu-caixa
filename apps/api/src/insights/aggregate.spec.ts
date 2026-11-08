import {
  type AnalyzedTransaction,
  detectRecurrences,
  kindOf,
  median,
  monthlyTotals,
  monthsInRange,
  recurrenceKey,
  spendingByCategory,
} from './aggregate.js';

let sequence = 0;
const tx = (
  date: string,
  amount: number,
  category: string | null,
  extra: Partial<AnalyzedTransaction> = {},
): AnalyzedTransaction => ({
  id: `tx-${++sequence}`,
  date,
  description: category ?? 'Sem descrição',
  counterpartyName: null,
  amount,
  category,
  installment: null,
  accountId: 'checking',
  accountName: 'Conta',
  accountType: 'CHECKING',
  ...extra,
});

describe('insights/aggregate', () => {
  it('classifica cada transação uma vez só', () => {
    expect(kindOf({ amount: -100, category: 'Groceries' })).toBe('GASTO');
    expect(kindOf({ amount: 100, category: 'Salary' })).toBe('RECEITA');
    expect(kindOf({ amount: -100, category: 'Credit card payment' })).toBe('PAGAMENTO_FATURA');
    expect(kindOf({ amount: 100, category: 'Credit card payment' })).toBe('PAGAMENTO_FATURA');
    expect(kindOf({ amount: -100, category: 'Transfer - Savings' })).toBe('TRANSFERENCIA_PROPRIA');
    expect(kindOf({ amount: 0, category: 'Groceries' })).toBe('NEUTRA');
  });

  it('lista os meses de um período, atravessando o ano', () => {
    expect(monthsInRange('2025-11-15', '2026-02-03')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
    expect(monthsInRange('2026-03-01', '2026-03-31')).toEqual(['2026-03']);
  });

  it('soma renda, gasto e o que fica de fora por mês', () => {
    const rows = [
      tx('2026-08-05', 9_000_00, 'Salary'),
      tx('2026-08-10', -300_00, 'Food delivery'),
      tx('2026-08-15', -500_00, 'Credit card payment'),
      tx('2026-08-16', 500_00, 'Credit card payment', { accountType: 'CREDIT_CARD' }),
      tx('2026-08-06', -1_500_00, 'Transfer - Savings'),
      tx('2026-08-06', 1_500_00, 'Transfer - Savings'),
      tx('2026-09-12', -200_00, 'Groceries'),
      tx('2026-10-01', -999_00, 'Groceries'),
    ];
    expect(monthlyTotals(rows, ['2026-08', '2026-09'])).toEqual([
      {
        month: '2026-08',
        income: 9_000_00,
        spending: 300_00,
        net: 8_700_00,
        cardPayments: 500_00,
        ownTransfersOut: 1_500_00,
      },
      {
        month: '2026-09',
        income: 0,
        spending: 200_00,
        net: -200_00,
        cardPayments: 0,
        ownTransfersOut: 0,
      },
    ]);
  });

  it('agrupa o gasto por categoria com o total de cada mês', () => {
    const rows = [
      tx('2026-08-01', -100_00, 'Food delivery'),
      tx('2026-08-20', -50_00, 'Food delivery'),
      tx('2026-09-03', -300_00, 'Food delivery'),
      tx('2026-09-04', -400_00, 'Groceries'),
      tx('2026-09-05', -10_00, null),
      tx('2026-09-15', -999_00, 'Credit card payment'),
      tx('2026-09-15', 50_00, 'Groceries'),
    ];
    const result = spendingByCategory(rows, ['2026-08', '2026-09']);
    expect(result.map((c) => [c.category, c.total, c.count])).toEqual([
      ['Food delivery', 450_00, 3],
      ['Groceries', 400_00, 1],
      [null, 10_00, 1],
    ]);
    expect(result[0]!.byMonth).toEqual([
      { month: '2026-08', total: 150_00 },
      { month: '2026-09', total: 300_00 },
    ]);
  });

  it('normaliza a origem da cobrança para agrupar', () => {
    expect(recurrenceKey({ counterpartyName: null, description: 'NETFLIX.COM 10/2026' })).toBe(
      'netflix com',
    );
    expect(recurrenceKey({ counterpartyName: '  Açaí da Esquina ', description: 'x' })).toBe(
      'acai da esquina',
    );
    expect(recurrenceKey({ counterpartyName: null, description: 'Notebook parc 3/10' })).toBe(
      'notebook',
    );
    expect(recurrenceKey({ counterpartyName: null, description: '123 456' })).toBeNull();
  });

  it('calcula a mediana', () => {
    expect(median([])).toBe(0);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 10])).toBe(3);
  });

  describe('detectRecurrences', () => {
    const today = '2026-10-10';
    const streaming = ['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'].map(
      (date) =>
        tx(date, -55_90, 'Video streaming', {
          description: `STREAMING ${date.slice(5, 7)}/2026`,
          accountName: 'Cartão',
          accountType: 'CREDIT_CARD',
          paymentMethod: 'CARD',
        }),
    );
    // Delivery 3x por mês, valores variados.
    const delivery = ['2026-07', '2026-08', '2026-09'].flatMap((month) =>
      [5, 12, 26].map((day) =>
        tx(`${month}-${day}`, -(40_00 + day * 100), 'Food delivery', {
          counterpartyName: 'Delivery Exemplo',
        }),
      ),
    );
    // Academia cancelada: última cobrança em junho.
    const gym = ['2026-04-10', '2026-05-10', '2026-06-10'].map((date) =>
      tx(date, -99_90, 'Gyms and fitness centers', { description: 'Academia' }),
    );
    const notebook = [3, 4, 5].map((n) =>
      tx(`2026-0${n + 4}-15`, -400_00, 'Shopping', {
        description: `Notebook ${n}/10`,
        installment: { number: n, total: 10 },
      }),
    );
    const variable = ['2026-07-20', '2026-08-20', '2026-09-20'].map((date, i) =>
      tx(date, -(150_00 + i * 60_00), 'Utilities', { description: 'Conta de luz' }),
    );
    const noise = [
      tx('2026-09-02', -80_00, 'Restaurants', { description: 'Restaurante novo' }),
      tx('2026-09-15', -500_00, 'Credit card payment', { description: 'Pagamento fatura' }),
      tx('2026-08-15', -500_00, 'Credit card payment', { description: 'Pagamento fatura' }),
      tx('2026-07-15', -500_00, 'Credit card payment', { description: 'Pagamento fatura' }),
    ];
    const all = [...streaming, ...delivery, ...gym, ...notebook, ...variable, ...noise];

    it('acha assinaturas, hábitos, parcelamentos e contas variáveis', () => {
      const result = detectRecurrences(all, { today, minMonths: 3 });
      const byKey = Object.fromEntries(result.map((r) => [r.key, r]));

      expect(Object.keys(byKey).sort()).toEqual([
        'academia',
        'conta de luz',
        'delivery exemplo',
        'notebook',
        'streaming',
      ]);
      expect(byKey.streaming).toMatchObject({
        pattern: 'ASSINATURA_OU_CONTA_FIXA',
        occurrences: 5,
        typicalAmount: 55_90,
        stableAmount: true,
        active: true,
        estimatedMonthlyCost: 55_90,
        lastDate: '2026-10-01',
        label: 'STREAMING 10/2026',
        category: 'Video streaming',
        accounts: ['Cartão'],
        account: 'Cartão',
        priceChange: null,
        fixedPrice: true,
        intervalMonths: 1,
        dayOfMonth: 1,
        paymentMethod: 'CARD',
        onCreditCard: true,
      });
      expect(byKey['delivery exemplo']).toMatchObject({
        pattern: 'HABITO_FREQUENTE',
        occurrences: 9,
        averagePerMonth: 3,
        monthsSeen: ['2026-07', '2026-08', '2026-09'],
      });
      expect(byKey['delivery exemplo']!.estimatedMonthlyCost).toBe(3 * 40_00 + (5 + 12 + 26) * 100);
      expect(byKey.academia).toMatchObject({ active: false, pattern: 'ASSINATURA_OU_CONTA_FIXA' });
      expect(byKey.notebook).toMatchObject({
        pattern: 'PARCELAMENTO',
        installment: { current: 5, total: 10, remaining: 5 },
      });
      expect(byKey['conta de luz']).toMatchObject({
        pattern: 'RECORRENTE_VARIAVEL',
        stableAmount: false,
        lastAmount: 270_00,
        priceChange: null,
        fixedPrice: false,
        paymentMethod: null,
        onCreditCard: false,
      });
    });

    it('ordena pelo custo mensal estimado', () => {
      const result = detectRecurrences(all, { today, minMonths: 3 });
      const costs = result.map((r) => r.estimatedMonthlyCost);
      expect(costs).toEqual([...costs].sort((a, b) => b - a));
    });

    it('o mês corrente, incompleto, não puxa o custo mensal para baixo', () => {
      const habit = ['2026-08', '2026-09', '2026-10'].flatMap((month) =>
        (month === '2026-10' ? [2] : [2, 9, 16, 23]).map((day) =>
          tx(`${month}-${String(day).padStart(2, '0')}`, -30_00, 'Taxi and ride-hailing', {
            description: 'Corrida',
          }),
        ),
      );
      const [ride] = detectRecurrences(habit, { today, minMonths: 3 });
      expect(ride).toMatchObject({ occurrences: 9, estimatedMonthlyCost: 120_00, total: 270_00 });
    });

    it('reajuste grande continua assinatura, com o degrau de preço', () => {
      const netflix = ['2026-06-05', '2026-07-05', '2026-08-05', '2026-09-05', '2026-10-05'].map(
        (date, i) =>
          tx(date, i < 4 ? -39_90 : -55_90, 'Video streaming', { description: 'Netflix' }),
      );
      const [result] = detectRecurrences(netflix, { today, minMonths: 2 });
      expect(result).toMatchObject({
        pattern: 'ASSINATURA_OU_CONTA_FIXA',
        stableAmount: false,
        fixedPrice: true,
        priceChange: { from: 39_90, to: 55_90, on: '2026-10-05' },
      });
      // Só duas cobranças diferentes: não dá para saber se é reajuste.
      const two = detectRecurrences(netflix.slice(3), { today, minMonths: 2 });
      expect(two[0]).toMatchObject({ priceChange: null, pattern: 'RECORRENTE_VARIAVEL' });
    });

    it('intervalo entre cobranças: trimestral é 3', () => {
      const quarterly = ['2026-01-10', '2026-04-10', '2026-07-10', '2026-10-10'].map((date) =>
        tx(date, -300_00, 'Insurance', { description: 'Seguro' }),
      );
      const [result] = detectRecurrences(quarterly, { today: '2026-10-20', minMonths: 2 });
      expect(result).toMatchObject({ intervalMonths: 3, pattern: 'ASSINATURA_OU_CONTA_FIXA' });
    });

    it('sem cadência reconhecível não é assinatura (duas compras a 10 meses, gás a cada 4)', () => {
      const twice = ['2025-12-02', '2026-10-02'].map((date) =>
        tx(date, -118_00, 'Restaurants', { description: 'Hamburgueria' }),
      );
      const gas = ['2026-02-16', '2026-06-16', '2026-10-16'].map((date) =>
        tx(date, -128_00, null, { description: 'Gás' }),
      );
      // Mediana dos intervalos (5 e 1) dá 3, mas não é trimestral.
      const irregular = ['2026-03-17', '2026-08-13', '2026-09-20'].map((date) =>
        tx(date, -24_90, null, { description: 'Informática' }),
      );
      const result = detectRecurrences([...twice, ...gas, ...irregular], {
        today: '2026-10-20',
        minMonths: 2,
      });
      expect(result).toHaveLength(3);
      for (const recurrence of result) {
        expect(recurrence).toMatchObject({ intervalMonths: null, pattern: 'RECORRENTE_VARIAVEL' });
      }
      // Mensal com um mês pulado continua mensal.
      const skipped = ['2026-06-05', '2026-07-05', '2026-09-05', '2026-10-05'].map((date) =>
        tx(date, -20_00, null, { description: 'App' }),
      );
      expect(detectRecurrences(skipped, { today, minMonths: 2 })[0]!.intervalMonths).toBe(1);
    });

    it('dia de cobrança 31 não vira 28 por causa de fevereiro', () => {
      const monthly = ['2026-12-31', '2027-01-31', '2027-02-28'].map((date) =>
        tx(date, -20_00, null, { description: 'Plano' }),
      );
      const [result] = detectRecurrences(monthly, { today: '2027-03-05', minMonths: 2 });
      expect(result!.dayOfMonth).toBe(31);
    });

    it('conta e forma de pagamento vêm da cobrança mais recente', () => {
      const moved = [
        tx('2026-07-01', -30_00, null, {
          description: 'App',
          accountName: 'Cartão',
          accountType: 'CREDIT_CARD',
          paymentMethod: 'CARD',
        }),
        tx('2026-08-01', -30_00, null, {
          description: 'App',
          accountName: 'Cartão',
          accountType: 'CREDIT_CARD',
          paymentMethod: 'CARD',
        }),
        tx('2026-09-01', -30_00, null, {
          description: 'App',
          accountName: 'Conta',
          accountType: 'CHECKING',
          paymentMethod: 'PIX',
        }),
      ];
      const [result] = detectRecurrences(moved, { today, minMonths: 2 });
      expect(result).toMatchObject({
        accounts: ['Cartão', 'Conta'],
        account: 'Conta',
        onCreditCard: false,
        paymentMethod: 'PIX',
      });
    });

    it('respeita o mínimo de meses distintos', () => {
      const keys = detectRecurrences(all, { today, minMonths: 4 }).map((r) => r.key);
      expect(keys).toEqual(['streaming']);
      expect(detectRecurrences(all, { today, minMonths: 2 }).length).toBe(5);
    });
  });
});
