import { z } from 'zod';

/**
 * Formato bruto das respostas da Pluggy — só os campos que usamos. Validar na
 * fronteira faz uma mudança de contrato falhar alto aqui, em vez de gravar
 * lixo no banco. Campos enumerados ficam como `string` para tolerar valores
 * novos; o mapper decide o que fazer com eles.
 */

const isoDateTime = z.string().min(10);

export const pluggyAuthSchema = z.object({ apiKey: z.string().min(1) });

export const pluggyItemSchema = z.object({
  id: z.string(),
  status: z.string(),
  lastUpdatedAt: isoDateTime.nullish(),
  connector: z.object({
    name: z.string(),
    imageUrl: z.string().nullish(),
  }),
});

export const pluggyIdentitySchema = z.object({
  fullName: z.string().nullish(),
  document: z.string().nullish(),
  taxNumber: z.string().nullish(),
  emails: z.array(z.object({ value: z.string() })).nullish(),
});

export const pluggyAccountSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  type: z.string(),
  subtype: z.string().nullish(),
  number: z.string().nullish(),
  name: z.string(),
  marketingName: z.string().nullish(),
  balance: z.number(),
  currencyCode: z.string().nullish(),
  creditData: z
    .object({
      creditLimit: z.number().nullish(),
      availableCreditLimit: z.number().nullish(),
    })
    .nullish(),
});

const participantSchema = z.object({ name: z.string().nullish() }).nullish();

export const pluggyTransactionSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  date: isoDateTime,
  description: z.string().nullish(),
  descriptionRaw: z.string().nullish(),
  type: z.enum(['DEBIT', 'CREDIT']),
  amount: z.number(),
  amountInAccountCurrency: z.number().nullish(),
  status: z.string().nullish(),
  category: z.string().nullish(),
  operationType: z.string().nullish(),
  paymentData: z
    .object({
      paymentMethod: z.string().nullish(),
      payer: participantSchema,
      receiver: participantSchema,
    })
    .nullish(),
  merchant: z
    .object({
      name: z.string().nullish(),
      businessName: z.string().nullish(),
    })
    .nullish(),
  creditCardMetadata: z
    .object({
      installmentNumber: z.number().nullish(),
      totalInstallments: z.number().nullish(),
      billId: z.string().nullish(),
    })
    .nullish(),
});

export const pluggyBillSchema = z.object({
  id: z.string(),
  dueDate: isoDateTime,
  billClosingDate: isoDateTime.nullish(),
  totalAmount: z.number(),
  totalAmountCurrencyCode: z.string().nullish(),
  minimumPaymentAmount: z.number().nullish(),
});

const nullableNumber = z.number().nullish();

/**
 * Empréstimo/financiamento (`GET /loans`, produto de crédito do Open Finance).
 * Só `id` e `itemId` são obrigatórios: o resto o banco pode não informar. Os
 * tipos dos campos usados (números e datas) continuam validados — um valor em
 * formato diferente falha alto. Objeto "solto" para guardar o payload inteiro
 * em `raw`.
 */
export const pluggyLoanSchema = z.looseObject({
  id: z.string(),
  itemId: z.string(),
  contractNumber: z.string().nullish(),
  ipocCode: z.string().nullish(),
  productName: z.string().nullish(),
  type: z.string().nullish(),
  kind: z.string().nullish(),
  contractDate: isoDateTime.nullish(),
  contractAmount: nullableNumber,
  currencyCode: z.string().nullish(),
  dueDate: isoDateTime.nullish(),
  installmentPeriodicity: z.string().nullish(),
  installmentPeriodicityAdditionalInfo: z.string().nullish(),
  firstInstallmentDueDate: isoDateTime.nullish(),
  CET: nullableNumber,
  amortizationScheduled: z.string().nullish(),
  interestRates: z
    .array(
      z.object({
        taxType: z.string().nullish(),
        interestRateType: z.string().nullish(),
        taxPeriodicity: z.string().nullish(),
        preFixedRate: nullableNumber,
        postFixedRate: nullableNumber,
      }),
    )
    .nullish(),
  installments: z
    .object({
      typeNumberOfInstallments: z.string().nullish(),
      totalNumberOfInstallments: nullableNumber,
      typeContractRemaining: z.string().nullish(),
      contractRemainingNumber: nullableNumber,
      paidInstallments: nullableNumber,
      dueInstallments: nullableNumber,
      pastDueInstallments: nullableNumber,
      balloonPayments: z
        .array(
          z.object({
            dueDate: isoDateTime.nullish(),
            amount: z
              .object({ value: nullableNumber, currencyCode: z.string().nullish() })
              .nullish(),
          }),
        )
        .nullish(),
    })
    .nullish(),
  payments: z
    .object({
      contractOutstandingBalance: nullableNumber,
      releases: z
        .array(
          z.object({
            isOverParcelPayment: z.boolean().nullish(),
            installmentId: z.string().nullish(),
            paidDate: isoDateTime.nullish(),
            paidAmount: nullableNumber,
          }),
        )
        .nullish(),
    })
    .nullish(),
});

export const pageResponseSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    results: z.array(item),
    page: z.number().int(),
    totalPages: z.number().int(),
  });

export const cursorPageResponseSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    results: z.array(item),
    next: z.string().nullish(),
  });

export type PluggyItem = z.infer<typeof pluggyItemSchema>;
export type PluggyIdentity = z.infer<typeof pluggyIdentitySchema>;
export type PluggyAccount = z.infer<typeof pluggyAccountSchema>;
export type PluggyTransaction = z.infer<typeof pluggyTransactionSchema>;
export type PluggyBill = z.infer<typeof pluggyBillSchema>;
export type PluggyLoan = z.infer<typeof pluggyLoanSchema>;
