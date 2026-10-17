import { validateEnv } from '../../config/env.js';
import { CachedFinanceProvider } from '../cache/cached-finance-provider.js';
import type { FinanceProvider } from '../finance-provider.js';
import { FinanceProviderRegistry } from './finance-provider.registry.js';
import type { OpenFinanceConfig } from './open-finance-config.js';
import type { OpenFinanceConfigStore } from './open-finance-config.store.js';
import {
  NoneFinanceProvider,
  OPEN_FINANCE_NOT_CONFIGURED,
} from './unconfigured-finance-provider.js';

const env = validateEnv({
  DATABASE_URL: 'postgres://localhost/x',
  KEYCLOAK_CLIENT_SECRET: 'segredo',
});

const credentials = {
  clientId: 'client',
  clientSecret: 'secret',
  source: 'app' as const,
  updatedAt: null,
};

function config(overrides: Partial<OpenFinanceConfig> = {}): OpenFinanceConfig {
  return {
    mode: { value: 'pluggy', source: 'app' },
    credentials,
    items: { ids: ['item-1'], source: 'app' },
    ...overrides,
  };
}

function registryWith(
  current: { config: OpenFinanceConfig },
  fixed: FinanceProvider | null = null,
) {
  const store = {
    load: vi.fn(async () => current.config),
    saveSnapshots: vi.fn(async () => {}),
  };
  const registry = new FinanceProviderRegistry(
    env,
    store as unknown as OpenFinanceConfigStore,
    fixed,
  );
  return { registry, store };
}

describe('FinanceProviderRegistry', () => {
  it('modo none: provedor sem bancos', async () => {
    const { registry } = registryWith({
      config: config({ mode: { value: 'none', source: 'default' }, credentials: null }),
    });
    const provider = await registry.resolve();
    expect(provider).toBeInstanceOf(NoneFinanceProvider);
    expect(provider.name).toBe('none');
    await expect(provider.getConnections()).resolves.toEqual([]);
  });

  it('modo fake: dados fictícios, com cache', async () => {
    const { registry } = registryWith({
      config: config({ mode: { value: 'fake', source: 'env' } }),
    });
    const provider = await registry.resolve();
    expect(provider).toBeInstanceOf(CachedFinanceProvider);
    expect(provider.name).toBe('fake');
  });

  it('pluggy sem credenciais: a sincronização falha dizendo o que fazer', async () => {
    const { registry } = registryWith({ config: config({ credentials: null }) });
    const provider = await registry.resolve();
    expect(provider.name).toBe('pluggy');
    await expect(provider.getConnections()).rejects.toThrow(OPEN_FINANCE_NOT_CONFIGURED);
  });

  it('reaproveita o provedor enquanto a configuração não muda e remonta quando muda', async () => {
    const current = { config: config() };
    const { registry } = registryWith(current);
    const first = await registry.resolve();
    expect(first.name).toBe('pluggy');
    expect(await registry.resolve()).toBe(first);

    current.config = config({ items: { ids: ['item-1', 'item-2'], source: 'app' } });
    const second = await registry.resolve();
    expect(second).not.toBe(first);

    current.config = config({
      items: { ids: ['item-1', 'item-2'], source: 'app' },
      credentials: { ...credentials, clientSecret: 'outro' },
    });
    expect(await registry.resolve()).not.toBe(second);

    current.config = config({ mode: { value: 'fake', source: 'app' } });
    expect((await registry.resolve()).name).toBe('fake');
  });

  it('provedor fixo (testes) ignora a configuração', async () => {
    const fixed = new NoneFinanceProvider();
    const { registry, store } = registryWith({ config: config() }, fixed);
    expect(await registry.resolve()).toBe(fixed);
    expect(store.load).not.toHaveBeenCalled();
  });

  it('cliente de validação: timeout curto e sem retry', () => {
    const { registry } = registryWith({ config: config() });
    const client = registry.createPluggyClient(credentials, { validation: true });
    const options = (client as unknown as { options: { timeoutMs: number; maxRetries: number } })
      .options;
    expect(options.maxRetries).toBe(0);
    expect(options.timeoutMs).toBeLessThanOrEqual(10_000);
  });
});
