import { isIncome, isSpending, kindOf, type Classifiable } from './classify.js';

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

  describe('pagamento de fatura que o agregador categorizou errado', () => {
    it.each<[string, Classifiable]>([
      [
        'débito na conta como "Loans and financing"',
        {
          amount: -1_500_00,
          category: 'Loans and financing',
          description: 'PAGAMENTO DE FATURA CARTAO CREDITO VIA DEBITO - SICREDI 1234',
          accountType: 'CHECKING',
        },
      ],
      [
        'débito na conta como "Transfers"',
        {
          amount: -800_00,
          category: 'Transfers',
          description: 'Pagamento de fatura | Cartão de crédito',
          accountType: 'CHECKING',
        },
      ],
      [
        'débito na conta sem a palavra "fatura"',
        {
          amount: -800_00,
          category: 'Transfers',
          description: 'Pagamento Cartão de crédito',
          accountType: 'CHECKING',
        },
      ],
      [
        'crédito "TRA-" no cartão como "Transfers"',
        {
          amount: 1_500_00,
          category: 'Transfers',
          description: 'TRA-123-20260105-UT9876',
          accountType: 'CREDIT_CARD',
        },
      ],
      [
        'crédito "Pagamento recebido" no cartão',
        {
          amount: 800_00,
          category: null,
          description: 'Pagamento recebido',
          accountType: 'CREDIT_CARD',
        },
      ],
    ])('%s', (_, tx) => {
      expect(kindOf(tx)).toBe('PAGAMENTO_FATURA');
    });

    it('estorno no cartão continua sendo dinheiro voltando, não pagamento', () => {
      expect(
        kindOf({
          amount: 120_00,
          category: 'Transfers',
          description: 'ESTORNO LOJA X',
          accountType: 'CREDIT_CARD',
        }),
      ).toBe('RECEITA');
    });

    it('boleto de cartão não conectado segue como gasto', () => {
      expect(
        kindOf({
          amount: -430_00,
          category: 'Groceries',
          description: 'PAGAMENTO BOLETO| BANCO X HIPERCARD',
          accountType: 'CHECKING',
        }),
      ).toBe('GASTO');
    });

    it('compra no cartão com "pagamento" na descrição não vira pagamento de fatura', () => {
      expect(
        kindOf({
          amount: -90_00,
          category: 'Online shopping',
          description: 'PAGAMENTO LOJA ONLINE',
          accountType: 'CREDIT_CARD',
        }),
      ).toBe('GASTO');
    });
  });

  describe('dinheiro emprestado', () => {
    it.each<[string, Classifiable]>([
      ['categoria "Loans and financing"', { amount: 5_000_00, category: 'Loans and financing' }],
      [
        'descrição de liberação',
        { amount: 3_000_00, category: 'Transfers', description: 'LIBERAÇÃO DE CRÉDITO 0012345' },
      ],
      [
        'depósito do empréstimo',
        { amount: 2_000_00, category: null, description: 'Depósito do Empréstimo Pessoal' },
      ],
    ])('%s não é renda', (_, tx) => {
      expect(kindOf(tx)).toBe('CREDITO_RECEBIDO');
      expect(isIncome(tx)).toBe(false);
      expect(isSpending(tx)).toBe(false);
    });

    it('a parcela paga continua sendo gasto', () => {
      expect(
        kindOf({
          amount: -450_00,
          category: 'Online shopping',
          description: 'Pagamento de parcela | Empréstimos Mercado Pago',
          accountType: 'CHECKING',
        }),
      ).toBe('GASTO');
    });
  });
});
