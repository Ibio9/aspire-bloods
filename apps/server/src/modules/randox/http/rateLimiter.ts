/**
 * Outbound rate limiting, one limiter per Randox API.
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
 * In-process, which matches the single-service Railway deployment this runs
 * on. More than one API replica would need this in Postgres alongside the
 * poll lock — noted rather than built, because that is a deployment
 * decision.
 */
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
