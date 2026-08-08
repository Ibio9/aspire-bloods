import type { UserRole } from '@aspire-bloods/shared';
import { env } from '../config/env.js';

/**
 * Admin access is controlled entirely by the ADMIN_EMAILS environment
 * variable — not the database. Parsed once at boot (trim, lowercase,
 * dedupe, ignore empties). There is no route, setting, or seed script
 * anywhere in this codebase that can grant the ADMIN role any other way;
 * this module is the only place that decides "is this email an admin."
 */
function parseAdminEmails(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0),
  );
}

export const adminEmails = parseAdminEmails(env.ADMIN_EMAILS);

export function isAdminEmail(email: string): boolean {
  return adminEmails.has(email.trim().toLowerCase());
}

/**
 * Admin role is re-derived from ADMIN_EMAILS every time it is needed, never
 * trusted from the JWT payload or the database. This is the whole point of the
 * env-var design: editing the Railway variable and redeploying revokes (or
 * grants) admin access on someone's very next request, with no session
 * revocation step needed.
 *
 * It lives here rather than inside authGuard because the idle timeout is
 * role-dependent, and the session-issuing routes need the same answer the
 * guard will give — a patient who happens to be listed in ADMIN_EMAILS must
 * get the staff timeout from the moment they sign in, not from their second
 * request onwards.
 */
export function effectiveRole(email: string, storedRole: UserRole): UserRole {
  if (isAdminEmail(email)) return 'ADMIN';
  return storedRole === 'CLINICIAN' ? 'CLINICIAN' : 'PATIENT';
}

// Fail loudly at startup, not silently at first request, if production is
// misconfigured — an empty admin list in production either means nobody
// can administer the practice's data, or (more likely) the variable was
// never set, which is worth stopping the boot for rather than discovering
// via a confused support ticket later.
export function assertAdminEmailsConfigured(): void {
  if (env.NODE_ENV === 'production' && adminEmails.size === 0) {
    throw new Error(
      'ADMIN_EMAILS is missing or empty in production. Set it (comma-separated list of admin emails) as a Railway environment variable before deploying — refusing to boot with no admin able to administer the practice.',
    );
  }
}
