import { mapAccount, mapBill, mapIdentity, mapItem, mapTransaction } from './pluggy.mapper.js';
import type { PluggyAccount, PluggyTransaction } from './pluggy.schemas.js';

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
