/**
 * Event catalog for the realtime layer.
 *
 * Every event that flows over the WebSocket is declared here so:
 *   - TypeScript can catch typos at call sites.
 *   - The frontend has a single source of truth to import from.
 *   - Adding a new event forces us to pick a payload shape up front,
 *     instead of accreting `any` payloads over time.
 *
 * Naming convention: `<entity>.<verb>` in past tense — they describe
 * things that already happened on the server and are being broadcast out.
 */

export const REALTIME_EVENTS = {
  CARD_CREATED: 'card.created',
  CARD_UPDATED: 'card.updated',
  CARD_MOVED: 'card.moved',
  CARD_DELETED: 'card.deleted',
  LIST_CREATED: 'list.created',
  LIST_UPDATED: 'list.updated',
  LIST_DELETED: 'list.deleted',
  LIST_REORDERED: 'list.reordered',
  BOARD_UPDATED: 'board.updated',
  COMMENT_ADDED: 'comment.added',
  COMMENT_DELETED: 'comment.deleted',
  PRESENCE_JOINED: 'presence.joined',
  PRESENCE_LEFT: 'presence.left',
} as const;

export type RealtimeEvent =
  (typeof REALTIME_EVENTS)[keyof typeof REALTIME_EVENTS];

/** The two client→server commands we accept. */
export const CLIENT_COMMANDS = {
  BOARD_SUBSCRIBE: 'board:subscribe',
  BOARD_UNSUBSCRIBE: 'board:unsubscribe',
} as const;

/**
 * Base shape for every broadcast payload. Individual events extend with
 * their own fields — keep them flat and JSON-serialisable.
 */
export interface BroadcastEnvelope<T = Record<string, unknown>> {
  /** Board room the event belongs to. */
  boardId: string;
  /** Actor's user id. Useful so clients can suppress their own echoes. */
  actorId: string;
  /** Event payload. */
  data: T;
  /** Server timestamp (ms). */
  at: number;
}

/** The room name for a board. Keep this derivation in ONE place. */
export function boardRoom(boardId: string): string {
  return `board:${boardId}`;
}

/** The presence room for a board. */
export function presenceRoom(boardId: string): string {
  return `presence:${boardId}`;
}
