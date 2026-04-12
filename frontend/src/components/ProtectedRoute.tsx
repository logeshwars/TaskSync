/**
 * Route guard that redirects unauthenticated users to /login.
 *
 * On first mount it fires `fetchMe` to rehydrate the session from the
 * stored JWT. While that request is in flight we show a centered spinner
 * so the page doesn't flash.
 */
import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import { getAccessToken } from '@/lib/api';
import { fetchMe } from '@/store/auth.slice';
import { useAppDispatch, useAppSelector } from '@/store';

export function ProtectedRoute() {
  const dispatch = useAppDispatch();
  const { user, status } = useAppSelector((s) => s.auth);
  const location = useLocation();

  useEffect(() => {
    // Only attempt rehydration if we have a token but haven't loaded the
    // user yet. This avoids hammering /auth/me on every route change.
    if (!user && getAccessToken() && status === 'idle') {
      dispatch(fetchMe());
    }
  }, [dispatch, user, status]);

  // Still checking the token — show a loading state.
  if (status === 'loading' || (status === 'idle' && getAccessToken())) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
