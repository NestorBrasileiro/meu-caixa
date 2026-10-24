import type { Recurrence } from '../insights/aggregate.js';
import { buildSubscriptions } from './subscriptions.js';

const today = '2026-10-20';

const recurrence = (key: string, overrides: Partial<Recurrence> = {}): Recurrence => ({
  key,
  label: key.toUpperCase(),
  counterpartyName: null,
  category: null,
  pattern: 'ASSINATURA_OU_CONTA_FIXA',
  occurrences: 4,
  monthsSeen: ['2026-07', '2026-08', '2026-09', '2026-10'],
  averagePerMonth: 1,
  typicalAmount: 50_00,
  minAmount: 50_00,
  maxAmount: 50_00,
  lastAmount: 50_00,
  stableAmount: true,
  priceChange: null,
  fixedPrice: true,
  intervalMonths: 1,
  firstDate: '2026-07-05',
  lastDate: '2026-10-05',
  dayOfMonth: 5,
  active: true,
  total: 200_00,
  estimatedMonthlyCost: 50_00,
  accounts: ['Cartão'],
  account: 'Cartão',
  paymentMethod: 'CARD',
  onCreditCard: true,
  installment: null,
  ...overrides,
});

const variable = (key: string, overrides: Partial<Recurrence> = {}) =>
  recurrence(key, {
    pattern: 'RECORRENTE_VARIAVEL',
    stableAmount: false,
    fixedPrice: false,
    ...overrides,
  });

const keys = (items: { key: string }[]) => items.map((item) => item.key);

