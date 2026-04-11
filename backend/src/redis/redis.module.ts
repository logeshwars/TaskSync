/**
 * Redis module — global, single-instance ioredis client.
 *
 * Why @Global?
 *   Every feature module that will arrive in later phases (cache, sessions,
 *   socket adapter, presence) wants the same client. Marking the module
 *   global means we register once in AppModule and inject anywhere via the
 *   REDIS_CLIENT token without re-importing.
 *
 * Lifecycle:
 *   The provider returns a configured ioredis instance. We implement
 *   `OnApplicationShutdown` to call `client.quit()` so the connection drains
 *   cleanly during graceful shutdown (SIGTERM in k8s or `docker stop`).
 *   Without this, in-flight commands can be lost and the server logs a
 *   noisy "connection forcibly closed" error.
 */
import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import type { AppConfig } from '../config/configuration';
import { REDIS_CLIENT } from './redis.constants';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>): Redis => {
        const { host, port, password } = config.get('redis', { infer: true });

        const client = new Redis({
          host,
          port,
          password: password || undefined,
          // Cap reconnect backoff at 2s so a flaky network doesn't spin
          // the CPU. Linear ramp until the cap.
          retryStrategy: (times) => Math.min(times * 200, 2000),
          // Emit ready/error events so we can log them — the constructor
          // is silent by default, which makes incidents harder to diagnose.
          enableReadyCheck: true,
          // Don't auto-resubscribe on reconnect — feature modules that use
          // pub/sub will manage their own subscriptions explicitly.
          autoResubscribe: false,
        });

        const logger = new Logger('RedisClient');
        client.on('connect', () => logger.log(`Connected to redis://${host}:${port}`));
        client.on('ready', () => logger.log('Redis client ready'));
        client.on('error', (err) => logger.error(`Redis error: ${err.message}`));
        client.on('end', () => logger.warn('Redis connection closed'));
        client.on('reconnecting', (delay: number) =>
          logger.warn(`Redis reconnecting in ${delay}ms`),
        );

        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  // Nest calls this on SIGTERM / SIGINT once `enableShutdownHooks()` is set
  // in main.ts. `quit()` waits for pending commands to flush before closing.
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.quit();
  }
}
