/**
 * Socket.IO adapter wired to Redis pub/sub.
 *
 * Backs the realtime gateway with @socket.io/redis-adapter so events are
 * fanned out across every backend pod. Without this adapter, a card move
 * on pod A would never reach a client connected to pod B.
 *
 * Wired in `main.ts` via `app.useWebSocketAdapter(new RedisIoAdapter(app))`.
 */
import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { ServerOptions } from 'socket.io';
import { Server } from 'socket.io';

import { REDIS_CLIENT } from '../redis/redis.constants';

export class RedisIoAdapter extends IoAdapter {
  private pubClient?: Redis;
  private subClient?: Redis;

  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  /**
   * Establishes pub/sub Redis connections and attaches them to the
   * Socket.IO server. We duplicate the primary Redis client rather than
   * instantiating new ones from scratch — this inherits the same
   * connection options (password, TLS, retry strategy) without re-reading
   * config twice.
   */
  override createIOServer(port: number, options?: ServerOptions): Server {
    // Resolve the app-wide ioredis client and duplicate it for pub/sub.
    // The Redis adapter needs TWO dedicated connections because once a
    // client enters subscribe mode it cannot issue normal commands.
    const primary = this.app.get<Redis>(REDIS_CLIENT);
    this.pubClient = primary.duplicate();
    this.subClient = primary.duplicate();

    const server = super.createIOServer(port, options) as Server;
    server.adapter(createAdapter(this.pubClient, this.subClient));
    return server;
  }

  /**
   * Called by Nest on shutdown. We quit the duplicated connections so
   * the process exits cleanly — `IoAdapter.close()` handles the
   * Socket.IO server itself.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override async close(server: any): Promise<void> {
    await super.close(server);
    await Promise.all([this.pubClient?.quit(), this.subClient?.quit()]);
  }
}
