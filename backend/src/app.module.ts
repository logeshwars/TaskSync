/**
 * Root application module.
 *
 * Composes the cross-cutting infrastructure modules (config, database, cache,
 * health) at the top of the dependency graph. Feature modules — auth,
 * workspaces, boards, lists, cards, comments, realtime — will be added here
 * as we ship later phases of PLAN.md.
 *
 * Senior rationale: this file is intentionally a manifest, not a place for
 * business logic. Each line should answer "what subsystem are we wiring up".
 */
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { ActivityModule } from './activity/activity.module';
import { AuthModule } from './auth/auth.module';
import { BoardsModule } from './boards/boards.module';
import { CardsModule } from './cards/cards.module';
import { CommentsModule } from './comments/comments.module';
import { CacheModule } from './common/cache/cache.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { configuration, type AppConfig } from './config/configuration';
import { validationSchema } from './config/validation.schema';
import { HealthModule } from './health/health.module';
import { ListsModule } from './lists/lists.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RedisModule } from './redis/redis.module';
import { UsersModule } from './users/users.module';
import { WorkspacesModule } from './workspaces/workspaces.module';

@Module({
  imports: [
    // -------------------------------------------------------------------------
    // Configuration — load .env, validate it with Joi, expose typed access.
    // `isGlobal: true` removes the need to import ConfigModule in every
    // feature module that wants the ConfigService.
    // -------------------------------------------------------------------------
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      validationOptions: {
        abortEarly: false, // surface ALL bad env vars at once, not just the first
        allowUnknown: true, // tolerate unrelated env vars (CI noise, host injects)
      },
      cache: true,
    }),

    // -------------------------------------------------------------------------
    // Rate limiting — 60 requests per minute by default. Auth endpoints
    // (signup/login/refresh) are hit from unauthenticated clients so they
    // need a per-IP throttle to blunt credential-stuffing. We register
    // globally via APP_GUARD and let feature controllers opt out with
    // `@SkipThrottle()` if they're write-heavy internal calls.
    // -------------------------------------------------------------------------
    ThrottlerModule.forRoot([
      {
        ttl: 60_000, // 1 minute
        limit: 60,
      },
    ]),

    // -------------------------------------------------------------------------
    // MongoDB — async factory so the URI flows through validated config
    // rather than reading process.env directly (which would bypass Joi).
    // -------------------------------------------------------------------------
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        uri: config.get('mongoUri', { infer: true }),
      }),
    }),

    // -------------------------------------------------------------------------
    // Redis — global module so any feature can inject the client by token.
    // -------------------------------------------------------------------------
    RedisModule,

    // -------------------------------------------------------------------------
    // Health checks — exposed at GET /api/v1/health.
    // -------------------------------------------------------------------------
    HealthModule,

    // -------------------------------------------------------------------------
    // Feature modules.
    //
    // UsersModule is imported explicitly even though AuthModule already
    // depends on it — making the dependency explicit at the root keeps the
    // module graph easy to read and prevents accidental "phantom" imports
    // through transitive chains.
    //
    // AuthModule registers the global JwtAuthGuard via APP_GUARD, so every
    // route in the app is now protected-by-default. Endpoints opt out with
    // the @Public() decorator.
    // -------------------------------------------------------------------------
    UsersModule,
    AuthModule,
    WorkspacesModule,
    // ActivityModule, RealtimeModule, and CacheModule are @Global() —
    // they register BEFORE the feature modules that consume their
    // services so those providers are available at instantiation time.
    ActivityModule,
    RealtimeModule,
    CacheModule,
    BoardsModule,
    ListsModule,
    CardsModule,
    CommentsModule,
  ],
  providers: [
    // Apply the throttler globally. Individual handlers can opt out with
    // `@SkipThrottle()` or tighten via `@Throttle()`.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  /**
   * Apply request-id middleware across every route. Keeping this at the
   * root module means every handler — including the ones in feature
   * modules we add later — gets the same correlation id for free.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
