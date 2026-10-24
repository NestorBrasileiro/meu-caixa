import { legacySettingsWarning, validateEnv } from './env.js';

const BASE = {
  DATABASE_URL: 'postgres://localhost/teste',
  KEYCLOAK_CLIENT_SECRET: 'segredo',
};

describe('legacySettingsWarning', () => {
  it('lista as credenciais antigas que ainda estão no ambiente', () => {
    const warning = legacySettingsWarning({
      PLUGGY_CLIENT_ID: 'x',
      ANTHROPIC_API_KEY: 'y',
      PLUGGY_ITEM_IDS: '',
    });
    expect(warning).toContain('PLUGGY_CLIENT_ID, ANTHROPIC_API_KEY');
    expect(warning).not.toContain('PLUGGY_ITEM_IDS');
    expect(warning).toContain('Configurações');
  });

  it('o MCP_ACCESS_TOKEN também: virou token pessoal em Configurações', () => {
    expect(legacySettingsWarning({ MCP_ACCESS_TOKEN: 'a'.repeat(64) })).toContain(
      'MCP_ACCESS_TOKEN',
    );
  });

  it('sem nenhuma, não avisa', () => {
    expect(legacySettingsWarning(BASE)).toBeNull();
  });
});

describe('validateEnv', () => {
  it('upgrade sem SETTINGS_ENCRYPTION_KEY: o erro explica o que fazer com as variáveis antigas', () => {
    expect(() =>
      validateEnv({ ...BASE, FINANCE_PROVIDER: 'pluggy', PLUGGY_CLIENT_SECRET: 'antigo' }),
    ).toThrow(/SETTINGS_ENCRYPTION_KEY[\s\S]*PLUGGY_CLIENT_SECRET não são mais lidas/);
  });

  it('com a chave, sobe e ignora as variáveis antigas', () => {
    const env = validateEnv({
      ...BASE,
      FINANCE_PROVIDER: 'pluggy',
      SETTINGS_ENCRYPTION_KEY: 'a'.repeat(64),
      PLUGGY_CLIENT_ID: 'antigo',
    });
    expect(env).not.toHaveProperty('PLUGGY_CLIENT_ID');
  });
});
