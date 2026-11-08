import {
  mapAccount,
  mapBill,
  mapIdentity,
  mapItem,
  mapLoan,
  mapTransaction,
} from './pluggy.mapper.js';
import {
  pluggyLoanSchema,
  type PluggyAccount,
  type PluggyLoan,
  type PluggyTransaction,
} from './pluggy.schemas.js';

const TZ = 'America/Sao_Paulo';

const baseTransaction: PluggyTransaction = {
  id: 'tx-1',
  accountId: 'acc-1',
  date: '2026-10-01T03:00:00.000Z',
  description: 'Mercado Exemplo',
  type: 'DEBIT',
  amount: -123.45,
};

describe('pluggy.mapper', () => {
  describe('mapItem', () => {
    it.each([
      ['UPDATED', 'ACTIVE'],
      ['UPDATING', 'UPDATING'],
      ['LOGIN_ERROR', 'ACTION_REQUIRED'],
      ['WAITING_USER_ACTION', 'ACTION_REQUIRED'],
      ['OUTDATED', 'ERROR'],
      ['ALGUM_STATUS_NOVO', 'ERROR'],
    ])('traduz o status %s para %s', (status, expected) => {
      const connection = mapItem({
        id: 'item-1',
        status,
        lastUpdatedAt: '2026-10-07T10:00:00.000Z',
        connector: { name: 'Banco Exemplo', imageUrl: 'https://logo' },
      });
      expect(connection).toEqual({
        externalId: 'item-1',
        institutionName: 'Banco Exemplo',
        institutionLogoUrl: 'https://logo',
        status: expected,
        lastRefreshedAt: new Date('2026-10-07T10:00:00.000Z'),
      });
    });
  });

  describe('mapAccount', () => {
    const base: PluggyAccount = {
      id: 'acc-1',
      itemId: 'item-1',
      type: 'BANK',
      subtype: 'CHECKING_ACCOUNT',
      number: '0001/12345-6',
      name: 'CONTA CORRENTE',
      marketingName: 'Conta Exemplo',
      balance: 1520.37,
      currencyCode: 'BRL',
      creditData: null,
    };

    it('traduz conta corrente para centavos e usa o nome comercial', () => {
      expect(mapAccount(base)).toEqual({
        externalId: 'acc-1',
        connectionExternalId: 'item-1',
        type: 'CHECKING',
        name: 'Conta Exemplo',
        number: '0001/12345-6',
        currency: 'BRL',
        balance: 152037,
        creditLimit: null,
        availableCredit: null,
      });
    });

    it('traduz cartão de crédito com limites', () => {
      const card = mapAccount({
        ...base,
        type: 'CREDIT',
        subtype: 'CREDIT_CARD',
        balance: 3124.8,
        creditData: { creditLimit: 15000, availableCreditLimit: 11875.2 },
      });
      expect(card).toMatchObject({
        type: 'CREDIT_CARD',
        balance: 312480,
        creditLimit: 1500000,
        availableCredit: 1187520,
      });
    });

    it('cai em OTHER para subtipos desconhecidos', () => {
      expect(mapAccount({ ...base, subtype: 'PAYMENT_ACCOUNT' }).type).toBe('OTHER');
    });
  });

  describe('mapTransaction', () => {
    it('usa `type` para o sinal, independente do sinal de `amount`', () => {
      expect(mapTransaction({ ...baseTransaction, amount: 50 }, TZ).amount).toBe(-5000);
      expect(mapTransaction({ ...baseTransaction, type: 'CREDIT', amount: -50 }, TZ).amount).toBe(
        5000,
      );
    });

    it('prefere o valor na moeda da conta', () => {
      const tx = mapTransaction(
        { ...baseTransaction, amount: -10, amountInAccountCurrency: -55.3 },
        TZ,
      );
      expect(tx.amount).toBe(-5530);
    });

    it('converte a data para o dia local', () => {
      const tx = mapTransaction({ ...baseTransaction, date: '2026-10-02T01:00:00.000Z' }, TZ);
      expect(tx.date).toBe('2026-10-01');
    });

    it('identifica Pix e a contraparte de um pagamento', () => {
      const tx = mapTransaction(
        {
          ...baseTransaction,
          operationType: 'PIX',
          paymentData: { paymentMethod: null, receiver: { name: 'Fulano' }, payer: { name: 'Eu' } },
        },
        TZ,
      );
      expect(tx).toMatchObject({ paymentMethod: 'PIX', counterpartyName: 'Fulano' });
    });

    it('usa o pagador como contraparte de uma entrada', () => {
      const tx = mapTransaction(
        {
          ...baseTransaction,
          type: 'CREDIT',
          paymentData: {
            paymentMethod: 'TED',
            payer: { name: 'Empresa' },
            receiver: { name: 'Eu' },
          },
        },
        TZ,
      );
      expect(tx).toMatchObject({ paymentMethod: 'TED', counterpartyName: 'Empresa' });
    });

    it('extrai parcelamento e fatura de compras no cartão', () => {
      const tx = mapTransaction(
        {
          ...baseTransaction,
          status: 'PENDING',
          merchant: { name: 'Loja', businessName: 'Loja LTDA' },
          creditCardMetadata: { installmentNumber: 3, totalInstallments: 10, billId: 'bill-1' },
        },
        TZ,
      );
      expect(tx).toEqual({
        externalId: 'tx-1',
        accountExternalId: 'acc-1',
        date: '2026-10-01',
        description: 'Mercado Exemplo',
        amount: -12345,
        status: 'PENDING',
        category: null,
        paymentMethod: 'CARD',
        counterpartyName: 'Loja',
        installment: { number: 3, total: 10 },
        invoiceExternalId: 'bill-1',
      });
    });

    it('ignora "parcelamento" de 1x e meios de pagamento desconhecidos', () => {
      const tx = mapTransaction(
        {
          ...baseTransaction,
          operationType: 'TARIFA_SERVICOS_AVULSOS',
          creditCardMetadata: { installmentNumber: 1, totalInstallments: 1 },
        },
        TZ,
      );
      expect(tx.installment).toBeNull();
      expect(tx.paymentMethod).toBe('CARD');
      expect(mapTransaction({ ...baseTransaction, operationType: 'SAQUE' }, TZ).paymentMethod).toBe(
        'OTHER',
      );
      expect(mapTransaction(baseTransaction, TZ).paymentMethod).toBeNull();
    });
  });

  it('mapBill traduz fatura', () => {
    expect(
      mapBill(
        {
          id: 'bill-1',
          dueDate: '2026-10-15T03:00:00.000Z',
          billClosingDate: '2026-10-08T03:00:00.000Z',
          totalAmount: 3124.8,
          totalAmountCurrencyCode: 'BRL',
          minimumPaymentAmount: 468.72,
        },
        'acc-1',
        TZ,
      ),
    ).toEqual({
      externalId: 'bill-1',
      accountExternalId: 'acc-1',
      dueDate: '2026-10-15',
      closingDate: '2026-10-08',
      total: 312480,
      minimumPayment: 46872,
      currency: 'BRL',
    });
  });

  it('mapIdentity usa o primeiro e-mail', () => {
    expect(
      mapIdentity({ fullName: 'Pessoa', taxNumber: '123', emails: [{ value: 'a@b.c' }] }),
    ).toEqual({ fullName: 'Pessoa', document: '123', email: 'a@b.c' });
  });
});

