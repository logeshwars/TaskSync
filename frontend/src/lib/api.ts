/**
 * Axios API client.
 *
 * - Base URL defaults to `/api/v1` (same-origin in prod, Vite proxy in dev).
 * - Attaches the JWT access token from localStorage on every request.
 * - On a 401, attempts a single token refresh via `/auth/refresh`. If the
 *   refresh succeeds, the original request is retried transparently. If
 *   it fails, the user is bounced to the login page.
 *
 * Token storage lives in localStorage under `access_token` / `refresh_token`.
 * This is a pragmatic choice for an SPA — HttpOnly cookies would require a
 * BFF layer that's out of scope for this project.
 */
import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

const ACCESS_KEY = 'access_token';
const REFRESH_KEY = 'refresh_token';

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Attach access token to every outgoing request.
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---------------------------------------------------------------------------
// 401 interceptor — refresh once, retry, or redirect to login.
// ---------------------------------------------------------------------------

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refresh = getRefreshToken();
  if (!refresh) throw new Error('No refresh token');

  const { data } = await axios.post<{ accessToken: string; refreshToken: string }>(
    `${API_BASE}/auth/refresh`,
    { refreshToken: refresh },
  );
  setTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as AxiosRequestConfig & { _retried?: boolean };

    // Only intercept 401s that haven't already been retried, and skip the
    // refresh endpoint itself to avoid infinite loops.
    if (
      error.response?.status !== 401 ||
      original._retried ||
      original.url?.includes('/auth/refresh')
    ) {
      return Promise.reject(error);
    }

    original._retried = true;

    try {
      // Coalesce concurrent 401s into one refresh call. Without this,
      // parallel requests that all 401 would each try to refresh, and
      // only the first would succeed (refresh rotation invalidates the
      // old token).
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }
      const newToken = await refreshPromise;
      if (original.headers) {
        (original.headers as Record<string, string>).Authorization = `Bearer ${newToken}`;
      }
      return api(original);
    } catch {
      clearTokens();
      window.location.href = '/login';
      return Promise.reject(error);
    }
  },
);
