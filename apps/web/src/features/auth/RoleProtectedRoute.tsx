import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { UserRole } from '@aspire-bloods/shared';
import { useAuth } from '../../lib/AuthContext';
import { rememberRedirect } from '../../lib/redirectAfterLogin';
import { AuthLoading } from './AuthLoading';

export function RoleProtectedRoute({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <AuthLoading />;

  if (!user) {
    // This is where every patient-facing deep link actually lands —
    // /markers/:id, /reports/:id, /appointments/:id are all inside this
    // guard, not ProtectedRoute. Only ProtectedRoute remembered where you
    // were going, so following a result link from an email while signed out
    // took you through sign-in and then dumped you on the home page, which
    // is the one thing the redirect machinery exists to prevent. Same call,
    // same rules (see redirectAfterLogin.ts — auth routes are never stored,
    // and off-origin values are rejected outright).
    rememberRedirect(`${location.pathname}${location.search}`);
    return <Navigate to="/login" replace />;
  }

  if (!roles.includes(user.role)) return <Navigate to="/" replace />;

  return <>{children}</>;
}
