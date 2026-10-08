import { PluggyApiError, PluggyClient, type PluggyClientOptions } from './pluggy.client.js';

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });

/** Monta um `fetch` falso que responde por rota, na ordem das chamadas. */
function fakeFetch(routes: Record<string, Handler[]>) {
  const calls: { method: string; path: string; url: URL; apiKey: string | null }[] = [];
  const fetchFn = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    const key = `${method} ${url.pathname}`;
    const headers = new Headers(init.headers);
    calls.push({ method, path: url.pathname, url, apiKey: headers.get('X-API-KEY') });
    const handler = routes[key]?.shift();
    if (!handler) throw new Error(`Rota inesperada: ${key}`);
    return handler(url, init);
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, calls };
}

const auth =
  (apiKey = 'key-1'): Handler =>
  () =>
    json({ apiKey });

function createClient(fetchFn: typeof fetch, overrides: Partial<PluggyClientOptions> = {}) {
  const sleep = vi.fn(async (_ms: number) => {});
  const client = new PluggyClient({
    baseUrl: 'https://api.pluggy.test',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    timeoutMs: 1_000,
    maxRetries: 2,
    fetch: fetchFn,
    sleep,
    ...overrides,
  });
  return { client, sleep };
}

const account = (id: string) => ({
  id,
  itemId: 'item-1',
  type: 'BANK',
  subtype: 'CHECKING_ACCOUNT',
  number: '0001',
  name: 'Conta',
  balance: 10,
  currencyCode: 'BRL',
  creditData: null,
});

const transaction = (id: string) => ({
  id,
  accountId: 'acc-1',
  date: '2026-10-01T03:00:00.000Z',
  description: 'Compra',
  type: 'DEBIT',
  amount: -10,
});

