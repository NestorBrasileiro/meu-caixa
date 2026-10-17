import type {
  Account,
  Cents,
  Connection,
  Invoice,
  IsoDate,
  PaymentMethod,
  SyncRun,
  Transaction,
} from "@/lib/api/types"

/**
 * Dados fictícios e determinísticos no formato exato da API. Nada aqui usa o
 * relógio nem `Math.random` (proibidos na pré-renderização do Next com Cache
 * Components): tudo deriva de `MOCK_TODAY` e de um PRNG com semente.
 */

/** "Hoje" no mundo mocado. */
export const MOCK_TODAY: IsoDate = "2026-10-07"
/** Instante de referência (meio-dia em São Paulo) para "há X horas". */
export const MOCK_NOW = "2026-10-07T15:00:00.000Z"
const HISTORY_DAYS = 365
/** Lançamentos dos últimos dias ainda aparecem como pendentes. */
const PENDING_DAYS = 2
const CARD_CLOSING_DAY = 8
const CARD_DUE_DAY = 15

export const IDS = {
  bank: "c0a1b2c3-0001-4000-8000-000000000001",
  card: "c0a1b2c3-0002-4000-8000-000000000002",
  digital: "c0a1b2c3-0003-4000-8000-000000000003",
  checking: "a0a1b2c3-0001-4000-8000-000000000001",
  savings: "a0a1b2c3-0002-4000-8000-000000000002",
  creditCard: "a0a1b2c3-0003-4000-8000-000000000003",
  digitalChecking: "a0a1b2c3-0004-4000-8000-000000000004",
} as const

// ---------------------------------------------------------------- utilidades

