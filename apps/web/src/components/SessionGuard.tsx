import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { idleTimeoutMsForRole, idleWarningLeadMsForRole } from '@aspire-bloods/shared';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { apiFetch, ApiError, isIdleTimeoutError } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import { sessionClock } from '../lib/sessionClock';

/**
 * ===========================================================================
 *  THE SESSION'S CLOCKS BELONG TO THE SESSION, NOT TO THE ROUTE.
 * ===========================================================================
 *
 * That sentence is the whole of the bug this file used to have, and it signed
 * people out roughly fifteen minutes after they signed in, in the middle of
 * using the portal, with no warning at all.
 *
 * WHAT HAPPENED. `useNavigate()` memoises its callback on the current pathname
 * (read it in react-router's own source: the deps are `[basename, navigator,
 * routePathnamesJson, locationPathname, dataRouterContext]`), so it returns a
 * NEW FUNCTION IDENTITY ON EVERY ROUTE CHANGE. `signOutAndRedirect` closed over
 * it, the main effect depended on `signOutAndRedirect`, and the first three
 * lines of that effect reset the activity, refresh and ping timestamps to
 * `Date.now()`. So every navigation restarted every clock in here.
 *
 * The one that mattered was the token rotation. Access tokens live 15 minutes
 * server-side and this rotates them every 10 — but a patient moving around
 * their results changes route far more often than every ten minutes, so the
 * rotation NEVER FIRED. The access token lapsed on its own 15-minute wall
 * clock, the next authenticated request came back 401, and the session ended.
 *
 * It looked exactly like an idle-timeout bug and was not one: the 90-minute
 * idle window worked correctly throughout, and measurably — the server's signed
 * deadline slides on every authenticated request, and a reader who scrolls
 * without navigating was never affected. Reading was the case that WORKED.
 *
 * ── SO THE TIMERS ARE KEYED ON THE SESSION ────────────────────────────────
 *
 * The effect below depends on the signed-in USER ID and the two window
 * lengths, and on nothing that a render can change. `navigate` is held in a ref
 * so it can be current without being a dependency, and the timestamps are reset
 * only when the session id actually changes rather than every time the effect
 * happens to run. Both halves are needed: a stable dependency list is easy to
 * break again by adding one innocuous callback, and a reset guarded on the
 * session id cannot be broken that way at all.
 */

/**
 * Token rotation, independent of the idle window. Access tokens live 15 minutes
 * server-side (ACCESS_TOKEN_TTL_MINUTES); refreshing every 10 keeps a working
 * session alive with five minutes of headroom for a slow network or a
 * throttled background tab. The idle deadline is held and enforced by the
 * server (see lib/idleSession.ts) and a refresh on its own does not extend it.
 */
const SILENT_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const TICK_MS = 5 * 1000;

/**
 * How often real interaction is reported to the server. The server slides its
 * deadline on any authenticated request, so this only has to cover the case
 * where someone is reading rather than clicking; once every two minutes is
 * enough to keep a 15- or 90-minute deadline ahead of them without turning
 * scrolling into a request per frame.
 */
const ACTIVITY_PING_INTERVAL_MS = 2 * 60 * 1000;

/**
 * ANY INTERACTION, NOT JUST THE ONES THAT HAPPEN TO REACH A HANDLER.
 *
 * `mousemove` and `pointermove` are the additions that matter: somebody
 * reading a long report with the mouse in their hand is interacting with the
 * page and used to register as idle unless they also scrolled. `focus` and
 * `visibilitychange` cover coming back to a tab, which is the moment a reader
 * most wants their session to still be there.
 *
 * They fire at frame rate, so `onActivity` is throttled below — the handler is
 * a single timestamp write and the throttle keeps it to one per second rather
 * than one per frame.
 */
const ACTIVITY_EVENTS = [
  'mousedown',
  'mousemove',
  'pointerdown',
  'pointermove',
  'keydown',
  'touchstart',
  'touchmove',
  'scroll',
  'wheel',
  'focus',
] as const;

/** The cheapest useful throttle: at most one timestamp write per second. */
const ACTIVITY_THROTTLE_MS = 1000;

/**
 * Mounted once, inside AuthProvider, for the lifetime of the app. Does nothing
 * while signed out. While signed in it does three things: reports genuine
 * interaction to the server so the idle deadline slides, warns before the
 * deadline rather than dumping someone mid-task, and signs out (with a reason
 * the login screen can explain) on inactivity or on a rejected refresh — an
 * admin revoked the account, or the 30-day refresh token itself finally
 * expired.
 *
 * The countdown here is presentation, and since Aug 2026 it is presentation OF
 * THE SERVER'S OWN DEADLINE: `/auth/activity` returns `idleDeadlineMs` and the
 * client aligns to it. The two cannot drift, because only one of them is
 * deciding.
 */
