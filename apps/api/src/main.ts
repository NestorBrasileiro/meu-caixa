import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ENV } from './config/config.module.js';
import type { Env } from './config/env.js';
import { loadEnvFile } from './config/load-env-file.js';

async function bootstrap() {
  loadEnvFile();
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const env = app.get<Env>(ENV);
  await app.listen(env.PORT);
}
await bootstrap();
