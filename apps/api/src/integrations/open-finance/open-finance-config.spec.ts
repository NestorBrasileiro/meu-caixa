import {
  clientIdHint,
  resolveOpenFinanceConfig,
  type OpenFinanceEnv,
  type StoredOpenFinance,
} from './open-finance-config.js';

const noEnv: OpenFinanceEnv = {
  FINANCE_PROVIDER: undefined,
  PLUGGY_CLIENT_ID: undefined,
  PLUGGY_CLIENT_SECRET: undefined,
  PLUGGY_ITEM_IDS: [],
};
const nothingStored: StoredOpenFinance = { mode: null, credentials: null, itemIds: null };
const updatedAt = new Date('2026-10-01T12:00:00Z');
const appCredentials = { clientId: 'app-client', clientSecret: 'app-secret', updatedAt };

describe('resolveOpenFinanceConfig', () => {
  it('sem nada configurado: modo none e lista de bancos do app vazia', () => {
    expect(resolveOpenFinanceConfig(noEnv, nothingStored)).toEqual({
      mode: { value: 'none', source: 'default' },
      credentials: null,
      items: { ids: [], source: 'app' },
    });
  });

  it('com credenciais e sem escolha de modo: pluggy por padrão', () => {
    const config = resolveOpenFinanceConfig(noEnv, {
      ...nothingStored,
      credentials: appCredentials,
      itemIds: ['item-1'],
    });
    expect(config.mode).toEqual({ value: 'pluggy', source: 'default' });
    expect(config.credentials).toEqual({ ...appCredentials, source: 'app' });
    expect(config.items).toEqual({ ids: ['item-1'], source: 'app' });
  });

  it('a escolha do app vale quando o ambiente não define o modo', () => {
    const config = resolveOpenFinanceConfig(noEnv, {
      ...nothingStored,
      mode: 'fake',
      credentials: appCredentials,
    });
    expect(config.mode).toEqual({ value: 'fake', source: 'app' });
  });

  it('o ambiente vence o app em cada parte', () => {
    const config = resolveOpenFinanceConfig(
      {
        FINANCE_PROVIDER: 'pluggy',
        PLUGGY_CLIENT_ID: 'env-client',
        PLUGGY_CLIENT_SECRET: 'env-secret',
        PLUGGY_ITEM_IDS: ['env-item'],
      },
      { mode: 'fake', credentials: appCredentials, itemIds: ['app-item'] },
    );
    expect(config).toEqual({
      mode: { value: 'pluggy', source: 'env' },
      credentials: {
        clientId: 'env-client',
        clientSecret: 'env-secret',
        source: 'env',
        updatedAt: null,
      },
      items: { ids: ['env-item'], source: 'env' },
    });
  });

  it('partes não definidas no ambiente continuam vindo do app', () => {
    const config = resolveOpenFinanceConfig(
      { ...noEnv, PLUGGY_ITEM_IDS: ['env-item'] },
      { mode: null, credentials: appCredentials, itemIds: ['app-item'] },
    );
    expect(config.credentials?.source).toBe('app');
    expect(config.items).toEqual({ ids: ['env-item'], source: 'env' });
    expect(config.mode).toEqual({ value: 'pluggy', source: 'default' });
  });

  it('FINANCE_PROVIDER=pluggy sem credenciais em lugar nenhum: pluggy (env) sem credenciais', () => {
    const config = resolveOpenFinanceConfig(
      { ...noEnv, FINANCE_PROVIDER: 'pluggy' },
      nothingStored,
    );
    expect(config.mode).toEqual({ value: 'pluggy', source: 'env' });
    expect(config.credentials).toBeNull();
  });
});

describe('clientIdHint', () => {
  it('mostra só os 8 primeiros caracteres', () => {
    expect(clientIdHint('3f6c1a52-aaaa-bbbb-cccc-1234567890ab')).toBe('3f6c1a52…');
    expect(clientIdHint('curto')).toBe('curto…');
  });
});
