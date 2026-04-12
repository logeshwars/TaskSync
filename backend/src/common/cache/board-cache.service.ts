/**
 * Board cache.
 *
 * Caches the hydrated-board read at `board:<id>:hydrated` with a short
 * TTL (60s by default). Any write that affects the board must call
 * `invalidate(boardId)` — that's cheaper than trying to patch the cached
 * payload in place, and it avoids cache-vs-db drift on weird edge cases.
 *
 * Design notes:
 *   - Values are JSON strings — ioredis can round-trip them natively.
 *   - We use `SET … EX 60` instead of storing-then-EXPIRE so the TTL is
 *     atomic with the write.
 *   - On cache misses we return `null`; the caller is responsible for
 *     loading and storing the fresh value.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from '../../redis/redis.constants';

const TTL_SECONDS = 60;

function keyFor(boardId: string): string {
  return `board:${boardId}:hydrated`;
}

@Injectable()
export class BoardCacheService {
  private readonly logger = new Logger(BoardCacheService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async get<T>(boardId: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(keyFor(boardId));
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      // Cache faults must never fail the request — log and fall through.
      this.logger.warn(`Board cache GET failed: ${(err as Error).message}`);
      return null;
    }
  }

  async set<T>(boardId: string, value: T): Promise<void> {
    try {
      await this.redis.set(keyFor(boardId), JSON.stringify(value), 'EX', TTL_SECONDS);
    } catch (err) {
      this.logger.warn(`Board cache SET failed: ${(err as Error).message}`);
    }
  }

  async invalidate(boardId: string): Promise<void> {
    try {
      await this.redis.del(keyFor(boardId));
    } catch (err) {
      this.logger.warn(`Board cache DEL failed: ${(err as Error).message}`);
    }
  }
}
