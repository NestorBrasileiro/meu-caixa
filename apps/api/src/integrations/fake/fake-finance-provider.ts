import { addDays, today } from '../../domain/dates.js';
import type {
  Account,
  Cents,
  Connection,
  DateRange,
  Invoice,
  IsoDate,
  PaymentMethod,
  Profile,
  Transaction,
} from '../../domain/finance.js';
import type { FinanceProvider } from '../finance-provider.js';

interface Rule {
  accountId: string;
  slug: string;
  description: string;
  counterpartyName: string | null;
  category: string;
  paymentMethod: PaymentMethod;
  /** Decide se a regra gera lançamento no dia e com qual valor (centavos, com sinal). */
  amountOn: (day: Day) => Cents | null;
  installmentsOf?: number;
}

interface Day {
  date: IsoDate;
  dayOfMonth: number;
  weekday: number;
  /** Número pseudoaleatório estável por dia, para variar valores. */
  seed: number;
}

const CHECKING = 'fake-checking';
const SAVINGS = 'fake-savings';
const CARD = 'fake-card';

const RULES: Rule[] = [
  {
    accountId: CHECKING,
    slug: 'salario',
    description: 'Salário',
    counterpartyName: 'Empresa Exemplo Ltda',
    category: 'Salary',
    paymentMethod: 'TED',
    amountOn: (d) => (d.dayOfMonth === 5 ? 900_000 : null),
  },
  {
    accountId: CHECKING,
    slug: 'terreno',
    description: 'Parcela terreno',
    counterpartyName: 'Loteadora Exemplo',
    category: 'Housing',
    paymentMethod: 'BOLETO',
    amountOn: (d) => (d.dayOfMonth === 10 ? -230_000 : null),
  },
  {
    accountId: CHECKING,
    slug: 'fatura',
    description: 'Pagamento fatura cartão',
    counterpartyName: 'Cartão Exemplo',
    category: 'Credit card payment',
    paymentMethod: 'OTHER',
    amountOn: (d) => (d.dayOfMonth === 15 ? -(280_000 + (d.seed % 60_000)) : null),
  },
  {
    accountId: CHECKING,
    slug: 'luz',
    description: 'Conta de luz',
    counterpartyName: 'Energia Exemplo S.A.',
    category: 'Utilities',
    paymentMethod: 'BOLETO',
    amountOn: (d) => (d.dayOfMonth === 20 ? -(15_000 + (d.seed % 8_000)) : null),
  },
  {
    accountId: CHECKING,
    slug: 'mercado',
    description: 'Supermercado',
    counterpartyName: 'Mercado Exemplo',
    category: 'Groceries',
    paymentMethod: 'PIX',
    amountOn: (d) => (d.weekday === 6 ? -(25_000 + (d.seed % 15_000)) : null),
  },
  {
    accountId: SAVINGS,
    slug: 'aporte-carro',
    description: 'Aporte entrada do carro',
    counterpartyName: null,
    category: 'Transfer - Savings',
    paymentMethod: 'OTHER',
    amountOn: (d) => (d.dayOfMonth === 6 ? 150_000 : null),
  },
  {
    accountId: CARD,
    slug: 'delivery',
    description: 'Delivery Exemplo',
    counterpartyName: 'Delivery Exemplo',
    category: 'Food delivery',
    paymentMethod: 'CARD',
    amountOn: (d) => (d.weekday === 5 || d.weekday === 6 ? -(4_500 + (d.seed % 3_000)) : null),
  },
  {
    accountId: CARD,
    slug: 'streaming',
    description: 'Streaming Exemplo',
    counterpartyName: 'Streaming Exemplo',
    category: 'Video streaming',
    paymentMethod: 'CARD',
    amountOn: (d) => (d.dayOfMonth === 1 ? -5_590 : null),
  },
  {
    accountId: CARD,
    slug: 'transporte',
    description: 'Corrida de app',
    counterpartyName: 'Mobilidade Exemplo',
    category: 'Taxi and ride-hailing',
    paymentMethod: 'CARD',
    amountOn: (d) => (d.weekday === 2 || d.weekday === 4 ? -(1_800 + (d.seed % 3_000)) : null),
  },
  {
    accountId: CARD,
    slug: 'loja',
    description: 'Loja Exemplo',
    counterpartyName: 'Loja Exemplo',
    category: 'Shopping',
    paymentMethod: 'CARD',
    amountOn: (d) => (d.dayOfMonth === 12 ? -45_000 : null),
    installmentsOf: 10,
  },
];

/** Quantos dias para trás os lançamentos ainda aparecem como pendentes. */
const PENDING_DAYS = 2;

/**
 * Provedor com dados fictícios e determinísticos. Serve para desenvolver a
 * interface e rodar os testes sem credenciais da Pluggy
 * (`FINANCE_PROVIDER=fake`).
 */