export function SessionGuard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  /**
   * `navigate` is held rather than depended on. See the note at the top: its
   * identity changes on every route change, and anything downstream of it in a
   * dependency list drags the whole effect — and every timer in it — round with
   * the router.
   */
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const lastActivityRef = useRef(Date.now());
  const lastRefreshRef = useRef(Date.now());
  const lastActivityPingRef = useRef(Date.now());
  /**
   * The server's own deadline, as of the last request that reported one. The
   * countdown is measured against this rather than against the browser's idea
   * of when it last saw a mouse, so "client and server agree" is structural.
   * Null until the first ping answers, when the local estimate is used.
   */
  const serverDeadlineRef = useRef<number | null>(null);
  /**
   * WHICH SESSION THESE TIMESTAMPS BELONG TO. The reset below is keyed on this
   * rather than on the effect running, which is what stops a re-render or a
   * route change from silently restarting the token rotation.
   */
  const sessionRef = useRef<string | null>(null);

  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const secondsRemainingRef = useRef<number | null>(null);
  secondsRemainingRef.current = secondsRemaining;

  // Patients get 90 minutes, staff 15 — one constant, in the shared package, so
  // the browser's countdown and the server's deadline cannot drift apart.
  const idleTimeoutMs = user ? idleTimeoutMsForRole(user.role) : 0;
  // The lead is a share of the window rather than a fixed two minutes — see
  // idleWarningLeadMsForRole. Five minutes for a patient, three for staff.
  const warningLeadMs = user ? idleWarningLeadMsForRole(user.role) : 0;

  const signOutAndRedirect = useCallback(
    async (reason: 'idle' | 'expired') => {
      await logout(reason);
      navigateRef.current('/login', { replace: true });
    },
    // `logout` is stable (AuthContext memoises it on []), and `navigate` is
    // deliberately absent — it is read through the ref above.
    [logout],
  );

  const staySignedIn = useCallback(async () => {
    const now = Date.now();
    lastActivityRef.current = now;
    lastActivityPingRef.current = now;
    setSecondsRemaining(null);
    try {
      // Reports the interaction first — this is the call that moves the
      // server's deadline. The rotation below does not, by design.
      const { idleDeadlineMs } = await apiFetch<{ idleDeadlineMs?: number }>('/auth/activity', { method: 'POST' });
      if (typeof idleDeadlineMs === 'number') serverDeadlineRef.current = idleDeadlineMs;
      await apiFetch('/auth/refresh', { method: 'POST' });
      lastRefreshRef.current = Date.now();
    } catch (e) {
      void signOutAndRedirect(isIdleTimeoutError(e) ? 'idle' : 'expired');
    }
  }, [signOutAndRedirect]);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      sessionRef.current = null;
      return;
    }

    /**
     * ONLY A NEW SESSION RESTARTS THE CLOCKS. This effect can still run again —
     * a window length changing, or a future edit adding a dependency — and when
     * it does the timers have to survive it. Restarting them is what stopped
     * the token rotation from ever reaching ten minutes.
     */
    if (sessionRef.current !== userId) {
      sessionRef.current = userId;
      const startedAt = Date.now();
      lastActivityRef.current = startedAt;
      lastRefreshRef.current = startedAt;
      lastActivityPingRef.current = startedAt;
      serverDeadlineRef.current = null;
      setSecondsRemaining(null);
    }

    let lastSeen = 0;
    function onActivity() {
      const now = Date.now();
      if (now - lastSeen < ACTIVITY_THROTTLE_MS) return;
      lastSeen = now;
      // Only matters while not already in the idle-warning window — once the
      // warning is showing, activity elsewhere on the page (it can still be
      // open behind the modal) shouldn't silently dismiss it; only the explicit
      // "Stay signed in" action should.
      if (secondsRemainingRef.current === null) lastActivityRef.current = now;
    }
    function onVisible() {
      if (document.visibilityState === 'visible') onActivity();
    }
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, onActivity, { passive: true }));
    document.addEventListener('visibilitychange', onVisible);

    const interval = window.setInterval(async () => {
      const now = Date.now();
      /**
       * EVERY DECISION IS `sessionClock`'s, and it is pure so that three hours
       * of use can be pushed through it in a test rather than waited out. This
       * bug was invisible to everything except a wall clock; see
       * lib/sessionClock.test.ts.
       */
      const decision = sessionClock({
        now,
        lastActivity: lastActivityRef.current,
        lastRefresh: lastRefreshRef.current,
        lastPing: lastActivityPingRef.current,
        serverDeadline: serverDeadlineRef.current,
        idleTimeoutMs,
        warningLeadMs,
        refreshIntervalMs: SILENT_REFRESH_INTERVAL_MS,
        pingIntervalMs: ACTIVITY_PING_INTERVAL_MS,
      });

      if (decision.signOut) {
        await signOutAndRedirect('idle');
        return;
      }
      setSecondsRemaining(decision.warnSeconds);
      if (decision.warnSeconds !== null) return;

      // Someone reading a report makes no other requests, so interaction is
      // reported on its own cadence rather than riding on whatever the page
      // happens to be fetching. The server answers with its own deadline and
      // the countdown above aligns to it.
      if (decision.ping) {
        lastActivityPingRef.current = now;
        try {
          const { idleDeadlineMs } = await apiFetch<{ idleDeadlineMs?: number }>('/auth/activity', { method: 'POST' });
          if (typeof idleDeadlineMs === 'number') serverDeadlineRef.current = idleDeadlineMs;
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) {
            await signOutAndRedirect(isIdleTimeoutError(e) ? 'idle' : 'expired');
            return;
          }
        }
      }

      /**
       * THE ROTATION, and the reason this file has a long note at the top. It
       * is the only thing keeping the 15-minute access token alive, it is
       * invisible when it works, and when it silently stopped running nothing
       * failed until the token lapsed a quarter of an hour later. Measured
       * before the fix: a session navigating every 30 seconds made ZERO
       * /auth/refresh calls and was signed out at 15 minutes 22 seconds.
       */
      if (decision.refresh) {
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
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(interval);
    };
    // `signOutAndRedirect` is stable (see its own note); `user.id` rather than
    // `user`, so a re-fetched /auth/me carrying the same person does not tear
    // this down and restart it.
  }, [userId, signOutAndRedirect, idleTimeoutMs, warningLeadMs]);

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
        You’ve been inactive, so for your security you’ll be signed out in{' '}
        <span className="tabular font-medium text-espresso">
          {minutes}:{seconds.toString().padStart(2, '0')}
        </span>
        .
      </p>
    </Modal>
  );
}
