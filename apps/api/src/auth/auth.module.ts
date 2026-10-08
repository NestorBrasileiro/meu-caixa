import {
  Inject,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import session from 'express-session';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { csrfOriginCheck } from './csrf.middleware.js';
import { KeycloakClient } from './keycloak.client.js';
import { SESSION_COOKIE, SESSION_TTL_MS } from './session.constants.js';
import { PostgresSessionStore } from './session-store.js';

@Module({
  controllers: [AuthController],
  providers: [
    KeycloakClient,
    AuthService,
    AuthGuard,
    { provide: APP_GUARD, useExisting: AuthGuard },
    {
      provide: PostgresSessionStore,
      inject: [DATABASE],
      useFactory: (db: Database) => new PostgresSessionStore(db),
    },
  ],
})
export class AuthModule implements NestModule, OnApplicationShutdown {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly store: PostgresSessionStore,
  ) {}

  configure(consumer: MiddlewareConsumer): void {
    const production = this.env.NODE_ENV === 'production';
    consumer
      .apply(
        session({
          name: SESSION_COOKIE,
          secret: this.env.SESSION_SECRET,
          store: this.store,
          resave: false,
          saveUninitialized: false,
          cookie: {
            httpOnly: true,
            secure: production,
            // `lax` exige API e interface no mesmo site (ex.: proxy do Next).
            sameSite: 'lax',
            maxAge: SESSION_TTL_MS,
          },
        }),
        csrfOriginCheck([this.env.FRONTEND_URL, this.env.APP_URL]),
      )
      .forRoutes('*');
  }

  onApplicationShutdown(): void {
    this.store.close();
  }
}
