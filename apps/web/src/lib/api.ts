import { IDLE_TIMEOUT_ERROR_CODE } from '@aspire-bloods/shared';
import { API_BASE_URL } from './apiBase';

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

interface FlattenedZodError {
  formErrors?: string[];
  fieldErrors?: Record<string, string[] | undefined>;
}

function isFlattenedZodError(value: unknown): value is FlattenedZodError {
  return !!value && typeof value === 'object' && ('formErrors' in value || 'fieldErrors' in value);
}

// Zod field keys are the raw schema property name (camelCase, often "xId" for a
// foreign key) — not something to show a user verbatim. "panelId" reads as a field
// name; "Panel" reads as a label. Strips a trailing "Id" and splits camelCase into
// words rather than maintaining a per-endpoint label map, which would drift out of
// sync with the schemas the moment a new field is added.
function humanizeFieldName(key: string): string {
  const words = key.replace(/Id$/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Route error bodies come in two shapes: a plain `{ error: "message" }` from
 * our own AuthError/ReportError classes, or `{ error: zodError.flatten() }`
 * from schema validation — which nests the useful message inside
 * fieldErrors, not formErrors (formErrors is usually empty for per-field
 * validation failures). Missing that nesting was silently downgrading every
 * validation error to a generic "Something went wrong". Field-level messages
 * are prefixed with a humanized field name ("Panel: Required") — the bare
 * message alone ("Required") doesn't say what's required when a form has
 * several fields and only one throws.
 */
export function extractErrorMessage(body: unknown): string {
  const error = (body as { error?: unknown } | null)?.error;
  if (typeof error === 'string') return error;
  if (isFlattenedZodError(error)) {
    if (error.formErrors?.[0]) return error.formErrors[0];
    const firstField = Object.entries(error.fieldErrors ?? {}).find(([, msgs]) => msgs && msgs.length > 0);
    if (firstField) {
      const [key, msgs] = firstField;
      return `${humanizeFieldName(key)}: ${msgs![0]}`;
    }
  }
  return 'Something went wrong';
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

/**
 * Whether a rejection is specifically "you went idle", rather than any of the
 * other reasons a session ends. The sign-in screen shows a different line for
 * each, so this is what keeps the inactivity message truthful — the server
 * tags the 401 with IDLE_TIMEOUT_ERROR_CODE (see middleware/authGuard.ts).
 */
export function isIdleTimeoutError(e: unknown): boolean {
  if (!(e instanceof ApiError) || e.status !== 401) return false;
  return (e.details as { code?: string } | null)?.code === IDLE_TIMEOUT_ERROR_CODE;
}

/**
 * ===========================================================================
 *  AN EXPIRED ACCESS TOKEN IS NOT A REASON TO SIGN ANYBODY OUT.
 * ===========================================================================
 *
 * The access token lives 15 minutes. The session lives 90 (a patient) and is
 * governed by the idle deadline, which is a different mechanism with a
 * different clock. Keeping the first alive is bookkeeping — the reader has no
 * idea it exists and nothing about their session should depend on a background
 * timer having fired on time.
 *
 * It depended on exactly that until Aug 2026, and a patient was signed out
 * fifteen minutes into an ordinary session because the timer had been silently
 * restarted on every route change (see SessionGuard.tsx). Fixing the timer was
 * necessary and is not sufficient: a timer is a thing that can be missed, and
 * anything that misses it — a backgrounded tab, a suspended laptop, a reload,
 * a slow network eating the one attempt — must not cost somebody their session
 * mid-read.
 *
 * So a 401 that is NOT an idle timeout buys ONE silent rotation and ONE retry.
 * After that it is a real 401 and the caller sees it.
 *
 *  · THE IDLE 401 IS NEVER RETRIED. It carries IDLE_TIMEOUT_ERROR_CODE and it
 *    is the server saying the session is over — retrying it would be the client
 *    trying to talk it out of a timeout.
 *  · THE REFRESH ITSELF IS NEVER RETRIED, or a dead refresh token would loop.
 *  · ONE REFRESH AT A TIME, shared. A page mid-load can have six requests in
 *    flight when the token lapses; six rotations would revoke each other and
 *    five would come back 401, turning a recoverable moment into a sign-out.
 *    They wait on the same promise instead.
 */
let rotating: Promise<boolean> | null = null;

/** Rotates the access token, at most once at a time. Resolves false if it could not. */
async function rotateOnce(): Promise<boolean> {
  rotating ??= (async () => {
    try {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      const csrfToken = readCookie('csrf_token');
      if (csrfToken) headers.set('X-CSRF-Token', csrfToken);
      const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers,
        credentials: 'include',
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      /**
       * CLEARED SYNCHRONOUSLY, and the window that matters is exactly "while
       * the request is in flight". Everything that lapsed together is already
       * awaiting this promise and still gets its answer; anything that lapses
       * AFTERWARDS needs a rotation of its own, because the token it is
       * complaining about is the one this call issued.
       *
       * It was cleared on a timer for one revision and that is a stale-answer
       * bug wearing a tidy hat: a later 401 could be handed a `true` from a
       * rotation that had already finished, skip its own, and retry against the
       * same dead token.
       */
      rotating = null;
    }
  })();
  return rotating;
}

/** Paths that must never trigger a rotation-and-retry of their own. */
const NEVER_RETRIED = ['/auth/refresh', '/auth/login', '/auth/logout', '/auth/otp/verify'];

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const send = async () => {
    const method = (options.method ?? 'GET').toUpperCase();
    const headers = new Headers(options.headers);
    headers.set('Content-Type', 'application/json');

    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      // Read per attempt, not once: a rotation issues a NEW csrf token, and a
      // retry carrying the old one would fail CSRF instead of succeeding.
      const csrfToken = readCookie('csrf_token');
      if (csrfToken) headers.set('X-CSRF-Token', csrfToken);
    }

    const res = await fetch(`${API_BASE_URL}/api${path}`, {
      ...options,
      method,
      headers,
      credentials: 'include',
    });
    const body = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
    return { res, body };
  };

  let { res, body } = await send();

  if (
    res.status === 401 &&
    (body as { code?: string } | null)?.code !== IDLE_TIMEOUT_ERROR_CODE &&
    !NEVER_RETRIED.some((p) => path.startsWith(p))
  ) {
    if (await rotateOnce()) ({ res, body } = await send());
  }

  if (!res.ok) {
    throw new ApiError(extractErrorMessage(body), res.status, body);
  }

  return body as T;
}
