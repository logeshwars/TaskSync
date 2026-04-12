/**
 * Presence slice.
 *
 * Tracks which users are currently viewing the active board. Updated
 * exclusively by the realtime gateway events (`presence.joined` /
 * `presence.left`).
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface PresenceUser {
  userId: string;
  email: string;
  joinedAt: number;
}

interface PresenceState {
  viewers: PresenceUser[];
}

const initialState: PresenceState = {
  viewers: [],
};

const presenceSlice = createSlice({
  name: 'presence',
  initialState,
  reducers: {
    userJoined(state, action: PayloadAction<PresenceUser>) {
      if (!state.viewers.some((v) => v.userId === action.payload.userId)) {
        state.viewers.push(action.payload);
      }
    },
    userLeft(state, action: PayloadAction<string>) {
      state.viewers = state.viewers.filter((v) => v.userId !== action.payload);
    },
    clearPresence(state) {
      state.viewers = [];
    },
  },
});

export const { userJoined, userLeft, clearPresence } = presenceSlice.actions;
export default presenceSlice.reducer;
