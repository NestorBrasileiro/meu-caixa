import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { ENV } from './config/config.module.js';
import type { Env } from './config/env.js';
import { loadEnvFile } from './config/load-env-file.js';

async function bootstrap() {
  loadEnvFile();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  app.enableShutdownHooks();
  const env = app.get<Env>(ENV);
  // Atrás do proxy/load balancer: necessário para o cookie `secure` e o IP real.
  app.set('trust proxy', 1);
  app.enableCors({ origin: env.FRONTEND_URL, credentials: true });
  await app.listen(env.PORT);
}
await bootstrap();
