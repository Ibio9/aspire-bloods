import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { UserRole } from '@aspire-bloods/shared';
import { apiFetch, ApiError, isIdleTimeoutError } from './api';
import { resetPatientPortalCaches } from './patientPortal';
import { clearRecentPatients } from './recentPatients';

interface CurrentUser {
  id: string;
  email: string;
  role: UserRole;
  displayName: string;
  hasPatientProfile: boolean;
  /**
   * Whether this patient has been shown the first sign-in introduction.
   *
   * From the server, on /auth/me, and never from localStorage: a first sign-in
   * is a fact about the person rather than about the browser, and a flag in
   * storage brings the screen back on their phone, in a private window and
   * after any cookie clear-out. Absent on an older payload, which reads as
   * `undefined` and is treated as SEEN — a returning patient must never be
   * shown an introduction because a deploy was mid-flight.
   */
  walkthroughSeen?: boolean;
  /**
   * Whether a released report this patient has never opened is waiting — the
   * results-ready moment.
   *
   * Per REPORT and stored on the report (`Report.resultsReadySeenAt`), never on
   * the session and never in storage. A moment keyed on the session fires on
   * every sign-in, which makes it a splash screen; one keyed on storage fires
   * again on their phone. Absent on an older payload, which reads as
   * `undefined` and therefore as "nothing waiting" — the same defensive
   * direction `walkthroughSeen` takes, for the same reason.
   */
  resultsReadyPending?: boolean;
}

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setUser: (user: CurrentUser | null) => void;
  /** Revokes the session server-side (refresh token + cookies), then clears local state. Never throws —
   * the local sign-out proceeds even if the network call fails, so a flaky connection can't strand
   * someone in a "signed in" UI they can't actually use. */
  logout: (reason?: 'idle' | 'expired') => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Stashed for the next /login screen to read and clear — carries why the session ended
 * across the navigation that follows a logout, without needing a query param or router state. */
export const LOGOUT_REASON_KEY = 'aspire_logout_reason';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await apiFetch<CurrentUser>('/auth/me');
      setUser(me);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        // The server can retire a session before the in-page timer notices —
        // a backgrounded tab, a reload after lunch. Recording the reason here
        // as well is what keeps the inactivity line on the sign-in screen
        // truthful in those cases rather than falling back to a bare redirect.
        if (isIdleTimeoutError(e)) sessionStorage.setItem(LOGOUT_REASON_KEY, 'idle');
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async (reason?: 'idle' | 'expired') => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // Local state still clears below — an unreachable server shouldn't leave the UI
      // showing an authenticated view nobody can actually use.
    }
    if (reason) sessionStorage.setItem(LOGOUT_REASON_KEY, reason);
    // Patient data held client-side must not survive into the next person's
    // session on a shared machine — signing out doesn't reload the page, so
    // nothing else clears it. The marker index is module state; the admin's
    // recently-viewed patients are on disk in localStorage and outlive the
    // session entirely unless removed.
    resetPatientPortalCaches();
    clearRecentPatients();
    setUser(null);
  }, []);

  useEffect(() => {
    void refresh();

    // Back/forward-cache restore: the browser can bring an old, pre-logout DOM/JS
    // state back to life on history navigation without re-running app bootstrap.
    // Re-checking on every such restore closes that gap regardless of how the
    // previous page state got there.
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) void refresh();
    }
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [refresh]);

  return <AuthContext.Provider value={{ user, loading, refresh, setUser, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
