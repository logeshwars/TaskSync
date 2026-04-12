/**
 * Socket.IO client wrapper.
 *
 * Manages a single socket instance that connects on login and disconnects
 * on logout. Board subscriptions are handled by `useRealtimeBoard()`.
 *
 * Connection strategy:
 *   - Connects lazily when `connect()` is first called.
 *   - Passes the JWT access token in `auth.token` on the handshake.
 *   - Auto-reconnect is handled by socket.io-client's built-in backoff.
 *   - On token refresh, the socket must reconnect so the server accepts
 *     the new token — call `reconnect()`.
 */
import { io, type Socket } from 'socket.io-client';

import { getAccessToken } from './api';

let socket: Socket | null = null;

const SOCKET_PATH = '/realtime';

export function getSocket(): Socket | null {
  return socket;
}

export function connect(): Socket {
  if (socket?.connected) return socket;

  // Disconnect any stale instance before creating a new one.
  socket?.disconnect();

  socket = io({
    path: SOCKET_PATH,
    auth: { token: getAccessToken() },
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });

  return socket;
}

export function disconnect(): void {
  socket?.disconnect();
  socket = null;
}

export function reconnect(): void {
  if (!socket) return;
  socket.auth = { token: getAccessToken() };
  socket.disconnect().connect();
}
