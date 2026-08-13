/**
 * ===========================================================================
 *  WHAT THE SESSION GUARD SHOULD DO AT THIS INSTANT.
 * ===========================================================================
 *
 * Pure arithmetic, extracted from SessionGuard so it can be run over a
 * simulated clock rather than a real one. The bug that produced it signed a
 * patient out fifteen minutes into an ordinary session, and the reason nothing
 * caught it is that the decisions were spread through an effect whose timers
 * only a ninety-minute wall clock could exercise.
 *
 * Nothing here knows about React, routes, or the network. It takes four
 * timestamps and returns what is due — so a test can push three hours of
 * plausible use through it in a millisecond and assert that a session survives
 * it, which is the thing that actually needed asserting.
 *
 * THE DEADLINE IS THE SERVER'S. `serverDeadline` is what `/auth/activity`
 * last answered; the local window is a fallback for the first moments of a
 * session, before any ping has been answered. Both have to agree that the
 * window is gone before this says sign out — the server is the one enforcing
 * it, and a client that signed out early on its own clock would be inventing a
 * timeout the server does not have.
 */

export interface SessionClockInput {
  now: number;
  /** When the browser last saw a real interaction. */
  lastActivity: number;
  /** When the access token was last rotated. */
  lastRefresh: number;
  /** When interaction was last reported to the server. */
  lastPing: number;
  /** The server's own idle deadline, or null before the first ping is answered. */
  serverDeadline: number | null;
  idleTimeoutMs: number;
  warningLeadMs: number;
  /** How often the access token is rotated. Must be under its own server-side TTL. */
  refreshIntervalMs: number;
  /** How often interaction is reported while somebody is active. */
  pingIntervalMs: number;
}

export interface SessionClockOutput {
  /** The window is gone by both clocks. */
  signOut: boolean;
  /** Seconds left, or null when the warning should not be showing. */
  warnSeconds: number | null;
  /** Report interaction to the server now. */
  ping: boolean;
  /** Rotate the access token now. */
  refresh: boolean;
}

export function sessionClock(input: SessionClockInput): SessionClockOutput {
  const { now, lastActivity, lastRefresh, lastPing, serverDeadline } = input;
  const { idleTimeoutMs, warningLeadMs, refreshIntervalMs, pingIntervalMs } = input;

  const idleMs = now - lastActivity;
  const deadline = serverDeadline ?? lastActivity + idleTimeoutMs;
  const untilDeadline = deadline - now;

  if (idleMs >= idleTimeoutMs && untilDeadline <= 0) {
    return { signOut: true, warnSeconds: null, ping: false, refresh: false };
  }

  if (idleMs >= idleTimeoutMs - warningLeadMs && untilDeadline <= warningLeadMs) {
    return { signOut: false, warnSeconds: Math.max(0, Math.round(untilDeadline / 1000)), ping: false, refresh: false };
  }

  /**
   * THE ROTATION IS NOT GATED ON ACTIVITY, and that is deliberate. It keeps a
   * 15-minute access token alive; a reader who has not moved for three minutes
   * still needs one that works when they do. Gating it was never the bug, but
   * gating it would be a way to reintroduce the same failure from the other
   * side.
   */
  const refresh = now - lastRefresh >= refreshIntervalMs;

  /**
   * The ping IS gated on activity: it is a claim that somebody is there, and a
   * client that made it while nobody was would be defeating the timeout rather
   * than reporting to it.
   */
  const ping = idleMs < pingIntervalMs && now - lastPing >= pingIntervalMs;

  return { signOut: false, warnSeconds: null, ping, refresh };
}
