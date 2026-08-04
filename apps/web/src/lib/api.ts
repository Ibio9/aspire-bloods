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

/**
 * Route error bodies come in two shapes: a plain `{ error: "message" }` from
 * our own AuthError/ReportError classes, or `{ error: zodError.flatten() }`
 * from schema validation — which nests the useful message inside
 * fieldErrors, not formErrors (formErrors is usually empty for per-field
 * validation failures). Missing that nesting was silently downgrading every
 * validation error to a generic "Something went wrong".
 */
function extractErrorMessage(body: unknown): string {
  const error = (body as { error?: unknown } | null)?.error;
  if (typeof error === 'string') return error;
  if (isFlattenedZodError(error)) {
    if (error.formErrors?.[0]) return error.formErrors[0];
    const firstFieldError = Object.values(error.fieldErrors ?? {}).find((msgs) => msgs && msgs.length > 0);
    if (firstFieldError?.[0]) return firstFieldError[0];
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
