import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { apiFetch, ApiError } from '../lib/api';
import { useAuth } from '../lib/AuthContext';

// Access tokens live 15 minutes server-side (ACCESS_TOKEN_TTL_MINUTES).
// Refreshing every 10 minutes while genuinely active keeps a working session
// alive indefinitely; going idle past the warning/logout thresholds below
// lets the access token lapse on its own instead of masking it.
const SILENT_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const IDLE_WARNING_MS = 13 * 60 * 1000;
const IDLE_LOGOUT_MS = 15 * 60 * 1000;
const TICK_MS = 5 * 1000;
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'] as const;

/**
 * Mounted once, inside AuthProvider, for the lifetime of the app. Does
 * nothing while signed out. While signed in: silently refreshes the
 * session on a timer as long as the person is actually using the app, warns
 * a couple of minutes before an idle sign-out rather than dumping them
 * mid-task, and signs out (with a reason the login screen can explain) both
 * on confirmed inactivity and on a refresh call that comes back rejected —
 * e.g. an admin revoked the account, or the 30-day refresh token itself
 * finally expired.
 */
export function SessionGuard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const lastActivityRef = useRef(Date.now());
  const lastRefreshRef = useRef(Date.now());
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  // The interval callback below is set up once per sign-in and reads this via a ref (not state)
  // so the warning-suppression check in onActivity doesn't need the interval rebuilt every render.
  const secondsRemainingRef = useRef<number | null>(null);
  secondsRemainingRef.current = secondsRemaining;

  const signOutAndRedirect = useCallback(
    async (reason: 'idle' | 'expired') => {
      await logout(reason);
      navigate('/login', { replace: true });
    },
    [logout, navigate],
  );

  const staySignedIn = useCallback(async () => {
    lastActivityRef.current = Date.now();
    setSecondsRemaining(null);
    try {
      await apiFetch('/auth/refresh', { method: 'POST' });
      lastRefreshRef.current = Date.now();
    } catch {
      void signOutAndRedirect('expired');
    }
  }, [signOutAndRedirect]);

  useEffect(() => {
    if (!user) return;

    lastActivityRef.current = Date.now();
    lastRefreshRef.current = Date.now();
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

      if (idleMs >= IDLE_LOGOUT_MS) {
        await signOutAndRedirect('idle');
        return;
      }

      if (idleMs >= IDLE_WARNING_MS) {
        setSecondsRemaining(Math.max(0, Math.round((IDLE_LOGOUT_MS - idleMs) / 1000)));
        return;
      }

      setSecondsRemaining(null);

      if (now - lastRefreshRef.current >= SILENT_REFRESH_INTERVAL_MS) {
        lastRefreshRef.current = now;
        try {
          await apiFetch('/auth/refresh', { method: 'POST' });
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) {
            await signOutAndRedirect('expired');
          }
        }
      }
    }, TICK_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, onActivity));
      window.clearInterval(interval);
    };
  }, [user, signOutAndRedirect]);

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
        You've been inactive for a while. For your security, you'll be signed out in{' '}
        <span className="tabular font-medium text-espresso">
          {minutes}:{seconds.toString().padStart(2, '0')}
        </span>{' '}
        unless you'd like to continue.
      </p>
    </Modal>
  );
}
