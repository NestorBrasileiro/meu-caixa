import { SettingsCipher, SettingsDecryptionError } from './settings-cipher.js';

const KEY = 'a'.repeat(64);
const CONTEXT = 'open_finance.credentials';

describe('SettingsCipher', () => {
  it('cifra e decifra de volta', () => {
    const cipher = new SettingsCipher(KEY);
    const encrypted = cipher.encrypt('segredo-da-pluggy', CONTEXT);
    expect(encrypted).not.toContain('segredo');
    expect(cipher.decrypt(encrypted, CONTEXT)).toBe('segredo-da-pluggy');
  });

  it('usa um IV novo a cada gravação', () => {
    const cipher = new SettingsCipher(KEY);
    const first = cipher.encrypt('mesmo valor', CONTEXT);
    const second = cipher.encrypt('mesmo valor', CONTEXT);
    expect(first).not.toBe(second);
    expect(first.split('.')[2]).not.toBe(second.split('.')[2]);
  });

  it('marca a versão do formato e a chave usada', () => {
    const cipher = new SettingsCipher(KEY);
    const [version, keyId, ...rest] = cipher.encrypt('x', CONTEXT).split('.');
    expect(version).toBe('v1');
    expect(keyId).toBe(cipher.keyId);
    expect(keyId).toMatch(/^[0-9a-f]{8}$/);
    expect(rest).toHaveLength(3);
  });

  it('não decifra com outra chave', () => {
    const encrypted = new SettingsCipher(KEY).encrypt('segredo', CONTEXT);
    const other = new SettingsCipher('b'.repeat(64));
    expect(() => other.decrypt(encrypted, CONTEXT)).toThrow(SettingsDecryptionError);
    expect(() => other.decrypt(encrypted, CONTEXT)).toThrow(/outra SETTINGS_ENCRYPTION_KEY/);
  });

  it('recusa valor adulterado ou de outra configuração', () => {
    const cipher = new SettingsCipher(KEY);
    const encrypted = cipher.encrypt('segredo', CONTEXT);
    const parts = encrypted.split('.');
    const body = Buffer.from(parts[4]!, 'base64url');
    body[0] = body[0]! ^ 1;
    parts[4] = body.toString('base64url');

    expect(() => cipher.decrypt(parts.join('.'), CONTEXT)).toThrow(SettingsDecryptionError);
    expect(() => cipher.decrypt(encrypted, 'outra.chave')).toThrow(SettingsDecryptionError);
    expect(() => cipher.decrypt('texto-em-claro', CONTEXT)).toThrow(/formato desconhecido/);
  });

  it('a mesma chave sempre deriva o mesmo id (sobrevive a reinícios)', () => {
    expect(new SettingsCipher(KEY).keyId).toBe(new SettingsCipher(KEY).keyId);
  });
});
