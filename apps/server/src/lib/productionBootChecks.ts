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
}
