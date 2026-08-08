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

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
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

  if (!res.ok) {
    throw new ApiError(extractErrorMessage(body), res.status, body);
  }

  return body as T;
}
