import { describe, expect, it } from 'vitest';
import {
  PATIENT_IDLE_TIMEOUT_MINUTES,
  STAFF_IDLE_TIMEOUT_MINUTES,
  idleTimeoutMsForRole,
  idleWarningLeadMsForRole,
} from '@aspire-bloods/shared';
import { sessionClock, type SessionClockInput } from './sessionClock';

/**
 * ===========================================================================
 *  IDLE HAS TO MEAN IDLE, ACROSS A SPAN LONGER THAN THE TIMEOUT.
 * ===========================================================================
 *
 * A patient was signed out roughly fifteen minutes into an ordinary session,
 * mid-read, with no warning. The cause was not the idle window — that worked —
 * it was the token rotation silently never running, because every route change
 * restarted its clock (see the note at the top of SessionGuard.tsx).
 *
 * Nothing caught it because the only thing that could have was a wall clock.
 * So the decisions are pure now and this drives them over a SIMULATED one: an
 * hour, two hours, three hours of plausible use, at the same five-second tick
 * the component runs, asserting the session is still alive at the end.
 *
 * THE ACCESS TOKEN'S OWN TTL IS THE OTHER HALF. The window a session dies on is
 * whichever expires first, and the one that actually killed this session was
 * the 15-minute access token rather than the 90-minute idle window. So the
 * simulation asserts the rotation gap as well as survival: a run that never
 * signs out but leaves a 20-minute hole between refreshes is a session that
 * dies on the next request, and it would otherwise pass.
 */

const MINUTE = 60 * 1000;

/** The component's own numbers, so this cannot pass against different ones. */
const REFRESH_INTERVAL_MS = 10 * MINUTE;
const PING_INTERVAL_MS = 2 * MINUTE;
const ACCESS_TOKEN_TTL_MS = 15 * MINUTE;
const TICK_MS = 5 * 1000;

interface Outcome {
  signedOut: boolean;
  signedOutAt: number | null;
  warnedAt: number[];
  refreshes: number[];
  pings: number[];
  longestRefreshGap: number;
}

/**
 * Runs a session through the clock, tick by tick, applying each decision the
 * way the component and the server would.
 *
 * `activityEveryMs` of null means nobody touches the page at all — the case the
 * timeout exists for. Anything else is somebody using it.
 */
function simulate(opts: {
  minutes: number;
  role: 'PATIENT' | 'ADMIN';
  activityEveryMs: number | null;
  /** Reset the timers on this cadence, the way the old effect did on every route change. */
  resetTimersEveryMs?: number | null;
}): Outcome {
  const idleTimeoutMs = idleTimeoutMsForRole(opts.role);
  const warningLeadMs = idleWarningLeadMsForRole(opts.role);

  const start = 1_700_000_000_000;
  let lastActivity = start;
  let lastRefresh = start;
  let lastPing = start;
  let serverDeadline: number | null = null;

  const out: Outcome = {
    signedOut: false,
    signedOutAt: null,
    warnedAt: [],
    refreshes: [],
    pings: [],
    longestRefreshGap: 0,
  };
  let previousRefresh = start;

  for (let t = 0; t <= opts.minutes * MINUTE; t += TICK_MS) {
    const now = start + t;

    // Somebody interacting with the page.
    if (opts.activityEveryMs !== null && t > 0 && t % opts.activityEveryMs === 0) lastActivity = now;
    // The failure mode this is really about: a re-render or a route change
    // putting every clock back to zero.
    if (opts.resetTimersEveryMs && t > 0 && t % opts.resetTimersEveryMs === 0) {
      lastActivity = now;
      lastRefresh = now;
      lastPing = now;
    }

    const decision = sessionClock({
      now,
      lastActivity,
      lastRefresh,
      lastPing,
      serverDeadline,
      idleTimeoutMs,
      warningLeadMs,
      refreshIntervalMs: REFRESH_INTERVAL_MS,
      pingIntervalMs: PING_INTERVAL_MS,
    });

    if (decision.signOut) {
      out.signedOut = true;
      out.signedOutAt = t;
      break;
    }
    if (decision.warnSeconds !== null) out.warnedAt.push(t);
    if (decision.ping) {
      lastPing = now;
      // What the server answers: its deadline slides to a full window from now.
      serverDeadline = now + idleTimeoutMs;
      out.pings.push(t);
    }
    if (decision.refresh) {
      lastRefresh = now;
      out.refreshes.push(t);
      out.longestRefreshGap = Math.max(out.longestRefreshGap, now - previousRefresh);
      previousRefresh = now;
    }
  }
  // The tail counts: a run that stops one tick before a due refresh has still
  // left the token unrotated for that long.
  if (!out.signedOut) {
    out.longestRefreshGap = Math.max(out.longestRefreshGap, start + opts.minutes * MINUTE - previousRefresh);
  }
  return out;
}

