/**
 * Application entrypoint.
 *
 * Responsibilities (kept narrow on purpose):
 *   1. Bootstrap the Nest application.
 *   2. Wire global cross-cutting concerns: validation, error handling, logging.
 *   3. Configure CORS for the frontend origin.
 *   4. Listen on the configured port.
 *
 * Anything beyond this belongs in a feature module — main.ts is not a
 * dumping ground for one-off configuration.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import type { AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // Buffer logs until the logger is configured so startup output isn't
    // interleaved oddly. Easy to swap for Pino later in Phase 7.4.
    bufferLogs: true,
  });

  // ConfigService is the single source of validated runtime config.
  // The `<AppConfig, true>` generic enables strict-typed `config.get(...)`.
  const config = app.get(ConfigService<AppConfig, true>);

  // ---------------------------------------------------------------------------
  // Global validation pipe
  //
  //   whitelist               -> strip properties not declared on the DTO
  //   forbidNonWhitelisted    -> reject (400) if any unknown property is sent
  //   transform               -> auto-instantiate plain objects into DTO classes
  //   enableImplicitConversion -> coerce query/path params (always strings) to
  //                               their declared TS types
  // ---------------------------------------------------------------------------
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      stopAtFirstError: false,
    }),
  );

  // ---------------------------------------------------------------------------
  // Global error handler — every thrown error becomes a consistent JSON shape.
  // ---------------------------------------------------------------------------
  app.useGlobalFilters(new AllExceptionsFilter());

  // ---------------------------------------------------------------------------
  // Global request/response logging.
  // ---------------------------------------------------------------------------
  app.useGlobalInterceptors(new LoggingInterceptor());

  // ---------------------------------------------------------------------------
  // CORS — driven by env so production can lock it down to a real origin.
  // `credentials: true` is required for cookie-based refresh tokens.
  // ---------------------------------------------------------------------------
  app.enableCors({
    origin: config.get('corsOrigin', { infer: true }),
    credentials: true,
  });

  // Every controller becomes /api/v1/<route>.
  app.setGlobalPrefix('api/v1');

  // ---------------------------------------------------------------------------
  // OpenAPI / Swagger — only mounted outside production. The docs UI is a
  // useful integration tool in dev/staging but ships zero value in prod and
  // can leak schema details. Set EXPOSE_DOCS=true to override if needed.
  // ---------------------------------------------------------------------------
  const isProduction = config.get('nodeEnv', { infer: true }) === 'production';
  if (!isProduction || process.env.EXPOSE_DOCS === 'true') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('TaskSync API')
      .setDescription('Real-time collaborative task management — REST API')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Paste your access token (no `Bearer ` prefix).',
        },
        'access-token',
      )
      .addTag('auth', 'Signup, login, refresh, logout')
      .addTag('users', 'User profile')
      .addTag('workspaces', 'Workspace management')
      .addTag('boards', 'Boards inside a workspace')
      .addTag('lists', 'Kanban columns inside a board')
      .addTag('cards', 'Task cards inside a list')
      .addTag('comments', 'Per-card discussion')
      .addTag('health', 'Liveness / readiness probes')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/v1/docs', app, document, {
      // Persist the auth token across page reloads — small but huge dev win.
      swaggerOptions: { persistAuthorization: true },
    });
  }

  // Nest will call OnModuleDestroy / OnApplicationShutdown hooks on
  // SIGTERM/SIGINT — required for clean Redis/Mongoose teardown.
  app.enableShutdownHooks();

  const port = config.get('port', { infer: true });
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`TaskSync backend listening on http://localhost:${port}/api/v1`);
  if (!isProduction || process.env.EXPOSE_DOCS === 'true') {
    logger.log(`Swagger UI ready at  http://localhost:${port}/api/v1/docs`);
  }
}

// Bootstrap failures must crash loudly — never swallow them.
// Use console.error rather than the Nest logger because Nest may not be alive.
bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to bootstrap TaskSync backend:', err);
  process.exit(1);
});
