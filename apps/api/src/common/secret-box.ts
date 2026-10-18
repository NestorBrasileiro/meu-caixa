import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

/** Cifra um segredo para guardar no banco: `v1:<iv>:<tag>:<ciphertext>` em base64. */
export function encryptSecret(plain: string, hexKey: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, Buffer.from(hexKey, 'hex'), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64')))
    .join(':');
}

/** Falha se o valor foi adulterado ou cifrado com outra chave. */
export function decryptSecret(box: string, hexKey: string): string {
  const [version, iv, tag, ciphertext] = box.split(':');
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
    throw new Error('Segredo cifrado em formato desconhecido');
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    Buffer.from(hexKey, 'hex'),
    Buffer.from(iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
