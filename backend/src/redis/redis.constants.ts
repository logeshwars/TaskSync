/**
 * Injection token for the singleton ioredis client.
 *
 * Defined here (not in redis.module.ts) so consumers can import the token
 * without pulling in the whole module — keeps the dependency graph clean
 * and avoids accidental circular imports.
 *
 * Usage:
 *   constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}
 */
export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
