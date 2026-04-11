/**
 * Custom Terminus health indicator that pings the Redis client.
 *
 * Terminus ships indicators for Mongoose and HTTP out of the box but not for
 * ioredis, so we write a tiny adapter here. Conforms to Terminus's
 * `HealthIndicator` interface so it composes with the rest of the health
 * pipeline in `health.controller.ts`.
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  HealthCheckError,
  HealthIndicator,
  type HealthIndicatorResult,
} from '@nestjs/terminus';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from '../redis/redis.constants';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {
    super();
  }

  /**
   * Pings Redis. Throws `HealthCheckError` on failure so Terminus marks the
   * overall response as 503; returns the success status object on success.
   */
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const reply = await this.client.ping();
      const isUp = reply === 'PONG';
      const result = this.getStatus(key, isUp);

      if (!isUp) {
        throw new HealthCheckError('Redis ping returned unexpected value', result);
      }
      return result;
    } catch (err) {
      throw new HealthCheckError(
        'Redis health check failed',
        this.getStatus(key, false, {
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }
}
