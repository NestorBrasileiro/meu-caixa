import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { addDays, today } from '../src/domain/dates.js';

interface FakeItem {
  item: Record<string, unknown>;
  accounts: Record<string, unknown>[];
  transactions: Record<string, unknown>[];
  bills: Record<string, unknown>[];
}

const day = (offset: number) => `${addDays(today('America/Sao_Paulo'), offset)}T15:00:00.000Z`;

/** Dados pequenos e realistas de dois bancos conectados no Meu Pluggy. */
export function sampleItems(): Map<string, FakeItem> {
  return new Map([
    [
      'item-banco-1',
      {
        item: {
          id: 'item-banco-1',
          status: 'UPDATED',
          lastUpdatedAt: day(0),
          connector: { name: 'Nubank', imageUrl: 'https://cdn.pluggy.test/nubank.svg' },
          error: null,
        },
        accounts: [
          {
            id: 'b1-conta',
            itemId: 'item-banco-1',
            type: 'BANK',
            subtype: 'CHECKING_ACCOUNT',
            number: '0001/12345-6',
            name: 'Conta corrente',
            balance: 3250.75,
            currencyCode: 'BRL',
            creditData: null,
          },
          {
            id: 'b1-cartao',
            itemId: 'item-banco-1',
            type: 'CREDIT',
            subtype: 'CREDIT_CARD',
            number: '4321',
            name: 'Cartão',
            marketingName: 'Nubank Ultravioleta',
            balance: 812.4,
            currencyCode: 'BRL',
            creditData: { creditLimit: 8000, availableCreditLimit: 7187.6 },
          },
        ],
        transactions: [
          {
            id: 'b1-t1',
            accountId: 'b1-conta',
            date: day(-12),
            description: 'Salário',
            type: 'CREDIT',
            amount: 9000,
            status: 'POSTED',
            category: 'Salary',
            operationType: 'TED',
          },
          {
            id: 'b1-t2',
            accountId: 'b1-conta',
            date: day(-3),
            description: 'Pix Mercado Bom Preço',
            type: 'DEBIT',
            amount: -230.5,
            status: 'POSTED',
            category: 'Groceries',
            operationType: 'PIX',
          },
          {
            id: 'b1-t3',
            accountId: 'b1-cartao',
            date: day(-2),
            description: 'iFood',
            type: 'DEBIT',
            amount: 58.9,
            status: 'POSTED',
            category: 'Food delivery',
            creditCardMetadata: { billId: 'b1-fatura' },
          },
        ],
        bills: [
          {
            id: 'b1-fatura',
            accountId: 'b1-cartao',
            dueDate: day(10),
            billClosingDate: day(3),
            totalAmount: 812.4,
            totalAmountCurrencyCode: 'BRL',
            minimumPaymentAmount: 121.86,
          },
        ],
      },
    ],
    [
      'item-banco-2',
      {
        item: {
          id: 'item-banco-2',
          status: 'LOGIN_ERROR',
          lastUpdatedAt: day(-5),
          connector: { name: 'Itaú', imageUrl: null },
          error: { code: 'INVALID_CREDENTIALS', message: 'A senha do banco mudou' },
        },
        accounts: [
          {
            id: 'b2-conta',
            itemId: 'item-banco-2',
            type: 'BANK',
            subtype: 'CHECKING_ACCOUNT',
            number: '1234/99999-0',
            name: 'Conta Itaú',
            balance: 120,
            currencyCode: 'BRL',
            creditData: null,
          },
        ],
        transactions: [
          {
            id: 'b2-t1',
            accountId: 'b2-conta',
            date: day(-4),
            description: 'Conta de luz',
            type: 'DEBIT',
            amount: -187.33,
            status: 'POSTED',
            category: 'Electricity',
            operationType: 'BOLETO',
          },
        ],
        bills: [],
      },
    ],
  ]);
}

/**
 * Servidor HTTP mínimo que imita a API da Pluggy (auth, items, contas,
 * transações v2 e faturas) para os testes e2e do Open Finance.
 */
export class FakePluggy {
  readonly clientId = 'cid-valido';
  readonly clientSecret = 'segredo-valido';
  items = sampleItems();
  /** `down`: responde 503 em tudo; `drop`: derruba a conexão (falha de rede). */
  failure: 'down' | 'drop' | null = null;
  readonly authCalls: { clientId: unknown; clientSecret: unknown }[] = [];
  readonly requests: string[] = [];

  private readonly server: Server;
  private readonly apiKeys = new Set<string>();
  private url = '';

  constructor() {
    this.server = createServer((req, res) => {
      this.handle(req, res).catch((error: unknown) => send(res, 500, { message: String(error) }));
    });
  }

  get baseUrl(): string {
    return this.url;
  }

  async start(): Promise<string> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    const { port } = this.server.address() as AddressInfo;
    this.url = `http://127.0.0.1:${port}`;
    return this.url;
  }

  async stop(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  reset(): void {
    this.items = sampleItems();
    this.failure = null;
    this.authCalls.length = 0;
    this.requests.length = 0;
    this.apiKeys.clear();
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://pluggy');
    this.requests.push(`${req.method} ${url.pathname}`);
    if (this.failure === 'drop') {
      req.socket.destroy();
      return;
    }
    if (this.failure === 'down') return send(res, 503, { message: 'Service Unavailable' });

    if (req.method === 'POST' && url.pathname === '/auth') {
      const body = JSON.parse((await readBody(req)) || '{}') as Record<string, unknown>;
      this.authCalls.push({ clientId: body.clientId, clientSecret: body.clientSecret });
      if (body.clientId !== this.clientId || body.clientSecret !== this.clientSecret) {
        return send(res, 401, { message: 'Invalid credentials', code: 401 });
      }
      const apiKey = `api-key-${this.apiKeys.size + 1}`;
      this.apiKeys.add(apiKey);
      return send(res, 200, { apiKey });
    }

    if (!this.apiKeys.has(String(req.headers['x-api-key']))) {
      return send(res, 403, { message: 'Forbidden', code: 403 });
    }
    if (req.method !== 'GET') return send(res, 404, { message: 'Not Found' });

    const itemMatch = /^\/items\/([^/]+)$/.exec(url.pathname);
    if (itemMatch) {
      const found = this.items.get(decodeURIComponent(itemMatch[1]!));
      return found
        ? send(res, 200, found.item)
        : send(res, 404, { message: 'Item not found', code: 404 });
    }

    const query = url.searchParams;
    switch (url.pathname) {
      case '/identity':
        return send(res, 404, { message: 'Identity not found', code: 404 });
      case '/accounts':
        return send(res, 200, page(this.items.get(query.get('itemId') ?? '')?.accounts ?? []));
      case '/bills':
        return send(
          res,
          200,
          page(this.all('bills').filter((bill) => bill.accountId === query.get('accountId'))),
        );
      case '/v2/transactions': {
        const from = query.get('dateFrom') ?? '0000-00-00';
        const to = query.get('dateTo') ?? '9999-99-99';
        const results = this.all('transactions').filter((transaction) => {
          const date = String(transaction.date).slice(0, 10);
          return transaction.accountId === query.get('accountId') && date >= from && date <= to;
        });
        return send(res, 200, { results, next: null });
      }
      default:
        return send(res, 404, { message: 'Not Found' });
    }
  }

  private all(kind: 'transactions' | 'bills'): Record<string, unknown>[] {
    return [...this.items.values()].flatMap((item) => item[kind]);
  }
}

function page(results: unknown[]) {
  return { results, page: 1, totalPages: 1, total: results.length };
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}
