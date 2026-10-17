import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Chave usada em desenvolvimento quando `SETTINGS_ENCRYPTION_KEY` não está
 * definida: fixa para os segredos continuarem legíveis depois de reiniciar a
 * API. Em produção a variável é obrigatória (validateEnv).
 */
export const DEV_SETTINGS_ENCRYPTION_KEY = 'meu-caixa-chave-de-desenvolvimento-nao-use-em-producao';

/** Versão do formato do texto cifrado; muda se o algoritmo ou a derivação mudarem. */
const FORMAT_VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const HKDF_SALT = 'meu-caixa/app-settings';

export class SettingsDecryptionError extends Error {
  constructor(reason: string) {
    super(`Não foi possível decifrar a configuração: ${reason}`);
    this.name = 'SettingsDecryptionError';
  }
}

/**
 * Cifra segredos guardados em `app_settings` com AES-256-GCM (IV aleatório a
 * cada gravação). A chave sai de `SETTINGS_ENCRYPTION_KEY` via HKDF-SHA256.
 *
 * Formato: `v1.<keyId>.<iv>.<tag>.<cifrado>` (base64url). O `keyId` identifica
 * a chave sem revelá-la: se a variável mudar, a leitura falha com um aviso
 * claro (cadastre o segredo de novo) em vez de devolver lixo. O `context`
 * (ex.: a chave da configuração) entra como dado autenticado, então um valor
 * cifrado não pode ser copiado para outra configuração.
 */
export class SettingsCipher {
  readonly keyId: string;
  private readonly key: Buffer;

  constructor(secret: string) {
    this.key = derive(secret, `${FORMAT_VERSION}/aes-256-gcm`);
    this.keyId = createHash('sha256')
      .update(derive(secret, `${FORMAT_VERSION}/key-id`))
      .digest('hex')
      .slice(0, 8);
  }

  encrypt(plaintext: string, context: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [
      FORMAT_VERSION,
      this.keyId,
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      encrypted.toString('base64url'),
    ].join('.');
  }

  decrypt(payload: string, context: string): string {
    const parts = payload.split('.');
    if (parts.length !== 5 || parts[0] !== FORMAT_VERSION) {
      throw new SettingsDecryptionError('formato desconhecido');
    }
    const [, keyId, iv, tag, encrypted] = parts as [string, string, string, string, string];
    if (keyId !== this.keyId) {
      throw new SettingsDecryptionError('cifrado com outra SETTINGS_ENCRYPTION_KEY');
    }
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'), {
        authTagLength: TAG_BYTES,
      });
      decipher.setAAD(Buffer.from(context, 'utf8'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(encrypted, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new SettingsDecryptionError('valor corrompido ou adulterado');
    }
  }
}

function derive(secret: string, info: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, HKDF_SALT, info, 32));
}
