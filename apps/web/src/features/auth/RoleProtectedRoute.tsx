import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import type { UserRole } from '@aspire-bloods/shared';
import { useAuth } from '../../lib/AuthContext';

export function RoleProtectedRoute({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-cream">
        <p className="text-espresso">Loading…</p>
      </main>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;

  return <>{children}</>;
}
