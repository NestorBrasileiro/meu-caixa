import { validateEnv } from './env.js';

const base = { DATABASE_URL: 'postgres://localhost/x', KEYCLOAK_CLIENT_SECRET: 'segredo' };
const production = {
  ...base,
  NODE_ENV: 'production',
  SESSION_SECRET: 's'.repeat(64),
  SETTINGS_ENCRYPTION_KEY: 'k'.repeat(64),
};

describe('validateEnv', () => {
  it('FINANCE_PROVIDER é opcional e sobe sem credenciais da Pluggy', () => {
    const env = validateEnv(base);
    expect(env.FINANCE_PROVIDER).toBeUndefined();
    expect(env.PLUGGY_CLIENT_ID).toBeUndefined();
    expect(env.PLUGGY_ITEM_IDS).toEqual([]);
  });

  it('FINANCE_PROVIDER=pluggy não exige mais as credenciais no ambiente', () => {
    expect(validateEnv({ ...base, FINANCE_PROVIDER: 'pluggy' }).FINANCE_PROVIDER).toBe('pluggy');
  });

  it('string vazia vale como não definido', () => {
    expect(validateEnv({ ...base, FINANCE_PROVIDER: '' }).FINANCE_PROVIDER).toBeUndefined();
  });

  it('recusa só uma das duas credenciais da Pluggy', () => {
    expect(() => validateEnv({ ...base, PLUGGY_CLIENT_ID: 'id' })).toThrow(
      /PLUGGY_CLIENT_SECRET[\s\S]*juntos/,
    );
  });

  it('SETTINGS_ENCRYPTION_KEY é obrigatória em produção', () => {
    expect(() => validateEnv({ ...production, SETTINGS_ENCRYPTION_KEY: '' })).toThrow(
      /SETTINGS_ENCRYPTION_KEY é obrigatório em produção/,
    );
    expect(validateEnv(production).SETTINGS_ENCRYPTION_KEY).toBe('k'.repeat(64));
  });

  it('SETTINGS_ENCRYPTION_KEY curta é recusada', () => {
    expect(() => validateEnv({ ...base, SETTINGS_ENCRYPTION_KEY: 'curta' })).toThrow(
      /SETTINGS_ENCRYPTION_KEY/,
    );
  });

  it('em desenvolvimento a chave é opcional', () => {
    expect(validateEnv(base).SETTINGS_ENCRYPTION_KEY).toBeUndefined();
  });
});
