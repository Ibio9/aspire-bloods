import { env } from '../config/env.js';
import { assertAdminEmailsConfigured } from './adminAccess.js';

// Literal placeholder strings from .env.example — if any of these made it
// into a real deployment unchanged, every session/encryption/CSRF
// guarantee in the app is void. Checked verbatim, not just "is it set."
const PLACEHOLDER_VALUES = new Set([
  'replace-with-64-char-random-hex',
  'replace-with-different-64-char-random-hex',
  'replace-with-base64-32-byte-key',
]);

function assertNoPlaceholderSecrets(): void {
  const secretVars: [string, string][] = [
    ['JWT_ACCESS_SECRET', env.JWT_ACCESS_SECRET],
    ['JWT_REFRESH_SECRET', env.JWT_REFRESH_SECRET],
    ['CSRF_SECRET', env.CSRF_SECRET],
    ['ENCRYPTION_KEY', env.ENCRYPTION_KEY],
    ['FILE_SIGNING_SECRET', env.FILE_SIGNING_SECRET],
  ];
  const offending = secretVars.filter(([, value]) => PLACEHOLDER_VALUES.has(value));
  if (offending.length > 0) {
    throw new Error(
      `Refusing to boot in production: ${offending.map(([name]) => name).join(', ')} still ${offending.length === 1 ? 'has' : 'have'} the .env.example placeholder value. Generate real secrets — see README.`,
    );
  }
}

function assertDevOtpBypassDisabled(): void {
  if (env.EXPOSE_DEV_OTP_CODE) {
    throw new Error(
      'Refusing to boot in production: EXPOSE_DEV_OTP_CODE=true would return live 2FA codes in API responses — this is a full 2FA bypass. Set it false (or unset) for production.',
    );
  }
}

function assertRealEmailProviderConfigured(): void {
  if (!env.RESEND_API_KEY) {
    throw new Error(
      'Refusing to boot in production: RESEND_API_KEY is not set. Without it, ResendEmailProvider falls back to printing emails — including OTP codes and patient email addresses — to the server console, which would put PII in Railway logs.',
    );
  }
}

function assertValidCookieDomain(): void {
  if (env.COOKIE_DOMAIN === 'localhost') {
    throw new Error(
      'Refusing to boot in production: COOKIE_DOMAIN is still "localhost" (the dev default). Set it to the real parent domain, e.g. blood.aspireshield.com — see DEPLOYMENT.md.',
    );
  }
  if (env.COOKIE_DOMAIN.startsWith('.')) {
    // RFC 6265 domain-matching already covers all subdomains without a
    // leading dot — that syntax is a pre-RFC-6265 (Netscape-era) artefact,
    // and at least one cookie-serialising library in this app's dependency
    // tree rejects it outright ("option domain is invalid"), which
    // surfaced as a 500 on every successful login/OTP-verify (the first
    // point a session cookie actually gets set). Reject it here instead of
    // letting it crash the first real request.
    throw new Error(
      `Refusing to boot in production: COOKIE_DOMAIN ("${env.COOKIE_DOMAIN}") starts with a leading dot. Remove it — e.g. "blood.aspireshield.com", not ".blood.aspireshield.com". The leading dot is unnecessary (RFC 6265 domain-matching already includes subdomains) and at least one cookie library in use rejects it outright.`,
    );
  }
}

/**
 * The escalation has somewhere real to go.
 *
 * This is the one notification in the product that exists because a patient
 * might need to hear from somebody: a released report comes back with a result
 * outside its range and a clinician is told. `emailProvider.sendEmail` to an
 * empty or malformed address does not throw here — it fails at Resend, in a
 * log, hours later, and the practice's evidence that nothing needed attention
 * is that nothing arrived.
 *
 * Deliberately narrow. It checks that the value is present and is an address,
 * not that anybody reads it: no code can tell whether a mailbox is monitored,
 * and a check that pretended to would be worse than this one.
 */
export function isRoutableEscalationAddress(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(trimmed);
}

function assertEscalationRoutable(): void {
  const value = env.ESCALATION_EMAIL.trim();
  if (!isRoutableEscalationAddress(value)) {
    throw new Error(
      `Refusing to boot in production: ESCALATION_EMAIL is ${value ? `"${value}", which is not an email address` : 'not set'}. ` +
        'It is where a clinician is told that a released report came back outside its reference range, and a send to nowhere fails at the provider rather than here. ' +
        'Set it to a monitored address — see DEPLOYMENT.md. It is staff-facing routing and is never shown to a patient; the address they see is CLINIC_CONTACT_EMAIL.',
    );
  }
}

/**
 * Phase 4 §4.5: fail loudly at startup, not silently at first request, if
 * production is misconfigured. Called once from index.ts before the
 * server starts listening — a thrown error here should crash the deploy,
 * not boot a broken app.
 */
export function runProductionBootChecks(): void {
  if (env.NODE_ENV !== 'production') return;

  assertAdminEmailsConfigured();
  assertNoPlaceholderSecrets();
  assertDevOtpBypassDisabled();
  assertRealEmailProviderConfigured();
  assertValidCookieDomain();
  assertEscalationRoutable();
}
