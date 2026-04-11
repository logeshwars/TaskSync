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
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from './auth/auth.module';
import { BoardsModule } from './boards/boards.module';
import { configuration, type AppConfig } from './config/configuration';
import { validationSchema } from './config/validation.schema';
import { HealthModule } from './health/health.module';
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
    // MongoDB — async factory so the URI flows through validated config
    // rather than reading process.env directly (which would bypass Joi).
    // -------------------------------------------------------------------------
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        uri: config.get('mongoUri', { infer: true }),
        // Forbid querying by fields not declared on the schema. Mongoose
        // defaults to `false` here, which is permissive and bug-prone.
        strictQuery: true,
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
    BoardsModule,
  ],
})
export class AppModule {}
