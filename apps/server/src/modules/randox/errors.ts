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
 * An operation this integration cannot perform because Randox document no
 * endpoint for it.
 *
 * Distinct from every other error here, and the distinction is the point: an
 * API error means we asked and were refused, and this means THERE IS NOTHING
 * TO ASK.
 *
 * NOTHING THROWS IT AT PRESENT (Aug 2026), and it is kept rather than deleted.
 * It existed for RescheduleAppointment, which has now been through all three
 * states in endpoints.ts — believed fictional, then named with no request
 * shape, and now fully specified in clinic-booking-openapi3.json — so the
 * client calls it instead of refusing. The class stays because the SITUATION
 * recurs on these two APIs: `GetOrderStatusDetails` is named in a Randox PDF
 * and absent from the Nexus spec today, and the next endpoint somebody
 * half-remembers will need exactly this. Calling a path on the strength of
 * remembering it once is how an integration acquires a feature that 404s in
 * production and works in every test.
 *
 * Surfaced as 501 rather than 500: the request was well-formed and the server
 * cannot do it.
 */
export class RandoxUnsupportedOperationError extends Error {
  constructor(
    readonly operation: string,
    message: string,
  ) {
    super(message);
    this.name = 'RandoxUnsupportedOperationError';
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
