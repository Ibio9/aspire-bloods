import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { UserRole } from '@aspire-bloods/shared';
import { apiFetch, ApiError } from './api';

interface CurrentUser {
  id: string;
  email: string;
  role: UserRole;
  displayName: string;
}

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (user: CurrentUser | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await apiFetch<CurrentUser>('/auth/me');
      setUser(me);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <AuthContext.Provider value={{ user, loading, refresh, setUser }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
