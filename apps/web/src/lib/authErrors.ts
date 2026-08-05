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
export function authErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 429) {
      return `${e.message} This is a temporary lock to protect your account — it will clear on its own shortly.`;
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
