/**
 * Auth slice.
 *
 * Manages the current user's identity and authentication state. Async
 * thunks for signup / login / refresh call the API client and persist
 * tokens via the helpers in `lib/api.ts`.
 *
 * The slice deliberately does NOT store the raw JWT — that lives in
 * localStorage and is attached by the axios interceptor. The slice only
 * tracks "who is logged in" for UI purposes.
 */
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import { api, clearTokens, setTokens } from '@/lib/api';
import { connect, disconnect } from '@/lib/socket';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

interface AuthState {
  user: AuthUser | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
}

// ---------------------------------------------------------------------------
// Thunks
// ---------------------------------------------------------------------------

export const signup = createAsyncThunk(
  'auth/signup',
  async (payload: { email: string; password: string; name: string }, { rejectWithValue }) => {
    try {
      const { data } = await api.post<{
        accessToken: string;
        refreshToken: string;
        user: AuthUser;
      }>('/auth/signup', payload);
      setTokens(data.accessToken, data.refreshToken);
      return data.user;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? 'Signup failed');
    }
  },
);

export const login = createAsyncThunk(
  'auth/login',
  async (payload: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const { data } = await api.post<{
        accessToken: string;
        refreshToken: string;
        user: AuthUser;
      }>('/auth/login', payload);
      setTokens(data.accessToken, data.refreshToken);
      return data.user;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? 'Invalid credentials');
    }
  },
);

export const fetchMe = createAsyncThunk(
  'auth/fetchMe',
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.get<AuthUser>('/auth/me');
      return data;
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.message ?? 'Session expired');
    }
  },
);

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

const initialState: AuthState = {
  user: null,
  status: 'idle',
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout(state) {
      state.user = null;
      state.status = 'idle';
      state.error = null;
      clearTokens();
      disconnect();
    },
  },
  extraReducers: (builder) => {
    // Signup
    builder
      .addCase(signup.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(signup.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.user = action.payload;
        connect();
      })
      .addCase(signup.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      });

    // Login
    builder
      .addCase(login.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.user = action.payload;
        connect();
      })
      .addCase(login.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload as string;
      });

    // Fetch /me (silent rehydrate on app load)
    builder
      .addCase(fetchMe.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.user = action.payload;
        connect();
      })
      .addCase(fetchMe.rejected, (state) => {
        state.status = 'idle';
        state.user = null;
      });
  },
});

export const { logout } = authSlice.actions;
export default authSlice.reducer;
