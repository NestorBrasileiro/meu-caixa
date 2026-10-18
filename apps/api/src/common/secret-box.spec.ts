import { decryptSecret, encryptSecret } from './secret-box.js';

const KEY = 'a'.repeat(64);
const OTHER_KEY = 'b'.repeat(64);

describe('secret-box', () => {
  it('decifra o que cifrou', () => {
    const box = encryptSecret('meu-segredo', KEY);
    expect(box.startsWith('v1:')).toBe(true);
    expect(box).not.toContain('meu-segredo');
    expect(decryptSecret(box, KEY)).toBe('meu-segredo');
  });

  it('gera um valor diferente a cada vez (iv aleatório)', () => {
    expect(encryptSecret('x', KEY)).not.toBe(encryptSecret('x', KEY));
  });

  it('recusa chave errada', () => {
    const box = encryptSecret('meu-segredo', KEY);
    expect(() => decryptSecret(box, OTHER_KEY)).toThrow();
  });

  it('recusa valor adulterado', () => {
    const [version, iv, tag, ciphertext] = encryptSecret('meu-segredo', KEY).split(':');
    const flipped = Buffer.from(ciphertext!, 'base64');
    flipped[0] = flipped[0]! ^ 1;
    const tampered = [version, iv, tag, flipped.toString('base64')].join(':');
    expect(() => decryptSecret(tampered, KEY)).toThrow();
  });

  it('recusa formato desconhecido', () => {
    expect(() => decryptSecret('texto-puro', KEY)).toThrow('formato desconhecido');
  });
});