/** Payload completo no formato do `pluggy-sdk` (tipo `Loan`). */
const fullPayload = {
  id: 'loan-1',
  itemId: 'item-1',
  contractNumber: '1234567',
  ipocCode: '92792126019929279212650822221989319252576',
  productName: 'Empréstimo Pessoal Fácil',
  type: 'CREDITO_PESSOAL_SEM_CONSIGNACAO',
  kind: 'LOAN',
  date: '2026-10-20T00:00:00.000Z',
  contractDate: '2025-10-03T00:00:00.000Z',
  disbursementDates: ['2025-10-03T00:00:00.000Z'],
  settlementDate: null,
  contractAmount: 15000,
  currencyCode: 'BRL',
  dueDate: '2027-10-12T00:00:00.000Z',
  installmentPeriodicity: 'MONTHLY',
  installmentPeriodicityAdditionalInfo: null,
  firstInstallmentDueDate: '2025-11-12T00:00:00.000Z',
  CET: 0.3687,
  amortizationScheduled: 'PRICE',
  amortizationScheduledAdditionalInfo: null,
  cnpjConsignee: null,
  interestRates: [
    {
      taxType: 'EFFECTIVE',
      interestRateType: 'COMPOUND',
      taxPeriodicity: 'MONTHLY',
      calculation: '30/360',
      referentialRateIndexerType: 'PRE_FIXADO',
      referentialRateIndexerSubType: null,
      referentialRateIndexerAdditionalInfo: null,
      preFixedRate: 0.0249,
      postFixedRate: 0,
      additionalInfo: null,
    },
  ],
  contractedFees: [],
  contractedFinanceCharges: [],
  warranties: [],
  installments: {
    typeNumberOfInstallments: 'MONTH',
    totalNumberOfInstallments: 24,
    typeContractRemaining: 'MONTH',
    contractRemainingNumber: 13,
    paidInstallments: 11,
    dueInstallments: 13,
    pastDueInstallments: 0,
    balloonPayments: [
      { dueDate: '2026-12-20T00:00:00.000Z', amount: { value: 500, currencyCode: 'BRL' } },
    ],
  },
  payments: {
    contractOutstandingBalance: 8350.42,
    releases: [
      {
        isOverParcelPayment: false,
        installmentId: '10',
        paidDate: '2026-08-12T00:00:00.000Z',
        currencyCode: 'BRL',
        paidAmount: 837.8,
        overParcel: null,
      },
      {
        isOverParcelPayment: true,
        installmentId: null,
        paidDate: '2026-09-30T00:00:00.000Z',
        currencyCode: 'BRL',
        paidAmount: 1200,
        overParcel: { fees: [], charges: [] },
      },
      {
        isOverParcelPayment: false,
        installmentId: '11',
        paidDate: '2026-09-12T00:00:00.000Z',
        currencyCode: 'BRL',
        paidAmount: 837.81,
        overParcel: null,
      },
    ],
  },
};