export class FakeFinanceProvider implements FinanceProvider {
  readonly name = 'fake';

  constructor(private readonly options: { timeZone: string; now?: () => Date }) {}

  async getProfile(): Promise<Profile> {
    return { fullName: 'Pessoa Exemplo', document: null, email: 'pessoa@example.com' };
  }

  async getConnections(): Promise<Connection[]> {
    const lastRefreshedAt = this.now();
    return [
      {
        externalId: 'fake-bank',
        institutionName: 'Banco Exemplo',
        institutionLogoUrl: null,
        status: 'ACTIVE',
        lastRefreshedAt,
      },
      {
        externalId: 'fake-card-issuer',
        institutionName: 'Cartão Exemplo',
        institutionLogoUrl: null,
        status: 'ACTIVE',
        lastRefreshedAt,
      },
    ];
  }

  async getAccounts(): Promise<Account[]> {
    return [
      {
        externalId: CHECKING,
        connectionExternalId: 'fake-bank',
        type: 'CHECKING',
        name: 'Conta corrente',
        number: '12345-6',
        currency: 'BRL',
        balance: 845_032,
        creditLimit: null,
        availableCredit: null,
      },
      {
        externalId: SAVINGS,
        connectionExternalId: 'fake-bank',
        type: 'SAVINGS',
        name: 'Poupança',
        number: '12345-7',
        currency: 'BRL',
        balance: 1_250_000,
        creditLimit: null,
        availableCredit: null,
      },
      {
        externalId: CARD,
        connectionExternalId: 'fake-card-issuer',
        type: 'CREDIT_CARD',
        name: 'Cartão Exemplo Platinum',
        number: '4321',
        currency: 'BRL',
        balance: 312_480,
        creditLimit: 1_500_000,
        availableCredit: 1_187_520,
      },
    ];
  }

  async getTransactions(accountId: string, range: DateRange): Promise<Transaction[]> {
    const todayDate = today(this.options.timeZone, this.now());
    const last = range.to < todayDate ? range.to : todayDate;
    const pendingFrom = addDays(todayDate, -PENDING_DAYS);
    const rules = RULES.filter((rule) => rule.accountId === accountId);
    const transactions: Transaction[] = [];

    for (let date = range.from; date <= last; date = addDays(date, 1)) {
      const day = dayOf(date);
      for (const rule of rules) {
        const amount = rule.amountOn(day);
        if (amount === null) continue;
        transactions.push({
          externalId: `${accountId}:${date}:${rule.slug}`,
          accountExternalId: accountId,
          date,
          description: rule.description,
          amount,
          status: date > pendingFrom ? 'PENDING' : 'POSTED',
          category: rule.category,
          paymentMethod: rule.paymentMethod,
          counterpartyName: rule.counterpartyName,
          installment: rule.installmentsOf
            ? { number: (monthIndex(date) % rule.installmentsOf) + 1, total: rule.installmentsOf }
            : null,
          invoiceExternalId: accountId === CARD ? invoiceIdFor(date) : null,
        });
      }
    }
    return transactions;
  }

  async getInvoices(accountId: string): Promise<Invoice[]> {
    if (accountId !== CARD) return [];
    const current = today(this.options.timeZone, this.now());
    const invoices: Invoice[] = [];
    for (let offset = -5; offset <= 1; offset++) {
      const month = shiftMonth(current.slice(0, 7), offset);
      const seed = hash(month);
      invoices.push({
        externalId: `fake-invoice:${month}`,
        accountExternalId: CARD,
        dueDate: `${month}-15`,
        closingDate: `${month}-08`,
        total: 280_000 + (seed % 60_000),
        minimumPayment: 42_000,
        currency: 'BRL',
      });
    }
    return invoices;
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}

function dayOf(date: IsoDate): Day {
  const parsed = new Date(`${date}T12:00:00Z`);
  return {
    date,
    dayOfMonth: parsed.getUTCDate(),
    weekday: parsed.getUTCDay(),
    seed: hash(date),
  };
}

function hash(value: string): number {
  let result = 0;
  for (const char of value) result = (result * 31 + char.charCodeAt(0)) >>> 0;
  return result;
}

function monthIndex(date: IsoDate): number {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
}

/** `YYYY-MM` deslocado em N meses. */
function shiftMonth(month: string, offset: number): string {
  const index = monthIndex(`${month}-01`) + offset;
  const year = Math.floor(index / 12);
  return `${year}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** Compras até o dia 8 entram na fatura do mês; depois, na do mês seguinte. */
function invoiceIdFor(date: IsoDate): string {
  const month = date.slice(0, 7);
  return `fake-invoice:${Number(date.slice(8, 10)) <= 8 ? month : shiftMonth(month, 1)}`;
}
