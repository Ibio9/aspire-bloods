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
