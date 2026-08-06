/**
 * Where to send someone once they've finished signing in.
 *
 * Two things need this and neither can hold it in React state:
 *  - a deep link opened while signed out ("here's the report" in an email) —
 *    the guard redirects to /login, and afterwards they should land on the
 *    thing they clicked, not the home page;
 *  - a session that expires mid-task — signing back in should return them
 *    where they were rather than to the top of the app.
 *
 * sessionStorage rather than router state because sign-in is not one
 * navigation: it survives the login → 2FA step change, a manual page reload
 * on the login screen, and the full remount that follows authentication.
 * Scoped to the tab and cleared the moment it's consumed.
 */
const KEY = 'aspire_post_login_redirect';

/** Never send anyone back to an auth screen — that's a loop, not a destination. */
const NEVER_RETURN_TO = ['/login', '/signup', '/activate'];

function isSafeInternalPath(path: string): boolean {
  // Must be a path on this origin. Rejects "//evil.com" and "https://evil.com"
  // so a crafted ?next= style value can never turn sign-in into an open redirect.
  if (!path.startsWith('/') || path.startsWith('//')) return false;
  return !NEVER_RETURN_TO.some((prefix) => path === prefix || path.startsWith(`${prefix}?`) || path.startsWith(`${prefix}/`));
}

export function rememberRedirect(path: string): void {
  if (!isSafeInternalPath(path)) return;
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    /* private mode / storage disabled — sign-in still works, it just lands on home */
  }
}

/** Reads and clears in one step: a stale destination must never be reused on a later sign-in. */
export function consumeRedirect(): string | null {
  try {
    const value = sessionStorage.getItem(KEY);
    if (value) sessionStorage.removeItem(KEY);
    return value && isSafeInternalPath(value) ? value : null;
  } catch {
    return null;
  }
}

export function clearRedirect(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
