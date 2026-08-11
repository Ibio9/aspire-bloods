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
 * Patients and staff are deliberately different, and the two constants are
 * deliberately independent — changing one must never move the other. A patient
 * is reading their own results on their own device; someone working through a
 * 180-marker panel, following a link out to read about a marker and coming
 * back, was being signed out mid-read at 30 minutes, which is an irritation
 * with no security benefit. Ninety minutes covers a real sitting.
 *
 * An admin or clinician session can reach every patient's data in the
 * practice, is more likely to be on a shared clinic machine, and keeps its own
 * much shorter window. That number is not to be raised alongside this one.
 */
export const PATIENT_IDLE_TIMEOUT_MINUTES = 90;
export const STAFF_IDLE_TIMEOUT_MINUTES = 15;

export function idleTimeoutMinutesForRole(role: UserRole): number {
  return role === 'PATIENT' ? PATIENT_IDLE_TIMEOUT_MINUTES : STAFF_IDLE_TIMEOUT_MINUTES;
}

export function idleTimeoutMsForRole(role: UserRole): number {
  return idleTimeoutMinutesForRole(role) * 60 * 1000;
}

/**
 * How long before the deadline the browser offers "stay signed in".
 *
 * A fixed two minutes was right when both windows were short and is not right
 * now that the patient window is 90 minutes: a warning that appears for 2.2% of
 * a session is one somebody misses while making tea. It is capped rather than
 * proportional at the other end, because a fifth of a staff window is three
 * minutes and a fifth of a patient window would be eighteen — long enough that
 * the modal becomes part of the furniture.
 *
 * Patients: 5 minutes. Staff: 3.
 */
export const IDLE_WARNING_LEAD_CAP_MS = 5 * 60 * 1000;

export function idleWarningLeadMsForRole(role: UserRole): number {
  return Math.min(IDLE_WARNING_LEAD_CAP_MS, idleTimeoutMsForRole(role) * 0.2);
}

/**
 * Retained under its original name because it is the value the patient window
 * used to use. Prefer idleWarningLeadMsForRole — the lead is a function of the
 * window, and the two windows are no longer close enough for one number.
 */
export const IDLE_WARNING_LEAD_MS = 2 * 60 * 1000;

/**
 * Marks a 401 as "you went idle" rather than any of the other reasons a
 * session can end (revoked account, expired refresh token, signed out
 * elsewhere). The sign-in screen shows a different line for each, so the
 * message a patient reads reflects what actually happened.
 */
export const IDLE_TIMEOUT_ERROR_CODE = 'IDLE_TIMEOUT';
