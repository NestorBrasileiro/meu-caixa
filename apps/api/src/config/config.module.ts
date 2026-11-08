import { Global, Logger, Module } from '@nestjs/common';
import { legacySettingsWarning, validateEnv } from './env.js';

/** Token de injeção da configuração já validada (`Env`). */
export const ENV = Symbol('ENV');

function loadEnv() {
  const env = validateEnv(process.env);
  const legacy = legacySettingsWarning(process.env);
  if (legacy) new Logger('Config').warn(legacy);
  return env;
}

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: loadEnv }],
  exports: [ENV],
})
export class ConfigModule {}