function hash(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** PRNG mulberry32: mesmo `seed`, mesma sequência. */
function prng(seed: string): () => number {
  let a = hash(seed)
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function monthOf(date: IsoDate): string {
  return date.slice(0, 7)
}

function shiftMonth(month: string, offset: number): string {
  const [year, m] = month.split("-").map(Number)
  const index = year * 12 + (m - 1) + offset
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`
}

/** Valor entre `min` e `max` reais, em centavos, arredondado a 10 centavos. */
function between(random: () => number, min: number, max: number): Cents {
  return Math.round((min + random() * (max - min)) * 10) * 10
}

// ------------------------------------------------------------------- regras

interface Day {
  date: IsoDate
  dayOfMonth: number
  weekday: number
  random: () => number
}

interface Rule {
  accountId: string
  slug: string
  description: string
  counterpartyName: string | null
  category: string
  paymentMethod: PaymentMethod
  /** Valor com sinal (centavos) ou null se não houver lançamento no dia. */
  amountOn: (day: Day) => Cents | null
  installmentsOf?: number
}

const RULES: Rule[] = [
  // Conta corrente
  {
    accountId: IDS.checking,
    slug: "salario",
    description: "Salário",
    counterpartyName: "Empresa Exemplo Ltda",
    category: "Salary",
    paymentMethod: "TED",
    amountOn: (d) => (d.dayOfMonth === 5 ? 9_000_00 : null),
  },
  {
    accountId: IDS.checking,
    slug: "terreno",
    description: "Parcela terreno",
    counterpartyName: "Loteadora Exemplo",
    category: "Housing",
    paymentMethod: "BOLETO",
    amountOn: (d) => (d.dayOfMonth === 10 ? -2_300_00 : null),
  },
  {
    accountId: IDS.checking,
    slug: "aporte",
    description: "Aporte poupança — entrada do carro",
    counterpartyName: null,
    category: "Transfer - Savings",
    paymentMethod: "OTHER",
    amountOn: (d) => (d.dayOfMonth === 6 ? -1_500_00 : null),
  },
  {
    accountId: IDS.checking,
    slug: "luz",
    description: "Conta de luz",
    counterpartyName: "Energia Exemplo S.A.",
    category: "Electricity",
    paymentMethod: "BOLETO",
    amountOn: (d) => (d.dayOfMonth === 20 ? -between(d.random, 140, 240) : null),
  },
  {
    accountId: IDS.checking,
    slug: "internet",
    description: "Internet fibra",
    counterpartyName: "Fibra Exemplo",
    category: "Internet",
    paymentMethod: "BOLETO",
    amountOn: (d) => (d.dayOfMonth === 12 ? -119_90 : null),
  },
  {
    accountId: IDS.checking,
    slug: "celular",
    description: "Plano de celular",
    counterpartyName: "Operadora Exemplo",
    category: "Telecommunications",
    paymentMethod: "OTHER",
    amountOn: (d) => (d.dayOfMonth === 18 ? -59_90 : null),
  },
  {
    accountId: IDS.checking,
    slug: "tarifa",
    description: "Tarifa pacote de serviços",
    counterpartyName: "Banco Exemplo",
    category: "Bank fees",
    paymentMethod: "OTHER",
    amountOn: (d) => (d.dayOfMonth === 1 ? -34_90 : null),
  },
  {
    accountId: IDS.checking,
    slug: "mercado",
    description: "Supermercado",
    counterpartyName: "Mercado Exemplo",
    category: "Groceries",
    paymentMethod: "PIX",
    amountOn: (d) => (d.weekday === 6 ? -between(d.random, 230, 420) : null),
  },
  {
    accountId: IDS.checking,
    slug: "farmacia",
    description: "Farmácia",
    counterpartyName: "Drogaria Exemplo",
    category: "Pharmacy",
    paymentMethod: "PIX",
    amountOn: (d) => (d.random() < 0.06 ? -between(d.random, 25, 160) : null),
  },
  {
    accountId: IDS.checking,
    slug: "pix-enviado",
    description: "Pix enviado",
    counterpartyName: "Maria Souza",
    category: "Transfers",
    paymentMethod: "PIX",
    amountOn: (d) => (d.random() < 0.03 ? -between(d.random, 30, 250) : null),
  },
  // Poupança
  {
    accountId: IDS.savings,
    slug: "aporte",
    description: "Aporte — entrada do carro",
    counterpartyName: null,
    category: "Transfer - Savings",
    paymentMethod: "OTHER",
    amountOn: (d) => (d.dayOfMonth === 6 ? 1_500_00 : null),
  },
  {
    accountId: IDS.savings,
    slug: "rendimento",
    description: "Rendimento",
    counterpartyName: "Banco Exemplo",
    category: "Investment income",
    paymentMethod: "OTHER",
    amountOn: (d) => (d.dayOfMonth === 1 ? between(d.random, 40, 75) : null),
  },
  // Cartão de crédito
  {
    accountId: IDS.creditCard,
    slug: "delivery",
    description: "Delivery Exemplo",
    counterpartyName: "Delivery Exemplo",
    category: "Food delivery",
    paymentMethod: "CARD",
    amountOn: (d) =>
      d.weekday === 5 || d.weekday === 6 || d.random() < 0.12
        ? -between(d.random, 38, 95)
        : null,
  },
  {
    accountId: IDS.creditCard,
    slug: "restaurante",
    description: "Restaurante",
    counterpartyName: "Bistrô Exemplo",
    category: "Restaurants",
    paymentMethod: "CARD",
    amountOn: (d) => (d.weekday === 0 && d.random() < 0.55 ? -between(d.random, 80, 190) : null),
  },
  {
    accountId: IDS.creditCard,
    slug: "streaming-video",
    description: "Streaming de vídeo",
    counterpartyName: "Streaming Exemplo",
    category: "Video streaming",
    paymentMethod: "CARD",
    amountOn: (d) => (d.dayOfMonth === 1 ? -55_90 : null),
  },
  {
    accountId: IDS.creditCard,
    slug: "streaming-extra",
    description: "Streaming Plus",
    counterpartyName: "Streaming Plus",
    category: "Video streaming",
    paymentMethod: "CARD",
    amountOn: (d) => (d.dayOfMonth === 22 ? -39_90 : null),
  },
  {
    accountId: IDS.creditCard,
    slug: "musica",
    description: "Streaming de música",
    counterpartyName: "Música Exemplo",
    category: "Music streaming",
    paymentMethod: "CARD",
    amountOn: (d) => (d.dayOfMonth === 3 ? -21_90 : null),
  },
  {
    accountId: IDS.creditCard,
    slug: "academia",
    description: "Academia",
    counterpartyName: "Academia Exemplo",
    category: "Gyms and fitness centers",
    paymentMethod: "CARD",
    amountOn: (d) => (d.dayOfMonth === 8 ? -129_90 : null),
  },
  {
    accountId: IDS.creditCard,
    slug: "corrida",
    description: "Corrida de app",
    counterpartyName: "Mobilidade Exemplo",
    category: "Taxi and ride-hailing",
    paymentMethod: "CARD",
    amountOn: (d) =>
      (d.weekday === 2 || d.weekday === 4) && d.random() < 0.8 ? -between(d.random, 16, 48) : null,
  },
  {
    accountId: IDS.creditCard,
    slug: "combustivel",
    description: "Posto de combustível",
    counterpartyName: "Posto Exemplo",
    category: "Gas stations",
    paymentMethod: "CARD",
    amountOn: (d) => (d.dayOfMonth % 10 === 3 ? -between(d.random, 190, 290) : null),
  },
  {
    accountId: IDS.creditCard,
    slug: "loja",
    description: "Loja Exemplo",
    counterpartyName: "Loja Exemplo",
    category: "Shopping",
    paymentMethod: "CARD",
    amountOn: (d) => (d.dayOfMonth === 12 ? -450_00 : null),
    installmentsOf: 10,
  },
  {
    accountId: IDS.creditCard,
    slug: "online",
    description: "Compra online",
    counterpartyName: "Marketplace Exemplo",
    category: "Online shopping",
    paymentMethod: "CARD",
    amountOn: (d) => (d.random() < 0.05 ? -between(d.random, 60, 380) : null),
  },
  // Banco digital (conexão pedindo reautenticação: parou de sincronizar)
  {
    accountId: IDS.digitalChecking,
    slug: "pix-recebido",
    description: "Pix recebido",
    counterpartyName: "João Lima",
    category: "Transfers",
    paymentMethod: "PIX",
    amountOn: (d) => (d.random() < 0.04 ? between(d.random, 50, 300) : null),
  },
]

/** Até quando a conexão do banco digital sincronizou antes de pedir login. */
const DIGITAL_SYNCED_THROUGH: IsoDate = "2026-09-28"

/** Compras até o fechamento entram na fatura do mês; depois, na seguinte. */
export function invoiceMonthFor(date: IsoDate): string {
  const day = Number(date.slice(8, 10))
  return day <= CARD_CLOSING_DAY ? monthOf(date) : shiftMonth(monthOf(date), 1)
}

function invoiceId(month: string): string {
  return `inv-${month}`
}

// ------------------------------------------------------------------ geração

function generateTransactions(): Transaction[] {
  const transactions: Transaction[] = []
  const start = addDays(MOCK_TODAY, -HISTORY_DAYS)
  const pendingFrom = addDays(MOCK_TODAY, -PENDING_DAYS)

  for (let date = start; date <= MOCK_TODAY; date = addDays(date, 1)) {
    const parsed = new Date(`${date}T12:00:00Z`)
    for (const rule of RULES) {
      if (rule.accountId === IDS.digitalChecking && date > DIGITAL_SYNCED_THROUGH) continue
      const day: Day = {
        date,
        dayOfMonth: parsed.getUTCDate(),
        weekday: parsed.getUTCDay(),
        random: prng(`${rule.slug}:${date}`),
      }
      const amount = rule.amountOn(day)
      if (amount === null) continue

      const isCard = rule.accountId === IDS.creditCard
      const monthIndex = Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7))
      transactions.push({
        id: `tx-${rule.slug}-${rule.accountId.slice(-4)}-${date}`,
        accountId: rule.accountId,
        date,
        description: rule.description,
        amount,
        status: date > pendingFrom ? "PENDING" : "POSTED",
        category: rule.category,
        originalCategory: rule.category,
        paymentMethod: rule.paymentMethod,
        counterpartyName: rule.counterpartyName,
        installment: rule.installmentsOf
          ? { number: (monthIndex % rule.installmentsOf) + 1, total: rule.installmentsOf }
          : null,
        invoiceExternalId: isCard ? invoiceId(invoiceMonthFor(date)) : null,
      })
    }
  }

  // Pagamento de cada fatura vencida sai da conta corrente, no valor exato.
  for (const invoice of generateInvoices(transactions)) {
    if (invoice.dueDate > MOCK_TODAY || invoice.dueDate < start) continue
    transactions.push({
      id: `tx-fatura-${invoice.dueDate}`,
      accountId: IDS.checking,
      date: invoice.dueDate,
      description: "Pagamento fatura cartão",
      amount: -invoice.total,
      status: "POSTED",
      category: "Credit card payment",
      originalCategory: "Credit card payment",
      paymentMethod: "OTHER",
      counterpartyName: "Cartão Exemplo",
      installment: null,
      invoiceExternalId: null,
    })
  }

  return transactions.sort((a, b) =>
    a.date === b.date ? a.id.localeCompare(b.id) : b.date.localeCompare(a.date),
  )
}

function generateInvoices(transactions: Transaction[]): Invoice[] {
  const totals = new Map<string, Cents>()
  for (const tx of transactions) {
    if (tx.accountId !== IDS.creditCard || !tx.invoiceExternalId) continue
    totals.set(tx.invoiceExternalId, (totals.get(tx.invoiceExternalId) ?? 0) - tx.amount)
  }
  return [...totals.entries()]
    .map(([id, total]) => {
      const month = id.slice(4)
      return {
        id,
        accountId: IDS.creditCard,
        dueDate: `${month}-${CARD_DUE_DAY}`,
        closingDate: `${month}-0${CARD_CLOSING_DAY}`,
        total,
        minimumPayment: Math.round(total * 0.15),
        currency: "BRL",
      }
    })
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
}

// --------------------------------------------------------------- dataset

export interface MockDataset {
  connections: Connection[]
  accounts: Account[]
  transactions: Transaction[]
  invoices: Invoice[]
  syncRuns: SyncRun[]
}

function build(): MockDataset {
  const transactions = generateTransactions()
  const invoices = generateInvoices(transactions)
  const openInvoice = invoices.find((invoice) => invoice.dueDate >= MOCK_TODAY)
  const cardLimit = 15_000_00
  const cardBalance = openInvoice?.total ?? 0

  const connections: Connection[] = [
    {
      id: IDS.bank,
      institutionName: "Banco Exemplo",
      institutionLogoUrl: null,
      status: "ACTIVE",
      lastRefreshedAt: "2026-10-07T09:12:00.000Z",
      updatedAt: "2026-10-07T12:00:41.000Z",
    },
    {
      id: IDS.card,
      institutionName: "Cartão Exemplo",
      institutionLogoUrl: null,
      status: "ACTIVE",
      lastRefreshedAt: "2026-10-07T08:47:00.000Z",
      updatedAt: "2026-10-07T12:00:41.000Z",
    },
    {
      id: IDS.digital,
      institutionName: "Banco Digital Exemplo",
      institutionLogoUrl: null,
      status: "ACTION_REQUIRED",
      lastRefreshedAt: "2026-09-28T10:03:00.000Z",
      updatedAt: "2026-10-07T12:00:41.000Z",
    },
  ]

  const base = { currency: "BRL", updatedAt: "2026-10-07T12:00:41.000Z" }
  const accounts: Account[] = [
    {
      ...base,
      id: IDS.checking,
      connectionId: IDS.bank,
      institutionName: "Banco Exemplo",
      connectionStatus: "ACTIVE",
      type: "CHECKING",
      name: "Conta corrente",
      number: "0001 / 12345-6",
      balance: 8_450_32,
      creditLimit: null,
      availableCredit: null,
      transactionsSyncedThrough: MOCK_TODAY,
    },
    {
      ...base,
      id: IDS.savings,
      connectionId: IDS.bank,
      institutionName: "Banco Exemplo",
      connectionStatus: "ACTIVE",
      type: "SAVINGS",
      name: "Poupança",
      number: "0001 / 12345-7",
      balance: 12_500_00,
      creditLimit: null,
      availableCredit: null,
      transactionsSyncedThrough: MOCK_TODAY,
    },
    {
      ...base,
      id: IDS.creditCard,
      connectionId: IDS.card,
      institutionName: "Cartão Exemplo",
      connectionStatus: "ACTIVE",
      type: "CREDIT_CARD",
      name: "Cartão Exemplo Platinum",
      number: "•••• 4321",
      balance: cardBalance,
      creditLimit: cardLimit,
      availableCredit: cardLimit - cardBalance,
      transactionsSyncedThrough: MOCK_TODAY,
    },
    {
      ...base,
      id: IDS.digitalChecking,
      connectionId: IDS.digital,
      institutionName: "Banco Digital Exemplo",
      connectionStatus: "ACTION_REQUIRED",
      type: "CHECKING",
      name: "Conta digital",
      number: "98765-4",
      balance: 1_230_55,
      creditLimit: null,
      availableCredit: null,
      transactionsSyncedThrough: DIGITAL_SYNCED_THROUGH,
    },
  ]

  const syncRuns: SyncRun[] = [
    {
      id: "5e0c0001-0000-4000-8000-000000000001",
      provider: "pluggy",
      trigger: "SCHEDULED",
      status: "PARTIAL",
      startedAt: "2026-10-07T12:00:00.000Z",
      finishedAt: "2026-10-07T12:00:41.000Z",
      stats: {
        connections: 3,
        accounts: 4,
        transactions: 38,
        removedPendingTransactions: 1,
        invoices: 13,
      },
      errors: ['Transações de "Conta digital": banco pediu nova autenticação'],
    },
    {
      id: "5e0c0002-0000-4000-8000-000000000002",
      provider: "pluggy",
      trigger: "SCHEDULED",
      status: "SUCCEEDED",
      startedAt: "2026-10-07T06:00:00.000Z",
      finishedAt: "2026-10-07T06:00:37.000Z",
      stats: {
        connections: 3,
        accounts: 4,
        transactions: 35,
        removedPendingTransactions: 0,
        invoices: 13,
      },
      errors: [],
    },
    {
      id: "5e0c0003-0000-4000-8000-000000000003",
      provider: "pluggy",
      trigger: "MANUAL",
      status: "SUCCEEDED",
      startedAt: "2026-10-06T21:14:00.000Z",
      finishedAt: "2026-10-06T21:14:29.000Z",
      stats: {
        connections: 3,
        accounts: 4,
        transactions: 36,
        removedPendingTransactions: 0,
        invoices: 13,
      },
      errors: [],
    },
  ]

  return { connections, accounts, transactions, invoices, syncRuns }
}

let cached: MockDataset | null = null

/** Dataset mocado (gerado uma vez por processo). */
export function mockDataset(): MockDataset {
  cached ??= build()
  return cached
}
