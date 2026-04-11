/**
 * GET /api/v1/health
 *
 * Returns 200 if every dependency (Mongo + Redis) is reachable, 503 otherwise.
 * This is the endpoint that container orchestrators (k8s liveness/readiness
 * probes, docker compose healthchecks, AWS target groups) hit to decide
 * whether to route traffic to this instance.
 *
 * Senior rationale: a health check that only verifies "the process is up"
 * is worse than useless — it sends traffic to instances whose dependencies
 * have failed. Always check the things you actually need to serve a request.
 */
import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  MongooseHealthIndicator,
} from '@nestjs/terminus';

import { RedisHealthIndicator } from './redis.health.indicator';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly mongo: MongooseHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.mongo.pingCheck('mongodb'),
      () => this.redis.isHealthy('redis'),
    ]);
  }
}