const minimal: PluggyLoan = { id: 'loan-2', itemId: 'item-1' };

describe('mapLoan', () => {
  it('traduz o payload completo', () => {
    const loan = mapLoan(pluggyLoanSchema.parse(fullPayload), TZ);

    expect(loan).toEqual({
      externalId: 'loan-1',
      connectionExternalId: 'item-1',
      productName: 'Empréstimo Pessoal Fácil',
      type: 'CREDITO_PESSOAL_SEM_CONSIGNACAO',
      contractNumber: '1234567',
      contractedAmount: 1_500_000,
      outstandingBalance: 835_042,
      currency: 'BRL',
      // Datas de calendário em meia-noite UTC não voltam um dia no fuso local.
      contractDate: '2025-10-03',
      finalDueDate: '2027-10-12',
      firstInstallmentDueDate: '2025-11-12',
      periodicity: 'MONTHLY',
      periodicityLabel: 'Mensal',
      installments: { total: 24, paid: 11, remaining: 13, overdue: 0 },
      // Última parcela regular paga (o pagamento avulso fica de fora).
      installmentAmount: 83_781,
      scheduledInstallments: [{ dueDate: '2026-12-20', amount: 50_000 }],
      // 2,49% a.m. composto ≈ 34,33% a.a.
      interestRateAnnual: 34.33,
      cetAnnual: 36.87,
      raw: expect.objectContaining({ id: 'loan-1', ipocCode: fullPayload.ipocCode }),
    });
  });

  it('guarda o payload inteiro em raw, inclusive campos que não usamos', () => {
    const loan = mapLoan(pluggyLoanSchema.parse(fullPayload), TZ);
    expect(loan.raw).toMatchObject({ warranties: [], cnpjConsignee: null });
  });

  it('aceita o payload mínimo sem inventar valores', () => {
    expect(mapLoan(minimal, TZ)).toEqual({
      externalId: 'loan-2',
      connectionExternalId: 'item-1',
      productName: 'Empréstimo',
      type: null,
      contractNumber: null,
      contractedAmount: null,
      outstandingBalance: null,
      currency: 'BRL',
      contractDate: null,
      finalDueDate: null,
      firstInstallmentDueDate: null,
      periodicity: null,
      periodicityLabel: null,
      installments: { total: null, paid: null, remaining: null, overdue: null },
      installmentAmount: null,
      scheduledInstallments: [],
      interestRateAnnual: null,
      cetAnnual: null,
      raw: minimal,
    });
  });

  it('valida o payload mínimo no schema', () => {
    expect(pluggyLoanSchema.safeParse({ id: 'x', itemId: 'y' }).success).toBe(true);
    expect(pluggyLoanSchema.safeParse({ id: 'x' }).success).toBe(false);
    expect(
      pluggyLoanSchema.safeParse({ id: 'x', itemId: 'y', contractAmount: '1000,00' }).success,
    ).toBe(false);
  });

  it.each([
    ['AQUISICAO_BENS_VEICULOS_AUTOMOTORES', null, 'Financiamento de veículo'],
    ['CREDITO_PESSOAL_COM_CONSIGNACAO', null, 'Crédito consignado'],
    ['FINANCIAMENTO_HABITACIONAL_SFH', 'FINANCING', 'Financiamento imobiliário (SFH)'],
    ['CHEQUE_ESPECIAL', 'LOAN', 'Cheque especial'],
    ['PERSONAL_LOAN', null, 'Crédito pessoal'],
    // Modalidade desconhecida: cai na família, depois no código legível.
    ['MODALIDADE_NOVA', 'FINANCING', 'Financiamento'],
    ['MODALIDADE_NOVA', null, 'Modalidade nova'],
    [null, 'INVOICE_FINANCING', 'Antecipação de recebíveis'],
  ])('sem productName, nomeia %s (%s) como "%s"', (type, kind, expected) => {
    const loan = mapLoan({ ...minimal, productName: '  ', type, kind }, TZ);
    expect(loan.productName).toBe(expected);
    expect(loan.type).toBe(type);
  });

  it.each([
    ['WITHOUT_REGULAR_PERIODICITY', null, 'IRREGULAR', 'Sem periodicidade regular'],
    ['SEMESTERLY', null, 'SEMIANNUAL', 'Semestral'],
    ['OTHERS', 'A cada 45 dias', 'OTHER', 'A cada 45 dias'],
    ['OTHERS', null, 'OTHER', 'Outra'],
    ['ALGO_NOVO', null, 'OTHER', 'Outra'],
  ])('periodicidade %s vira %s', (raw, info, periodicity, label) => {
    const loan = mapLoan(
      {
        ...minimal,
        installmentPeriodicity: raw,
        installmentPeriodicityAdditionalInfo: info,
      },
      TZ,
    );
    expect(loan).toMatchObject({ periodicity, periodicityLabel: label });
  });

  it('não trata prazo em dias como quantidade de parcelas', () => {
    const loan = mapLoan(
      {
        ...minimal,
        installmentPeriodicity: 'MONTHLY',
        installments: {
          typeNumberOfInstallments: 'DAY',
          totalNumberOfInstallments: 720,
          typeContractRemaining: 'DAY',
          contractRemainingNumber: 365,
          paidInstallments: 12,
          dueInstallments: null,
          pastDueInstallments: 1,
        },
      },
      TZ,
    );
    expect(loan.installments).toEqual({ total: null, paid: 12, remaining: null, overdue: 1 });
  });

  it('deriva as parcelas a vencer do total quando o banco não informa', () => {
    const loan = mapLoan(
      {
        ...minimal,
        installments: {
          totalNumberOfInstallments: 48,
          paidInstallments: 3,
          pastDueInstallments: 1,
        },
      },
      TZ,
    );
    expect(loan.installments).toEqual({ total: 48, paid: 3, remaining: 44, overdue: 1 });
  });

  it('não informa o valor da parcela em SAC (parcela muda todo mês)', () => {
    const loan = mapLoan(
      pluggyLoanSchema.parse({ ...fullPayload, amortizationScheduled: 'SAC' }),
      TZ,
    );
    expect(loan.installmentAmount).toBeNull();
  });

  it.each([
    [{ taxPeriodicity: 'YEARLY', preFixedRate: 0.1899 }, 18.99],
    [{ taxPeriodicity: 'MONTHLY', interestRateType: 'SIMPLE', preFixedRate: 0.02 }, 24],
    // Pós-fixado (ex.: CDI + 1,5%): depende do indexador.
    [{ taxPeriodicity: 'YEARLY', preFixedRate: 0, postFixedRate: 0.015 }, null],
    // Sem periodicidade da taxa não dá para saber se é ao mês ou ao ano.
    [{ taxPeriodicity: null, preFixedRate: 0.02 }, null],
  ])('converte a taxa %o para %s%% a.a.', (rate, expected) => {
    const loan = mapLoan({ ...minimal, interestRates: [rate] }, TZ);
    expect(loan.interestRateAnnual).toBe(expected);
  });

  it('leva um instante de verdade para o dia local', () => {
    const loan = mapLoan({ ...minimal, contractDate: '2026-01-10T02:00:00.000Z' }, TZ);
    expect(loan.contractDate).toBe('2026-01-09');
  });
});
