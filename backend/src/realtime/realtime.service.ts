/**
 * Realtime service — thin API over RealtimeGateway that feature services
 * depend on instead of directly importing the gateway.
 *
 * Why the extra layer?
 *   - Feature services (cards, lists, comments) become trivially unit-
 *     testable: mock one small service instead of a whole gateway.
 *   - Keeps the gateway free of business logic — it only knows about
 *     sockets and rooms, not about "card moved".
 *   - Gives us a single place to decide whether a broadcast goes out at
 *     all (e.g. we could add rate-limiting or batching here later).
 */
import { Injectable } from '@nestjs/common';

import type { BroadcastEnvelope, RealtimeEvent } from './events';
import { RealtimeGateway } from './realtime.gateway';

@Injectable()
export class RealtimeService {
  constructor(private readonly gateway: RealtimeGateway) {}

  publish<T extends Record<string, unknown>>(
    event: RealtimeEvent,
    payload: {
      boardId: string;
      actorId: string;
      data: T;
    },
  ): void {
    const envelope: BroadcastEnvelope<T> = {
      boardId: payload.boardId,
      actorId: payload.actorId,
      data: payload.data,
      at: Date.now(),
    };
    this.gateway.broadcast(event, envelope);
  }
}
