/**
 * Health module — wires Terminus, the custom Redis indicator, and the
 * controller that exposes /api/v1/health.
 */
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './redis.health.indicator';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [RedisHealthIndicator],
})
export class HealthModule {}