describe('PluggyClient', () => {
  it('autentica uma vez e reaproveita a API key em chamadas concorrentes', async () => {
    const { fetchFn, calls } = fakeFetch({
      'POST /auth': [auth('key-1')],
      'GET /items/item-1': [
        () => json({ id: 'item-1', status: 'UPDATED', connector: { name: 'Banco' } }),
      ],
      'GET /items/item-2': [
        () => json({ id: 'item-2', status: 'UPDATED', connector: { name: 'Banco' } }),
      ],
    });
    const { client } = createClient(fetchFn);

    await Promise.all([client.getItem('item-1'), client.getItem('item-2')]);

    expect(calls.filter((call) => call.path === '/auth')).toHaveLength(1);
    expect(calls.filter((call) => call.path.startsWith('/items')).map((c) => c.apiKey)).toEqual([
      'key-1',
      'key-1',
    ]);
  });

  it('renova a API key quando ela expira', async () => {
    const expiringToken = (exp: number) =>
      `h.${Buffer.from(JSON.stringify({ exp })).toString('base64url')}.s`;
    let now = 1_000_000_000_000;
    const { fetchFn, calls } = fakeFetch({
      'POST /auth': [auth(expiringToken(now / 1000 + 3600)), auth('key-2')],
      'GET /items/item-1': [
        () => json({ id: 'item-1', status: 'UPDATED', connector: { name: 'Banco' } }),
        () => json({ id: 'item-1', status: 'UPDATED', connector: { name: 'Banco' } }),
      ],
    });
    const { client } = createClient(fetchFn, { now: () => now });

    await client.getItem('item-1');
    now += 3600 * 1000;
    await client.getItem('item-1');

    expect(calls.filter((call) => call.path === '/auth')).toHaveLength(2);
    expect(calls.at(-1)?.apiKey).toBe('key-2');
  });

  it('percorre todas as páginas de contas', async () => {
    const { fetchFn, calls } = fakeFetch({
      'POST /auth': [auth()],
      'GET /accounts': [
        () => json({ results: [account('a1')], page: 1, totalPages: 2, total: 2 }),
        () => json({ results: [account('a2')], page: 2, totalPages: 2, total: 2 }),
      ],
    });
    const { client } = createClient(fetchFn);

    const accounts = await client.listAccounts('item-1');

    expect(accounts.map((a) => a.id)).toEqual(['a1', 'a2']);
    const pages = calls
      .filter((c) => c.path === '/accounts')
      .map((c) => c.url.searchParams.get('page'));
    expect(pages).toEqual(['1', '2']);
  });

  it('segue o cursor de transações até o fim', async () => {
    const { fetchFn, calls } = fakeFetch({
      'POST /auth': [auth()],
      'GET /v2/transactions': [
        () =>
          json({
            results: [transaction('t1')],
            next: '/v2/transactions?accountId=acc-1&after=abc',
          }),
        () => json({ results: [transaction('t2')], next: null }),
      ],
    });
    const { client } = createClient(fetchFn);

    const result = await client.listTransactions('acc-1', {
      dateFrom: '2026-09-01',
      dateTo: '2026-10-01',
    });

    expect(result.map((t) => t.id)).toEqual(['t1', 't2']);
    const requests = calls.filter((c) => c.path === '/v2/transactions');
    expect(requests[0]?.url.searchParams.get('dateFrom')).toBe('2026-09-01');
    expect(requests[0]?.url.searchParams.has('after')).toBe(false);
    expect(requests[1]?.url.searchParams.get('after')).toBe('abc');
  });

  it('tenta de novo em falhas transitórias, respeitando Retry-After', async () => {
    const { fetchFn } = fakeFetch({
      'POST /auth': [auth()],
      'GET /items/item-1': [
        () => json({ message: 'rate limited' }, { status: 429, headers: { 'Retry-After': '2' } }),
        () => json({ message: 'unavailable' }, { status: 503 }),
        () => json({ id: 'item-1', status: 'UPDATED', connector: { name: 'Banco' } }),
      ],
    });
    const { client, sleep } = createClient(fetchFn);

    const item = await client.getItem('item-1');

    expect(item.id).toBe('item-1');
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls[0]?.[0]).toBe(2_000);
  });

  it('desiste depois do limite de tentativas', async () => {
    const unavailable = () => json({}, { status: 503 });
    const { fetchFn } = fakeFetch({
      'POST /auth': [auth()],
      'GET /items/item-1': [unavailable, unavailable, unavailable],
    });
    const { client, sleep } = createClient(fetchFn);

    await expect(client.getItem('item-1')).rejects.toMatchObject({
      name: 'PluggyApiError',
      status: 503,
      retryable: true,
    });
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('não repete erros do cliente (4xx)', async () => {
    const { fetchFn } = fakeFetch({
      'POST /auth': [auth()],
      'GET /items/item-1': [() => json({ message: 'bad request' }, { status: 400 })],
    });
    const { client, sleep } = createClient(fetchFn);

    const error = await client.getItem('item-1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(PluggyApiError);
    expect(error).toMatchObject({
      status: 400,
      retryable: false,
      body: { message: 'bad request' },
    });
    expect(sleep).not.toHaveBeenCalled();
  });

  it('reautentica uma vez quando a API key é recusada', async () => {
    const { fetchFn, calls } = fakeFetch({
      'POST /auth': [auth('old'), auth('new')],
      'GET /items/item-1': [
        () => json({ message: 'unauthorized' }, { status: 401 }),
        () => json({ id: 'item-1', status: 'UPDATED', connector: { name: 'Banco' } }),
      ],
    });
    const { client } = createClient(fetchFn);

    await client.getItem('item-1');

    expect(calls.filter((c) => c.path === '/items/item-1').map((c) => c.apiKey)).toEqual([
      'old',
      'new',
    ]);
  });

  it('aplica timeout por tentativa', async () => {
    const hang: Handler = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    const { fetchFn } = fakeFetch({ 'POST /auth': [hang, hang] });
    const { client } = createClient(fetchFn, { timeoutMs: 10, maxRetries: 1 });

    await expect(client.getItem('item-1')).rejects.toThrow(/Timeout de 10ms em POST \/auth/);
  });

  it('falha alto quando o formato da resposta muda', async () => {
    const { fetchFn } = fakeFetch({
      'POST /auth': [auth()],
      'GET /items/item-1': [() => json({ id: 'item-1', status: 'UPDATED' })],
    });
    const { client } = createClient(fetchFn);

    await expect(client.getItem('item-1')).rejects.toThrow(/Resposta inesperada .* connector/);
  });

  it('devolve null quando o banco não fornece dados cadastrais', async () => {
    const { fetchFn } = fakeFetch({
      'POST /auth': [auth()],
      'GET /identity': [() => json({ message: 'not found' }, { status: 404 })],
    });
    const { client } = createClient(fetchFn);

    await expect(client.getIdentity('item-1')).resolves.toBeNull();
  });
});
