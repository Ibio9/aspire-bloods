/**
 * One definition of "looks like an email", and one set of words for when it
 * doesn't, shared by every field that asks for one.
 *
 * The same regex and the same two messages had been copied into six screens.
 * Copies drift: the day one of them tightens the pattern, sign-in accepts an
 * address that registration rejects, or the reset screen turns away a link the
 * clinic just sent. Kept here so that can't happen.
 *
 * Deliberately permissive — a client cannot truly know an address is
 * deliverable, only that it is shaped like one, and a stricter pattern rejects
 * valid addresses (plus-tags, long TLDs, subdomains) more often than it catches
 * mistakes. The server and the verification email are the real checks.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value);
}

/** Field validator: required first, then shape — with the wording used across the auth screens. */
export function validateEmail(value: string): string | undefined {
  if (!value) return 'Email address is required.';
  if (!isValidEmail(value)) return 'Enter a valid email address.';
  return undefined;
}