describe('buildSubscriptions', () => {
  it('separa assinaturas, outras cobranças, as que pararam e deixa hábitos e parcelas de fora', () => {
    const overview = buildSubscriptions(
      [
        recurrence('streaming', { lastAmount: 55_90 }),
        recurrence('academia', { lastAmount: 129_90 }),
        variable('conta de luz', { estimatedMonthlyCost: 210_00, typicalAmount: 200_00 }),
        recurrence('delivery', { pattern: 'HABITO_FREQUENTE', averagePerMonth: 3 }),
        recurrence('notebook', { pattern: 'PARCELAMENTO' }),
        recurrence('cancelada', { lastDate: '2026-06-05' }),
        recurrence('antiga', { lastDate: '2026-03-05' }),
      ],
      [],
      [],
      today,
    );

    expect(keys(overview.subscriptions)).toEqual(['academia', 'streaming']);
    expect(keys(overview.others)).toEqual(['conta de luz']);
    expect(keys(overview.stopped)).toEqual(['cancelada']);
    expect(overview.hidden).toEqual([]);
    expect(overview.totals).toEqual({ monthly: 185_80, yearly: 185_80 * 12, active: 2 });
    expect(overview.others[0]).toMatchObject({ monthlyCost: 210_00, chargeAmount: 200_00 });
  });

  it('pagamento de fatura mal categorizado nunca entra, nem fixo nem variável', () => {
    const overview = buildSubscriptions(
      [
        variable('pagamento de fatura cartao credito via debito banco'),
        recurrence('fatura cartao'),
        recurrence('banco', { label: 'PAGAMENTO DE FATURA CARTAO - BANCO 12345678' }),
      ],
      [],
      [],
      today,
    );
    expect(overview.subscriptions).toEqual([]);
    expect(overview.others).toEqual([]);
  });

  it('variável só entra em "outras" com ~1 cobrança por mês (sem arredondar) em 3 meses ou mais', () => {
    const overview = buildSubscriptions(
      [
        variable('mercado', { occurrences: 7, averagePerMonth: 1.8 }),
        variable('nova', { occurrences: 2, monthsSeen: ['2026-09', '2026-10'] }),
        variable('agua'),
        // 5 cobranças em 4 meses = 1,25 exato (o campo arredondado diria 1,3).
        variable('gas', { occurrences: 5, averagePerMonth: 1.3 }),
      ],
      [],
      [],
      today,
    );
    expect(keys(overview.others).sort()).toEqual(['agua', 'gas']);
  });

  it('aplica os ajustes: ignorar, promover e renomear', () => {
    const overview = buildSubscriptions(
      [
        recurrence('streaming'),
        variable('conta de luz'),
        recurrence('assinatura em dolar', { pattern: 'HABITO_FREQUENTE', averagePerMonth: 2 }),
      ],
      [
        { key: 'streaming', kind: 'IGNORED', name: null },
        { key: 'conta de luz', kind: 'SUBSCRIPTION', name: 'Luz' },
        { key: 'assinatura em dolar', kind: 'SUBSCRIPTION', name: null },
      ],
      [],
      today,
    );

    expect(keys(overview.hidden)).toEqual(['streaming']);
    expect(overview.others).toEqual([]);
    const byKey = Object.fromEntries(overview.subscriptions.map((s) => [s.key, s]));
    expect(byKey['conta de luz']).toMatchObject({
      name: 'Luz',
      customName: 'Luz',
      detectedName: 'CONTA DE LUZ',
      source: 'PROMOTED',
      variable: true,
    });
    expect(byKey['assinatura em dolar']).toMatchObject({
      name: 'ASSINATURA EM DOLAR',
      source: 'PROMOTED',
    });
  });

  it('reajuste: aumento acima do arredondamento, e o custo é o preço novo', () => {
    const overview = buildSubscriptions(
      [
        recurrence('subiu', {
          stableAmount: false,
          lastAmount: 55_90,
          priceChange: { from: 39_90, to: 55_90, on: '2026-10-05' },
        }),
        recurrence('centavos', { priceChange: { from: 50_00, to: 50_30, on: '2026-10-05' } }),
        recurrence('baixou', { priceChange: { from: 60_00, to: 50_00, on: '2026-10-05' } }),
      ],
      [],
      [],
      today,
    );
    const byKey = Object.fromEntries(overview.subscriptions.map((s) => [s.key, s]));
    expect(byKey.subiu).toMatchObject({
      priceIncrease: { from: 39_90, to: 55_90, on: '2026-10-05' },
      chargeAmount: 55_90,
      monthlyCost: 55_90,
      variable: false,
    });
    expect(byKey.centavos!.priceIncrease).toBeNull();
    expect(byKey.baixou!.priceIncrease).toBeNull();
  });

  it('cobrança espaçada: trimestral pesa um terço por mês e continua ativa entre cobranças', () => {
    const quarterly = recurrence('seguro', {
      intervalMonths: 3,
      lastAmount: 300_00,
      monthsSeen: ['2026-01', '2026-04', '2026-07'],
      occurrences: 3,
      lastDate: '2026-07-10',
      dayOfMonth: 10,
    });
    const [item] = buildSubscriptions([quarterly], [], [], '2026-09-20').subscriptions;
    expect(item).toMatchObject({
      chargeAmount: 300_00,
      monthlyCost: 100_00,
      yearlyCost: 1_200_00,
      intervalMonths: 3,
      nextDate: '2026-10-10',
    });
    // Passou do vencimento + folga: parou de cobrar.
    expect(keys(buildSubscriptions([quarterly], [], [], '2026-11-10').stopped)).toEqual(['seguro']);
  });

  it('valor fixo com mais de uma cobrança por mês conta todas', () => {
    const [item] = buildSubscriptions(
      [recurrence('app', { occurrences: 5, lastAmount: 20_00 })],
      [],
      [],
      today,
    ).subscriptions;
    expect(item!.monthlyCost).toBe(25_00);
  });

  it('próxima cobrança: no dia de cobrança, limitado ao fim do mês', () => {
    const [jan31] = buildSubscriptions(
      [recurrence('plano', { lastDate: '2027-01-31', dayOfMonth: 31 })],
      [],
      [],
      '2027-02-10',
    ).subscriptions;
    expect(jan31!.nextDate).toBe('2027-02-28');
  });

  it('acha o compromisso pela chave guardada (sobrevive a renomear) ou pelo nome', () => {
    const overview = buildSubscriptions(
      [
        recurrence('netflix com', { label: 'NETFLIX.COM 10/2026' }),
        recurrence('academia exemplo', { label: 'ACADEMIA EXEMPLO' }),
        recurrence('fibra', { label: 'FIBRA 123' }),
        recurrence('spotify', { label: 'SPOTIFY' }),
      ],
      [{ key: 'academia exemplo', kind: null, name: 'Academia' }],
      [
        { id: 'c1', name: 'Netflix.com', subscriptionKey: null },
        { id: 'c2', name: 'Academia', subscriptionKey: null },
        { id: 'c3', name: 'Aluguel', subscriptionKey: null },
        { id: 'c4', name: 'Música (renomeado)', subscriptionKey: 'spotify' },
      ],
      today,
    );
    const byKey = Object.fromEntries(overview.subscriptions.map((s) => [s.key, s]));
    expect(byKey['netflix com']!.plannedCommitmentId).toBe('c1');
    expect(byKey['academia exemplo']!.plannedCommitmentId).toBe('c2');
    expect(byKey.spotify!.plannedCommitmentId).toBe('c4');
    expect(byKey.fibra!.plannedCommitmentId).toBeNull();
  });
});
