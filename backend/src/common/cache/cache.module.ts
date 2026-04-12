import { Global, Module } from '@nestjs/common';

import { BoardCacheService } from './board-cache.service';

/**
 * Cache module.
 *
 * `@Global()` so any feature service can inject `BoardCacheService`
 * without re-importing the module. The underlying Redis client lives in
 * the already-global `RedisModule`, so no further imports are needed.
 */
@Global()
@Module({
  providers: [BoardCacheService],
  exports: [BoardCacheService],
})
export class CacheModule {}
