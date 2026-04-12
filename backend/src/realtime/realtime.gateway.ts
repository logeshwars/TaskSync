/**
 * Realtime gateway — Socket.IO + Redis adapter.
 *
 * Responsibilities:
 *   1. Authenticate handshakes via JWT. Unauthenticated sockets are
 *      disconnected immediately — we never accept anonymous connections.
 *   2. Manage board rooms: clients opt into a board via `board:subscribe`
 *      after doing a normal HTTP GET. The gateway confirms board
 *      membership before letting the client join the room.
 *   3. Fan out domain events to the right room. The cards/lists/comments
 *      services call `RealtimeService.publish()`; this gateway is where
 *      the events actually hit the wire.
 *   4. Maintain presence: on join/leave we emit presence events to the
 *      board's presence room.
 *
 * Redis adapter:
 *   Wired in `bootstrap()` inside `main.ts` via `useWebSocketAdapter`.
 *   It multiplexes events across every backend instance so two clients
 *   hitting different pods still see each other's writes.
 */
import {
  Inject,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import type { AppConfig } from '../config/configuration';
import { BoardsService } from '../boards/boards.service';
import {
  boardRoom,
  BroadcastEnvelope,
  CLIENT_COMMANDS,
  presenceRoom,
  REALTIME_EVENTS,
  RealtimeEvent,
} from './events';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

/**
 * Shape we attach to Socket.data after auth. Keeping this out of the
 * global socket typedefs lets us evolve the payload without editing
 * the Socket.IO types.
 */
interface SocketData {
  userId: string;
  email: string;
}

@WebSocketGateway({
  // CORS origin is driven by env. We trust the HTTP layer's CORS policy.
  cors: true,
  // Use a dedicated path so it doesn't clash with any future HTTP routes.
  path: '/realtime',
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    @Inject(ConfigService)
    private readonly config: ConfigService<AppConfig, true>,
    private readonly boards: BoardsService,
  ) {}

  onModuleInit(): void {
    // Structured startup log helps debug missing adapters in prod.
    this.logger.log('RealtimeGateway ready — awaiting handshakes on /realtime');
  }

  // ---------------------------------------------------------------------------
  // Connection lifecycle
  // ---------------------------------------------------------------------------

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) {
        throw new UnauthorizedException('Missing auth token.');
      }

      const jwtConfig = this.config.get('jwt', { infer: true });
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: jwtConfig.accessSecret,
      });
      if (payload.type !== 'access') {
        throw new UnauthorizedException('Wrong token type.');
      }

      (client.data as SocketData) = { userId: payload.sub, email: payload.email };
      this.logger.debug(`Socket ${client.id} authenticated as ${payload.email}`);
    } catch (err) {
      this.logger.warn(
        `Rejected socket ${client.id}: ${(err as Error).message}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    // Any board rooms the client was in get their presence updated by
    // the `leave` listener below. Socket.IO will also fan the leaves
    // out on its own — we just need to emit the presence event for the
    // frontend's live-viewers UI.
    const data = client.data as SocketData | undefined;
    if (!data) return;
    for (const room of client.rooms) {
      if (!room.startsWith('board:')) continue;
      const boardId = room.slice('board:'.length);
      this.server.to(presenceRoom(boardId)).emit(REALTIME_EVENTS.PRESENCE_LEFT, {
        boardId,
        userId: data.userId,
        at: Date.now(),
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Client commands
  // ---------------------------------------------------------------------------

  @SubscribeMessage(CLIENT_COMMANDS.BOARD_SUBSCRIBE)
  async subscribeToBoard(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { boardId: string },
  ): Promise<{ ok: boolean; error?: string }> {
    const data = client.data as SocketData | undefined;
    if (!data) {
      return { ok: false, error: 'unauthenticated' };
    }
    if (!payload?.boardId) {
      return { ok: false, error: 'boardId required' };
    }

    // Membership check — never let a client into a room they can't read.
    const role = await this.boards.findEffectiveRole(payload.boardId, data.userId);
    if (!role) {
      return { ok: false, error: 'forbidden' };
    }

    await client.join(boardRoom(payload.boardId));
    await client.join(presenceRoom(payload.boardId));

    // Announce presence to everyone already watching this board.
    this.server
      .to(presenceRoom(payload.boardId))
      .emit(REALTIME_EVENTS.PRESENCE_JOINED, {
        boardId: payload.boardId,
        userId: data.userId,
        email: data.email,
        at: Date.now(),
      });

    return { ok: true };
  }

  @SubscribeMessage(CLIENT_COMMANDS.BOARD_UNSUBSCRIBE)
  async unsubscribeFromBoard(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { boardId: string },
  ): Promise<{ ok: boolean }> {
    if (!payload?.boardId) return { ok: false };
    await client.leave(boardRoom(payload.boardId));
    await client.leave(presenceRoom(payload.boardId));

    const data = client.data as SocketData | undefined;
    if (data) {
      this.server
        .to(presenceRoom(payload.boardId))
        .emit(REALTIME_EVENTS.PRESENCE_LEFT, {
          boardId: payload.boardId,
          userId: data.userId,
          at: Date.now(),
        });
    }
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Server-side broadcast helper (called by RealtimeService)
  // ---------------------------------------------------------------------------

  broadcast<T extends Record<string, unknown>>(
    event: RealtimeEvent,
    envelope: BroadcastEnvelope<T>,
  ): void {
    this.server.to(boardRoom(envelope.boardId)).emit(event, envelope);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Extract the JWT from either `auth.token` or the `Authorization` header. */
  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth as { token?: string } | undefined;
    if (auth?.token) return auth.token;
    const header = client.handshake.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length);
    return null;
  }
}
