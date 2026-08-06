import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { rememberRedirect } from '../../lib/redirectAfterLogin';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-cream">
        <p className="text-espresso">Loading…</p>
      </main>
    );
  }

  if (!user) {
    // Remember the deep link before bouncing to sign-in, so following a link
    // from an email while signed out doesn't dump you on the home page after
    // authenticating. Auth routes are never remembered — that's a loop.
    rememberRedirect(`${location.pathname}${location.search}`);
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
