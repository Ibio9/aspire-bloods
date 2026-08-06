import { ApiError } from './api';

// The clinic's own verified contact channel (from the footer disclaimer /
// clinical-team address) — never invent a phone number that doesn't exist
// anywhere else in the system just to fill this copy in.
const CLINIC_CONTACT = 'clinical-team@aspireshield.com';

/**
 * Turns a caught error from a login/signup/OTP call into copy a person can
 * act on. "Something went wrong" is banned in a clinical product (brief
 * §4) — but the server deliberately returns the *same* generic message for
 * "no such account", "wrong password", and "account not yet activated"
 * (see auth/service.ts login() — DUMMY_HASH, timing-safe by design) to
 * avoid leaking which addresses are registered. That anti-enumeration
 * design is intentionally NOT weakened here; what this function adds is
 * distinguishing failure classes the server *does* already tell us apart:
 * rate-limited/locked-out (429), the service being unreachable (502/503 or
 * a network-level failure), and everything else (which the server already
 * phrases humanely per-case: expired/incorrect code, expired invite, etc).
 */
/**
 * How long a 429 says to wait, in seconds, or null if this wasn't a lockout.
 * The server puts the real number in the body (see the API's
 * middleware/rateLimit.ts) precisely so the UI can count it down instead of
 * saying "shortly" — a locked-out person needs to know whether to wait or to
 * go and do something else, and "shortly" answers neither.
 */
export function lockoutSeconds(e: unknown): number | null {
  if (!(e instanceof ApiError) || e.status !== 429) return null;
  const seconds = (e.details as { retryAfterSeconds?: unknown } | null)?.retryAfterSeconds;
  return typeof seconds === 'number' && seconds > 0 ? Math.ceil(seconds) : null;
}

export function formatCountdown(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds} second${totalSeconds === 1 ? '' : 's'}`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const minutePart = `${minutes} minute${minutes === 1 ? '' : 's'}`;
  return seconds === 0 ? minutePart : `${minutePart} ${seconds}s`;
}

export function authErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 429) {
      const wait = lockoutSeconds(e);
      return wait
        ? `${e.message} You can try again in ${formatCountdown(wait)}.`
        : `${e.message} This is a temporary lock to protect your account.`;
    }
    if (e.status === 502 || e.status === 503) {
      return `We couldn't send that just now — our email/SMS service is temporarily unavailable. Please try again in a few minutes, or contact ${CLINIC_CONTACT} if this continues.`;
    }
    return e.message;
  }
  // fetch() itself throwing (offline, DNS failure, server unreachable) is a
  // plain TypeError, not an ApiError — this is the genuine "service is
  // down" case, not a validation or auth failure.
  return `Aspire Bloods isn't reachable right now. Check your connection and try again, or contact ${CLINIC_CONTACT} if this continues.`;
}
