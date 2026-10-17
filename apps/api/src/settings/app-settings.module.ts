import { Logger, Module } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { AppSettingsStore } from './app-settings.store.js';
import { DEV_SETTINGS_ENCRYPTION_KEY, SettingsCipher } from './settings-cipher.js';

export function createSettingsCipher(env: Env): SettingsCipher {
  if (env.SETTINGS_ENCRYPTION_KEY) return new SettingsCipher(env.SETTINGS_ENCRYPTION_KEY);
  // Em produção validateEnv já recusou subir sem a chave.
  new Logger('SettingsCipher').warn(
    'SETTINGS_ENCRYPTION_KEY não definida: os segredos da tela de configurações ficam cifrados ' +
      'com uma chave fixa de desenvolvimento. Defina a variável (openssl rand -hex 32) fora do ' +
      'ambiente local; ao trocar a chave, cadastre os segredos de novo.',
  );
  return new SettingsCipher(DEV_SETTINGS_ENCRYPTION_KEY);
}

/** Armazenamento das configurações editáveis pela interface (`app_settings`). */
@Module({
  providers: [
    AppSettingsStore,
    { provide: SettingsCipher, inject: [ENV], useFactory: createSettingsCipher },
  ],
  exports: [AppSettingsStore, SettingsCipher],
})
export class AppSettingsModule {}