describe('the session clock', () => {
  it('keeps a patient signed in across three hours of use, at every plausible rhythm', () => {
    // THE TEST THIS BUG NEEDED. Three hours is twice the 90-minute window, and
    // the rhythms bracket what using a results portal looks like: glancing at
    // something every half minute, working through a long report with a scroll
    // every few minutes, and reading a page for eight minutes at a time — the
    // last being longer than the ping interval and shorter than the window.
    for (const everyMinutes of [0.5, 1, 3, 5, 8]) {
      const run = simulate({ minutes: 180, role: 'PATIENT', activityEveryMs: everyMinutes * MINUTE });
      expect(
        run.signedOut,
        `activity every ${everyMinutes} min: signed out at ${(run.signedOutAt ?? 0) / MINUTE} min`,
      ).toBe(false);
      expect(run.warnedAt, `activity every ${everyMinutes} min: warned mid-session`).toEqual([]);
      // AND THE TOKEN STAYED ALIVE THE WHOLE WAY. This is the assertion the
      // real failure would have tripped: it never signed out on the idle
      // window, it ran out of access token.
      expect(
        run.longestRefreshGap,
        `activity every ${everyMinutes} min: ${run.longestRefreshGap / MINUTE} min between rotations`,
      ).toBeLessThan(ACCESS_TOKEN_TTL_MS);
      expect(run.refreshes.length, `activity every ${everyMinutes} min: rotations`).toBeGreaterThanOrEqual(17);
    }
  });

  it('rotates the token even while nobody is touching the page', () => {
    // A reader who has not moved for nine minutes still needs a working token
    // the moment they do. The rotation is not gated on activity; the ping is.
    const run = simulate({ minutes: 60, role: 'PATIENT', activityEveryMs: null });
    expect(run.longestRefreshGap).toBeLessThan(ACCESS_TOKEN_TTL_MS);
    expect(run.pings, 'reported activity that never happened').toEqual([]);
  });

  it('catches the regression it was written for: clocks restarted by something that is not the session', () => {
    // The old effect reset every timestamp whenever it re-ran, and it re-ran on
    // every route change because `useNavigate` returns a new identity per
    // navigation. Modelled here as a reset every 30 seconds — ordinary use.
    //
    // The session never goes idle (the resets look like activity), and the
    // token is never rotated, which is exactly what was observed: signed out
    // mid-use with no warning, about fifteen minutes in.
    const broken = simulate({
      minutes: 60,
      role: 'PATIENT',
      activityEveryMs: 30 * 1000,
      resetTimersEveryMs: 30 * 1000,
    });
    expect(broken.signedOut, 'the idle window is not what ended it').toBe(false);
    expect(broken.refreshes, 'the token was rotated despite the resets').toEqual([]);
    expect(broken.longestRefreshGap).toBeGreaterThan(ACCESS_TOKEN_TTL_MS);

    // And the same rhythm without the resets is fine — so the test is about the
    // resets and not about the rhythm.
    const fixed = simulate({ minutes: 60, role: 'PATIENT', activityEveryMs: 30 * 1000 });
    expect(fixed.refreshes.length).toBeGreaterThanOrEqual(5);
    expect(fixed.longestRefreshGap).toBeLessThan(ACCESS_TOKEN_TTL_MS);
  });

  it('still signs an untouched session out, at the window and not before it', () => {
    // The other half: idle has to mean idle in both directions, or this would
    // be a fix that quietly removed the timeout.
    for (const role of ['PATIENT', 'ADMIN'] as const) {
      const window = idleTimeoutMsForRole(role);
      const run = simulate({ minutes: (window / MINUTE) * 2, role, activityEveryMs: null });
      expect(run.signedOut, `${role} was never signed out`).toBe(true);
      expect(run.signedOutAt, `${role} signed out early`).toBeGreaterThanOrEqual(window);
      expect(run.signedOutAt, `${role} signed out late`).toBeLessThan(window + TICK_MS * 2);
    }
  });

  it('warns with the whole lead to act on, and never in the middle of a session', () => {
    const lead = idleWarningLeadMsForRole('PATIENT');
    const run = simulate({ minutes: PATIENT_IDLE_TIMEOUT_MINUTES * 2, role: 'PATIENT', activityEveryMs: null });
    const firstWarning = run.warnedAt[0];
    expect(firstWarning, 'no warning at all').toBeDefined();
    // The modal appears a full lead before the deadline — five minutes for a
    // patient, three for staff — rather than as the session ends.
    expect((run.signedOutAt ?? 0) - firstWarning).toBeGreaterThanOrEqual(lead - TICK_MS);
    // And every tick between the two is a warning tick: it appears once and
    // stays, rather than flickering as the two clocks disagree.
    expect(run.warnedAt.length).toBe(Math.round(((run.signedOutAt ?? 0) - firstWarning) / TICK_MS));
  });

  it('any interaction extends the session, including one arriving during the warning', () => {
    // "Stay signed in" is the explicit path, but the guarantee asked for is
    // broader: interaction extends it. Modelled at the clock level — activity
    // moves `lastActivity`, the ping that follows moves the server's deadline,
    // and the warning goes.
    const idleTimeoutMs = idleTimeoutMsForRole('PATIENT');
    const warningLeadMs = idleWarningLeadMsForRole('PATIENT');
    const now = 1_700_000_000_000;
    const base: SessionClockInput = {
      now,
      lastActivity: now - idleTimeoutMs + 60_000,
      lastRefresh: now,
      lastPing: now - PING_INTERVAL_MS,
      serverDeadline: now + 60_000,
      idleTimeoutMs,
      warningLeadMs,
      refreshIntervalMs: REFRESH_INTERVAL_MS,
      pingIntervalMs: PING_INTERVAL_MS,
    };
    expect(sessionClock(base).warnSeconds, 'should be warning a minute out').toBe(60);

    // The reader touches the page. Both clocks move and the warning is gone.
    const after = sessionClock({
      ...base,
      lastActivity: now,
      serverDeadline: now + idleTimeoutMs,
    });
    expect(after.warnSeconds).toBeNull();
    expect(after.signOut).toBe(false);
  });

  it('never signs out on the local clock alone while the server still says live', () => {
    // The two have to agree. A browser tab whose timers were throttled can
    // arrive believing it has been idle for hours; the server's signed deadline
    // is the thing that decides, and it is the only thing that can.
    const idleTimeoutMs = idleTimeoutMsForRole('PATIENT');
    const now = 1_700_000_000_000;
    const decision = sessionClock({
      now,
      lastActivity: now - idleTimeoutMs * 3,
      lastRefresh: now,
      lastPing: now,
      serverDeadline: now + 30 * MINUTE,
      idleTimeoutMs,
      warningLeadMs: idleWarningLeadMsForRole('PATIENT'),
      refreshIntervalMs: REFRESH_INTERVAL_MS,
      pingIntervalMs: PING_INTERVAL_MS,
    });
    expect(decision.signOut).toBe(false);
    expect(decision.warnSeconds).toBeNull();
  });

  it('holds the two windows apart, so a fix to one is never a fix to both', () => {
    // The pair idleSession.test.ts pins server-side, asserted again here
    // because this file is where the client's copy of them is used.
    expect(PATIENT_IDLE_TIMEOUT_MINUTES).toBe(90);
    expect(STAFF_IDLE_TIMEOUT_MINUTES).toBe(15);
    expect(REFRESH_INTERVAL_MS).toBeLessThan(ACCESS_TOKEN_TTL_MS);
  });
});
