import { carryUserCategories, type GoneTransaction } from './reissued.js';

const gone = (overrides: Partial<GoneTransaction> = {}): GoneTransaction => ({
  externalId: 'velha',
  date: '2026-10-23',
  amount: -45_90,
  description: 'UBER *TRIP',
  userCategory: 'Transporte de trabalho',
  ...overrides,
});

describe('carryUserCategories', () => {
  it('leva a categoria editada para a efetivada com outro id e outra data', () => {
    const arrived = [
      { externalId: 'outra', date: '2026-10-19', amount: -12_00, description: 'PADARIA' },
      { externalId: 'nova', date: '2026-10-19', amount: -45_90, description: 'UBER *TRIP' },
    ];
    expect(carryUserCategories([gone()], arrived)).toEqual([{ from: gone(), to: arrived[1] }]);
  });

  it('prefere a mesma descrição e depois a data mais próxima', () => {
    const arrived = [
      { externalId: 'perto', date: '2026-10-22', amount: -45_90, description: 'OUTRA' },
      { externalId: 'mesma', date: '2026-10-15', amount: -45_90, description: 'UBER *TRIP' },
    ];
    expect(carryUserCategories([gone()], arrived)[0]?.to.externalId).toBe('mesma');
  });

  it('não liga valor diferente, data longe demais nem sem categoria editada', () => {
    expect(
      carryUserCategories(
        [gone(), gone({ externalId: 'sem-edicao', userCategory: null })],
        [
          { externalId: 'valor', date: '2026-10-23', amount: -45_00, description: 'UBER *TRIP' },
          { externalId: 'longe', date: '2026-09-01', amount: -45_90, description: 'UBER *TRIP' },
        ],
      ),
    ).toEqual([]);
  });

  it('cada transação nova recebe uma categoria só', () => {
    const arrived = [
      { externalId: 'nova', date: '2026-10-23', amount: -45_90, description: 'UBER *TRIP' },
    ];
    const result = carryUserCategories(
      [gone({ externalId: 'a' }), gone({ externalId: 'b', userCategory: 'Outra' })],
      arrived,
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.from.externalId).toBe('a');
  });
});
