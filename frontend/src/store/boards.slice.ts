/**
 * Boards slice.
 *
 * Two levels of data:
 *   1. `items` — lightweight board list for the sidebar/selector.
 *   2. `active` — the fully hydrated board (board + lists + cards) for
 *      the currently open board view.
 *
 * Hydration is the most performance-sensitive read in the app, so it
 * gets its own thunk rather than piggybacking on the list fetch.
 */
import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { api } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types — mirror the backend DTOs
// ---------------------------------------------------------------------------

export interface BoardMember {
  userId: string;
  role: string;
  joinedAt: string;
}

export interface BoardSummary {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  color: string;
  createdBy: string;
  members: BoardMember[];
  listOrder: string[];
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListItem {
  id: string;
  boardId: string;
  title: string;
  position: string;
  wipLimit: number | null;
  cardOrder: string[];
  archived: boolean;
}

export interface CardItem {
  id: string;
  boardId: string;
  listId: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  tags: string[];
  assignees: string[];
  dueDate: string | null;
  progress: number;
  position: string;
  commentsCount: number;
  createdBy: string;
  archived: boolean;
}

export interface HydratedBoard extends BoardSummary {
  lists: ListItem[];
  cards: CardItem[];
}

interface BoardsState {
  items: BoardSummary[];
  active: HydratedBoard | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  hydrateStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
}

// ---------------------------------------------------------------------------
// Thunks
// ---------------------------------------------------------------------------

export const fetchBoards = createAsyncThunk(
  'boards/fetchAll',
  async (workspaceSlug: string) => {
    const { data } = await api.get<BoardSummary[]>(
      `/workspaces/${workspaceSlug}/boards`,
    );
    return data;
  },
);

export const fetchHydratedBoard = createAsyncThunk(
  'boards/fetchHydrated',
  async (boardId: string) => {
    const { data } = await api.get<HydratedBoard>(`/boards/${boardId}`);
    return data;
  },
);

export const createBoard = createAsyncThunk(
  'boards/create',
  async (payload: { workspaceSlug: string; title: string; description?: string; color?: string }) => {
    const { workspaceSlug, ...body } = payload;
    const { data } = await api.post<BoardSummary>(
      `/workspaces/${workspaceSlug}/boards`,
      body,
    );
    return data;
  },
);

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

const initialState: BoardsState = {
  items: [],
  active: null,
  status: 'idle',
  hydrateStatus: 'idle',
};

const boardsSlice = createSlice({
  name: 'boards',
  initialState,
  reducers: {
    clearActiveBoard(state) {
      state.active = null;
      state.hydrateStatus = 'idle';
    },
    /** Optimistic card move — update local state before the server responds. */
    moveCardOptimistic(
      state,
      action: PayloadAction<{
        cardId: string;
        fromListId: string;
        toListId: string;
        newPosition: string;
      }>,
    ) {
      if (!state.active) return;
      const { cardId, fromListId, toListId, newPosition } = action.payload;
      const card = state.active.cards.find((c) => c.id === cardId);
      if (!card) return;

      // Update card's list and position.
      card.listId = toListId;
      card.position = newPosition;

      // Patch cardOrder on source and target lists.
      const source = state.active.lists.find((l) => l.id === fromListId);
      const target = state.active.lists.find((l) => l.id === toListId);
      if (source) {
        source.cardOrder = source.cardOrder.filter((id) => id !== cardId);
      }
      if (target && !target.cardOrder.includes(cardId)) {
        target.cardOrder.push(cardId);
      }
    },
    /** Patch a single card in the active board (used by realtime events). */
    patchCard(state, action: PayloadAction<Partial<CardItem> & { id: string }>) {
      if (!state.active) return;
      const idx = state.active.cards.findIndex((c) => c.id === action.payload.id);
      if (idx >= 0) {
        state.active.cards[idx] = { ...state.active.cards[idx], ...action.payload };
      }
    },
    /** Add a card to the active board (realtime: someone else created it). */
    addCard(state, action: PayloadAction<CardItem>) {
      if (!state.active) return;
      state.active.cards.push(action.payload);
    },
    /** Remove a card from the active board. */
    removeCard(state, action: PayloadAction<string>) {
      if (!state.active) return;
      state.active.cards = state.active.cards.filter((c) => c.id !== action.payload);
    },
  },
  extraReducers: (builder) => {
    // Board list
    builder
      .addCase(fetchBoards.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchBoards.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = action.payload;
      })
      .addCase(fetchBoards.rejected, (state) => {
        state.status = 'failed';
      });

    // Hydrated board
    builder
      .addCase(fetchHydratedBoard.pending, (state) => {
        state.hydrateStatus = 'loading';
      })
      .addCase(fetchHydratedBoard.fulfilled, (state, action) => {
        state.hydrateStatus = 'succeeded';
        state.active = action.payload;
      })
      .addCase(fetchHydratedBoard.rejected, (state) => {
        state.hydrateStatus = 'failed';
        state.active = null;
      });

    // Create board
    builder.addCase(createBoard.fulfilled, (state, action) => {
      state.items.push(action.payload);
    });
  },
});

export const {
  clearActiveBoard,
  moveCardOptimistic,
  patchCard,
  addCard,
  removeCard,
} = boardsSlice.actions;

export default boardsSlice.reducer;
