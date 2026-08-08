import type { UserRole } from './types.js';

/**
 * Idle timeout — how long a session survives with no user activity.
 *
 * This is NOT the access token lifetime and must never be conflated with it.
 * The access token (ACCESS_TOKEN_TTL_MINUTES, 15m) and the refresh token
 * (REFRESH_TOKEN_TTL_DAYS, 30d) are security primitives about how long a
 * credential is valid; this is a product decision about how long we leave an
 * unattended screen signed in. They were the same number by accident — the
 * idle sign-out was implemented as "let the access token lapse" — which meant
 * changing one silently changed the other. They are now independent: the
 * deadline below is enforced on its own, and token lifetimes are untouched.
 *
 * Patients and staff are deliberately different. A patient is reading their
 * own results on their own device and a 15-minute timeout is an irritation
 * with no security benefit. An admin or clinician session can reach every
 * patient's data in the practice, is more likely to be on a shared clinic
 * machine, and keeps the shorter window.
 */
export const PATIENT_IDLE_TIMEOUT_MINUTES = 30;
export const STAFF_IDLE_TIMEOUT_MINUTES = 15;

export function idleTimeoutMinutesForRole(role: UserRole): number {
  return role === 'PATIENT' ? PATIENT_IDLE_TIMEOUT_MINUTES : STAFF_IDLE_TIMEOUT_MINUTES;
}

export function idleTimeoutMsForRole(role: UserRole): number {
  return idleTimeoutMinutesForRole(role) * 60 * 1000;
}

/**
 * How long before the deadline the browser offers "stay signed in". Long
 * enough to notice and act on, short enough that it isn't showing for a
 * meaningful fraction of the session.
 */
export const IDLE_WARNING_LEAD_MS = 2 * 60 * 1000;

/**
 * Marks a 401 as "you went idle" rather than any of the other reasons a
 * session can end (revoked account, expired refresh token, signed out
 * elsewhere). The sign-in screen shows a different line for each, so the
 * message a patient reads reflects what actually happened.
 */
export const IDLE_TIMEOUT_ERROR_CODE = 'IDLE_TIMEOUT';
