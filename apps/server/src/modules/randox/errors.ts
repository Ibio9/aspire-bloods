/** Any non-2xx from either Randox API, with the body kept for the log. */
export class RandoxApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly endpoint: string,
    readonly body: string | null = null,
  ) {
    super(message);
    this.name = 'RandoxApiError';
  }
}

/** Token acquisition failed — distinct from a call failing with a token. */
export class RandoxAuthError extends Error {
  constructor(
    message: string,
    readonly api: string,
  ) {
    super(message);
    this.name = 'RandoxAuthError';
  }
}

/**
 * Amend, cancel, reschedule and hold-confirm all have limited windows.
 * Randox rejecting one because the window has passed is an expected
 * outcome of a race, not a fault: the caller surfaces it to the user as
 * "too late to change this" and carries on. Callers must never retry it.
 */
export class RandoxWindowExpiredError extends Error {
  constructor(
    readonly operation: string,
    readonly orderNumber: string,
    message: string,
  ) {
    super(message);
    this.name = 'RandoxWindowExpiredError';
  }
}

/**
 * Whether a failed response is Randox saying "that window has closed"
 * rather than a real error. There is no documented error-code list, so
 * this matches on HTTP status plus body wording — deliberately broad, and
 * the raw body is preserved on the thrown error either way. Narrow this to
 * the real error codes once the specs are available.
 */
export function looksLikeWindowExpired(status: number, body: string | null): boolean {
  if (status !== 400 && status !== 409 && status !== 410 && status !== 422) return false;
  if (!body) return status === 409 || status === 410;
  return /expire|elapsed|no longer|too late|window|not permitted at this stage|already (submitted|processed|dispatched|collected)/i.test(
    body,
  );
}
