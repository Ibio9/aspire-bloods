import crypto from 'node:crypto';
import { idleTimeoutMsForRole, type UserRole } from '@aspire-bloods/shared';
import { env } from '../config/env.js';

/**
 * Server-side idle enforcement.
 *
 * The idle deadline lives in its own signed cookie rather than in the access
 * token or the database, for three reasons:
 *
 *  - It has to be independent of the access token. The access token's 15-minute
 *    lifetime is a security primitive and is deliberately left alone; the idle
 *    window is 30 minutes for patients and has to outlive it, sliding on
 *    activity rather than being fixed at issue time.
 *  - It has to be enforced by the server, not asserted by the browser. The
 *    payload is HMAC'd with a key derived from JWT_ACCESS_SECRET, so a client
 *    can read its own deadline but cannot move it forward. Replaying an older
 *    cookie only ever produces an *earlier* deadline, which fails closed.
 *  - It must not put a database round trip on every authenticated request.
 *    authGuard is deliberately stateless (see lib/jwt.ts on why the role is
 *    re-derived rather than read back), and this keeps it that way.
 *
 * The cookie is bound to the user id it was issued for, so one session's
 * deadline cannot be presented alongside another session's access token.
 */

export const IDLE_COOKIE_NAME = 'idle_deadline';

/**
 * Domain-separated from the token signing key rather than introduced as a new
 * required environment variable — a new secret would have to be set on every
 * deployment before this could ship, and getting it wrong fails closed by
 * signing everyone out. Same secret material, different key, different purpose.
 */
const idleKey = crypto
  .createHmac('sha256', env.JWT_ACCESS_SECRET)
  .update('aspire.idle-session.v1')
  .digest();

function sign(payload: string): string {
  return crypto.createHmac('sha256', idleKey).update(payload).digest('base64url');
}

export interface IdleDeadline {
  userId: string;
  deadlineMs: number;
}

/** The cookie value for a session that has just seen activity. */
export function issueIdleDeadline(userId: string, role: UserRole): { value: string; deadlineMs: number } {
  const deadlineMs = Date.now() + idleTimeoutMsForRole(role);
  const payload = `${userId}.${deadlineMs}`;
  return { value: `${payload}.${sign(payload)}`, deadlineMs };
}

/**
 * Verifies the signature and returns what the cookie claims. Returns null for
 * anything it cannot vouch for — missing, malformed, or tampered with — so
 * every caller fails closed rather than treating an unreadable deadline as
 * "no deadline".
 */
export function parseIdleDeadline(raw: string | undefined): IdleDeadline | null {
  if (!raw) return null;

  const lastDot = raw.lastIndexOf('.');
  if (lastDot <= 0) return null;

  const payload = raw.slice(0, lastDot);
  const signature = raw.slice(lastDot + 1);
  const expected = sign(payload);

  // timingSafeEqual throws on a length mismatch, so that is checked first.
  if (signature.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  const separator = payload.lastIndexOf('.');
  if (separator <= 0) return null;

  const userId = payload.slice(0, separator);
  const deadlineMs = Number(payload.slice(separator + 1));
  if (!Number.isFinite(deadlineMs)) return null;

  return { userId, deadlineMs };
}

/**
 * Whether this cookie still authorises a request for this user. Fails closed on
 * a missing or unverifiable cookie: deleting it must sign you out, not exempt
 * you from the timeout.
 */
export function isIdleDeadlineLive(raw: string | undefined, userId: string, now = Date.now()): boolean {
  const parsed = parseIdleDeadline(raw);
  if (!parsed) return false;
  if (parsed.userId !== userId) return false;
  return now <= parsed.deadlineMs;
}
