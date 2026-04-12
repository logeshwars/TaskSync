/**
 * Workspaces slice.
 *
 * Tracks the list of workspaces the user belongs to and which one is
 * currently selected. The selected workspace gates which boards are
 * shown in the sidebar / board selector.
 */
import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { api } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkspaceMember {
  userId: string;
  role: string;
  joinedAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string;
  members: WorkspaceMember[];
  createdAt: string;
}

interface WorkspacesState {
  items: Workspace[];
  selectedId: string | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
}

// ---------------------------------------------------------------------------
// Thunks
// ---------------------------------------------------------------------------

export const fetchWorkspaces = createAsyncThunk(
  'workspaces/fetchAll',
  async () => {
    const { data } = await api.get<Workspace[]>('/workspaces');
    return data;
  },
);

export const createWorkspace = createAsyncThunk(
  'workspaces/create',
  async (payload: { name: string; description?: string }) => {
    const { data } = await api.post<Workspace>('/workspaces', payload);
    return data;
  },
);

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

const initialState: WorkspacesState = {
  items: [],
  selectedId: null,
  status: 'idle',
};

const workspacesSlice = createSlice({
  name: 'workspaces',
  initialState,
  reducers: {
    selectWorkspace(state, action: PayloadAction<string>) {
      state.selectedId = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchWorkspaces.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchWorkspaces.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = action.payload;
        // Auto-select the first workspace if none is selected.
        if (!state.selectedId && action.payload.length > 0) {
          state.selectedId = action.payload[0].id;
        }
      })
      .addCase(fetchWorkspaces.rejected, (state) => {
        state.status = 'failed';
      });

    builder.addCase(createWorkspace.fulfilled, (state, action) => {
      state.items.push(action.payload);
      state.selectedId = action.payload.id;
    });
  },
});

export const { selectWorkspace } = workspacesSlice.actions;
export default workspacesSlice.reducer;
