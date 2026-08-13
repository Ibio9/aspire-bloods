/**
 * Outbound rate limiting, ONE LIMITER PER RANDOX API.
 *
 * Randox's gateway is an Azure API Management instance and APIM's standard
 * response to too many calls is a 429 with a Retry-After — which the HTTP
 * client does handle, but handling it is recovery, not politeness. A poll
 * sweep with a batch of twenty-five orders makes fifty-plus calls in a tight
 * loop with nothing between them; spacing those out is the difference
 * between a well-behaved integration and one that discovers the ceiling by
 * hitting it every hour.
 *
 * Deliberately a plain minimum-interval gate rather than a token bucket: a
 * bucket lets a burst through and then stalls, which is exactly the shape
 * that trips a gateway limiter. A fixed floor between requests spreads the
 * same total across the same window with no burst at the front.
 *
 * ---------------------------------------------------------------------------
 * THE DOCUMENTED LIMIT IS 600 A MINUTE, IT IS PER API, AND IT IS A CEILING.
 * ---------------------------------------------------------------------------
 *
 * Chris Caulfield, Aug 2026: 600 requests per minute, per API. Three things
 * follow and all three are structural here rather than conventional:
 *
 *  1. PER API MEANS PER API. Nexus and Clinic Booking each get the full 600
 *     and neither spends the other's. A single shared limiter would halve
 *     both budgets to be safe about neither, and a burst of booking traffic
 *     would slow the poll sweep for no reason at all.
 *  2. THE LIMITER IS KEYED ON THE CONNECTION, NOT OWNED BY THE CLIENT. It used
 *     to be constructed inside each RandoxHttpClient, so "one per API" held
 *     only because clients/index.ts happens to cache one client per API — a
 *     second `new LiveNexusLabClient()` anywhere (a script, a test, a future
 *     refactor) silently doubled the outbound rate with nothing to notice it.
 *     `limiterFor()` makes it a property of the API instead.
 *  3. A CEILING IS NOT A TARGET. RANDOX_MAX_REQUESTS_PER_MINUTE is 60 — a
 *     tenth of what we are allowed — because 600 is the figure at which
 *     Randox START REFUSING, and pacing at the refusal threshold means every
 *     ordinary burst discovers it. `assertWithinDocumentedLimit` refuses a
 *     configured value ABOVE the ceiling at boot rather than letting a
 *     well-meaning "we can go faster" edit find out from a 429 storm.
 *
 * In-process, which matches the single-service Railway deployment this runs
 * on. More than one API replica would need this in Postgres alongside the
 * poll lock — noted rather than built, because that is a deployment
 * decision, and worth restating now there is a documented number to divide:
 * two replicas at 60 each is 120 against a 600 ceiling, which is still
 * comfortable; twenty would not be.
 */

/**
 * Randox's documented per-API limit. A constant rather than an env var: it is
 * a fact about their gateway, not a decision of ours, and a deployment that
 * could raise it would be a deployment that could lie about it.
 */
export const RANDOX_DOCUMENTED_LIMIT_PER_MINUTE = 600;

/**
 * Refuses a configured pace above the documented ceiling. Called from the
 * Randox boot check, so the message names the variable and both numbers.
 */
export function assertWithinDocumentedLimit(requestsPerMinute: number): void {
  if (requestsPerMinute > RANDOX_DOCUMENTED_LIMIT_PER_MINUTE) {
    throw new Error(
      `RANDOX_MAX_REQUESTS_PER_MINUTE is ${requestsPerMinute}, above Randox's documented limit of ` +
        `${RANDOX_DOCUMENTED_LIMIT_PER_MINUTE} requests per minute per API. That is the rate at which they start ` +
        'answering 429, so pacing at or above it guarantees hitting it. Leave headroom — the default is 60.',
    );
  }
}

/**
 * The limiter for one Randox API, keyed on the connection label.
 *
 * Every client for a given API shares one, so the pacing is a property of the
 * API rather than of however many client objects happen to exist.
 */
const limiters = new Map<string, RequestRateLimiter>();

export function limiterFor(apiLabel: string, requestsPerMinute: number): RequestRateLimiter {
  let limiter = limiters.get(apiLabel);
  if (!limiter) {
    limiter = new RequestRateLimiter(requestsPerMinute);
    limiters.set(apiLabel, limiter);
  }
  return limiter;
}

/** Tests only — a suite that changes the pace needs the old limiter gone. */
export function __resetLimitersForTest(): void {
  limiters.clear();
}
export class RequestRateLimiter {
  /** When the next request may be issued. Epoch ms. */
  private nextSlotAt = 0;

  /** Serialises the slot arithmetic so two callers can't claim the same one. */
  private queue: Promise<void> = Promise.resolve();

  private readonly minIntervalMs: number;

  constructor(requestsPerMinute: number) {
    // Zero or negative disables it outright — a deployment that wants no
    // client-side pacing says so with a number, not by editing this file.
    this.minIntervalMs = requestsPerMinute > 0 ? Math.ceil(60_000 / requestsPerMinute) : 0;
  }

  /**
   * Resolves when the caller may issue its request. Never rejects: a limiter
   * that can fail is a new way for a poll to lose an order.
   */
  async acquire(): Promise<void> {
    // Pacing off AND nothing owed. Note the second half: a gateway that has
    // told us to back off is obeyed whether or not we chose to pace
    // ourselves, because that instruction is theirs and not ours.
    if (this.minIntervalMs === 0 && this.nextSlotAt <= Date.now()) return;

    const wait = (this.queue = this.queue.then(async () => {
      const now = Date.now();
      const at = Math.max(now, this.nextSlotAt);
      this.nextSlotAt = at + this.minIntervalMs;
      const delay = at - now;
      if (delay > 0) await sleep(delay);
    }));

    return wait;
  }

  /**
   * Pushes every queued caller back by `ms`. Called when Randox answer 429
   * with a Retry-After: the whole connection has been told to wait, not just
   * the one request that happened to be unlucky.
   */
  backOff(ms: number): void {
    if (ms <= 0) return;
    this.nextSlotAt = Math.max(this.nextSlotAt, Date.now() + ms);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
