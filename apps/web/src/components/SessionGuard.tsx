import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IDLE_WARNING_LEAD_MS, idleTimeoutMsForRole } from '@aspire-bloods/shared';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { apiFetch, ApiError, isIdleTimeoutError } from '../lib/api';
import { useAuth } from '../lib/AuthContext';

/**
 * Token rotation, unchanged and independent of the idle window. Access tokens
 * live 15 minutes server-side (ACCESS_TOKEN_TTL_MINUTES); refreshing every 10
 * keeps a working session alive. This used to double as the idle timeout —
 * going idle simply let the access token lapse — which is why the two numbers
 * were the same. They are separate concerns and now separate mechanisms: the
 * idle deadline is held and enforced by the server (see lib/idleSession.ts),
 * and a refresh on its own no longer extends it.
 */
const SILENT_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const TICK_MS = 5 * 1000;

/**
 * How often real interaction is reported to the server. The server slides its
 * deadline on any authenticated request, so this only has to cover the case
 * where someone is reading rather than clicking; once every two minutes is
 * enough to keep a 15- or 30-minute deadline ahead of them without turning
 * scrolling into a request per frame.
 */
const ACTIVITY_PING_INTERVAL_MS = 2 * 60 * 1000;

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'] as const;

/**
 * Mounted once, inside AuthProvider, for the lifetime of the app. Does nothing
 * while signed out. While signed in it does three things: reports genuine
 * interaction to the server so the idle deadline slides, warns a couple of
 * minutes before the deadline rather than dumping someone mid-task, and signs
 * out (with a reason the login screen can explain) on inactivity or on a
 * rejected refresh — an admin revoked the account, or the 30-day refresh token
 * itself finally expired.
 *
 * The countdown here is presentation. The timeout is the server's: this
 * component going away, or its timers being paused by a backgrounded tab,
 * cannot extend a session by a second.
 */
export function SessionGuard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const lastActivityRef = useRef(Date.now());
  const lastRefreshRef = useRef(Date.now());
  const lastActivityPingRef = useRef(Date.now());
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  // The interval callback below is set up once per sign-in and reads this via a ref (not state)
  // so the warning-suppression check in onActivity doesn't need the interval rebuilt every render.
  const secondsRemainingRef = useRef<number | null>(null);
  secondsRemainingRef.current = secondsRemaining;

  // Patients get 30 minutes, staff 15 — one constant, in the shared package, so
  // the browser's countdown and the server's deadline cannot drift apart.
  const idleTimeoutMs = user ? idleTimeoutMsForRole(user.role) : 0;
  const idleWarningMs = Math.max(0, idleTimeoutMs - IDLE_WARNING_LEAD_MS);

  const signOutAndRedirect = useCallback(
    async (reason: 'idle' | 'expired') => {
      await logout(reason);
      navigate('/login', { replace: true });
    },
    [logout, navigate],
  );

  const staySignedIn = useCallback(async () => {
    const now = Date.now();
    lastActivityRef.current = now;
    lastActivityPingRef.current = now;
    setSecondsRemaining(null);
    try {
      // Reports the interaction first — this is the call that moves the
      // server's deadline. The rotation below does not, by design.
      await apiFetch('/auth/activity', { method: 'POST' });
      await apiFetch('/auth/refresh', { method: 'POST' });
      lastRefreshRef.current = Date.now();
    } catch (e) {
      void signOutAndRedirect(isIdleTimeoutError(e) ? 'idle' : 'expired');
    }
  }, [signOutAndRedirect]);

  useEffect(() => {
    if (!user) return;

    const startedAt = Date.now();
    lastActivityRef.current = startedAt;
    lastRefreshRef.current = startedAt;
    lastActivityPingRef.current = startedAt;
    setSecondsRemaining(null);

    function onActivity() {
      // Only matters while not already in the idle-warning window — once
      // the warning is showing, activity elsewhere on the page (it can
      // still be open behind the modal) shouldn't silently dismiss it;
      // only the explicit "Stay signed in" action should.
      if (secondsRemainingRef.current === null) {
        lastActivityRef.current = Date.now();
      }
    }
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, onActivity, { passive: true }));

    const interval = window.setInterval(async () => {
      const now = Date.now();
      const idleMs = now - lastActivityRef.current;

      if (idleMs >= idleTimeoutMs) {
        await signOutAndRedirect('idle');
        return;
      }

      if (idleMs >= idleWarningMs) {
        setSecondsRemaining(Math.max(0, Math.round((idleTimeoutMs - idleMs) / 1000)));
        return;
      }

      setSecondsRemaining(null);

      // Someone reading a report makes no other requests, so interaction is
      // reported on its own cadence rather than riding on whatever the page
      // happens to be fetching.
      if (
        idleMs < ACTIVITY_PING_INTERVAL_MS &&
        now - lastActivityPingRef.current >= ACTIVITY_PING_INTERVAL_MS
      ) {
        lastActivityPingRef.current = now;
        try {
          await apiFetch('/auth/activity', { method: 'POST' });
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) {
            await signOutAndRedirect(isIdleTimeoutError(e) ? 'idle' : 'expired');
            return;
          }
        }
      }

      if (now - lastRefreshRef.current >= SILENT_REFRESH_INTERVAL_MS) {
        lastRefreshRef.current = now;
        try {
          await apiFetch('/auth/refresh', { method: 'POST' });
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) {
            await signOutAndRedirect(isIdleTimeoutError(e) ? 'idle' : 'expired');
          }
        }
      }
    }, TICK_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, onActivity));
      window.clearInterval(interval);
    };
  }, [user, signOutAndRedirect, idleTimeoutMs, idleWarningMs]);

  if (!user || secondsRemaining === null) return null;

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;

  return (
    <Modal
      open
      onClose={() => void staySignedIn()}
      title="Still there?"
      footer={
        <>
          <Button variant="secondary" onClick={() => void signOutAndRedirect('idle')}>
            Sign out now
          </Button>
          <Button onClick={() => void staySignedIn()}>Stay signed in</Button>
        </>
      }
    >
      <p>
        You've been inactive, so for your security you'll be signed out in{' '}
        <span className="tabular font-medium text-espresso">
          {minutes}:{seconds.toString().padStart(2, '0')}
        </span>
        .
      </p>
    </Modal>
  );
}
