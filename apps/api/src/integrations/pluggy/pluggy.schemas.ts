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
