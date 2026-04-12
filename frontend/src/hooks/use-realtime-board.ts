/**
 * useRealtimeBoard hook.
 *
 * Subscribes to a board's realtime room on mount and unsubscribes on
 * unmount. Incoming events are dispatched into the Redux store so the
 * board view updates instantly without polling.
 *
 * For most mutation events (card/list created/updated/deleted) we do a
 * full board refetch rather than trying to surgically patch state. This
 * keeps the logic simple and correct — the 60s Redis cache means the
 * refetch is cheap.
 *
 * Presence events are handled inline because they're lightweight and
 * don't need a full refetch.
 */
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { connect, getSocket } from '@/lib/socket';
import { useAppDispatch, useAppSelector } from '@/store';
import { fetchHydratedBoard } from '@/store/boards.slice';
import { clearPresence, userJoined, userLeft } from '@/store/presence.slice';

// Mirror the backend event names — kept as plain strings to avoid
// importing from the backend package.
const EVENTS = {
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

const BOARD_SUBSCRIBE = 'board:subscribe';
const BOARD_UNSUBSCRIBE = 'board:unsubscribe';

interface Envelope {
  boardId: string;
  actorId: string;
  data: Record<string, unknown>;
  at: number;
}

export function useRealtimeBoard(boardId: string | null) {
  const dispatch = useAppDispatch();
  const currentUserId = useAppSelector((s) => s.auth.user?.id);
  const boardIdRef = useRef(boardId);
  boardIdRef.current = boardId;

  useEffect(() => {
    if (!boardId) return;

    const socket = connect();

    // Subscribe to the board room.
    socket.emit(BOARD_SUBSCRIBE, { boardId });

    // Helper: refetch the board unless the event came from us (we already
    // have the latest state from our own API call).
    const refetchIfRemote = (env: Envelope) => {
      if (env.actorId !== currentUserId && boardIdRef.current) {
        dispatch(fetchHydratedBoard(boardIdRef.current));
      }
    };

    // Helper: show a toast for remote mutations.
    const toastIfRemote = (env: Envelope, message: string) => {
      if (env.actorId !== currentUserId) {
        toast.info(message);
      }
    };

    // --- Board-level events ---
    const onCardCreated = (env: Envelope) => {
      refetchIfRemote(env);
      toastIfRemote(env, `A new card "${env.data.title}" was created`);
    };
    const onCardUpdated = (env: Envelope) => refetchIfRemote(env);
    const onCardMoved = (env: Envelope) => {
      refetchIfRemote(env);
      toastIfRemote(env, 'A card was moved');
    };
    const onCardDeleted = (env: Envelope) => {
      refetchIfRemote(env);
      toastIfRemote(env, 'A card was deleted');
    };
    const onListCreated = (env: Envelope) => {
      refetchIfRemote(env);
      toastIfRemote(env, `List "${env.data.title}" was created`);
    };
    const onListUpdated = (env: Envelope) => refetchIfRemote(env);
    const onListDeleted = (env: Envelope) => refetchIfRemote(env);
    const onListReordered = (env: Envelope) => refetchIfRemote(env);
    const onBoardUpdated = (env: Envelope) => refetchIfRemote(env);
    const onCommentAdded = (env: Envelope) => refetchIfRemote(env);
    const onCommentDeleted = (env: Envelope) => refetchIfRemote(env);

    // --- Presence events ---
    const onPresenceJoined = (env: Envelope) => {
      dispatch(
        userJoined({
          userId: env.data.userId as string,
          email: env.data.email as string,
          joinedAt: env.at,
        }),
      );
    };
    const onPresenceLeft = (env: Envelope) => {
      dispatch(userLeft(env.data.userId as string));
    };

    socket.on(EVENTS.CARD_CREATED, onCardCreated);
    socket.on(EVENTS.CARD_UPDATED, onCardUpdated);
    socket.on(EVENTS.CARD_MOVED, onCardMoved);
    socket.on(EVENTS.CARD_DELETED, onCardDeleted);
    socket.on(EVENTS.LIST_CREATED, onListCreated);
    socket.on(EVENTS.LIST_UPDATED, onListUpdated);
    socket.on(EVENTS.LIST_DELETED, onListDeleted);
    socket.on(EVENTS.LIST_REORDERED, onListReordered);
    socket.on(EVENTS.BOARD_UPDATED, onBoardUpdated);
    socket.on(EVENTS.COMMENT_ADDED, onCommentAdded);
    socket.on(EVENTS.COMMENT_DELETED, onCommentDeleted);
    socket.on(EVENTS.PRESENCE_JOINED, onPresenceJoined);
    socket.on(EVENTS.PRESENCE_LEFT, onPresenceLeft);

    return () => {
      // Unsubscribe from the board room.
      const sock = getSocket();
      if (sock) {
        sock.emit(BOARD_UNSUBSCRIBE, { boardId });
      }
      dispatch(clearPresence());

      // Remove all listeners we attached.
      socket.off(EVENTS.CARD_CREATED, onCardCreated);
      socket.off(EVENTS.CARD_UPDATED, onCardUpdated);
      socket.off(EVENTS.CARD_MOVED, onCardMoved);
      socket.off(EVENTS.CARD_DELETED, onCardDeleted);
      socket.off(EVENTS.LIST_CREATED, onListCreated);
      socket.off(EVENTS.LIST_UPDATED, onListUpdated);
      socket.off(EVENTS.LIST_DELETED, onListDeleted);
      socket.off(EVENTS.LIST_REORDERED, onListReordered);
      socket.off(EVENTS.BOARD_UPDATED, onBoardUpdated);
      socket.off(EVENTS.COMMENT_ADDED, onCommentAdded);
      socket.off(EVENTS.COMMENT_DELETED, onCommentDeleted);
      socket.off(EVENTS.PRESENCE_JOINED, onPresenceJoined);
      socket.off(EVENTS.PRESENCE_LEFT, onPresenceLeft);
    };
  }, [boardId, currentUserId, dispatch]);
}
