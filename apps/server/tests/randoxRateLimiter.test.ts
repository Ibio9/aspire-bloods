import { describe, it, expect } from 'vitest';
import { RequestRateLimiter } from '../src/modules/randox/http/rateLimiter.js';

/**
 * Outbound pacing on the Randox APIs.
 *
 * A poll sweep makes two or three calls per order in a loop with nothing
 * between them, which is the shape that finds an Azure APIM limiter. These
 * are wall-clock assertions deliberately: the property under test is elapsed
 * time, and a fake timer would only prove the arithmetic, which was never in
 * doubt. Kept to a few hundred milliseconds so the suite stays fast.
 */
describe('RequestRateLimiter', () => {
  it('spaces requests by the minimum interval', async () => {
    // 600 per minute → 100ms apart.
    const limiter = new RequestRateLimiter(600);
    const started = Date.now();

    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();

    // Three slots: the first is immediate, so two intervals have elapsed.
    // The lower bound is deliberately slack — a timer that fires a
    // millisecond early is a timer, not a bug.
    expect(Date.now() - started).toBeGreaterThanOrEqual(180);
  });

  it('does not burst when several callers arrive at once', async () => {
    const limiter = new RequestRateLimiter(600);
    const started = Date.now();

    // The realistic case: a sweep firing its whole batch in one tick. A token
    // bucket would let these all through and then stall, which is exactly the
    // shape a gateway limiter punishes.
    await Promise.all([limiter.acquire(), limiter.acquire(), limiter.acquire()]);

    expect(Date.now() - started).toBeGreaterThanOrEqual(180);
  });

  it('is off entirely when configured to zero', async () => {
    const limiter = new RequestRateLimiter(0);
    const started = Date.now();
    for (let i = 0; i < 20; i += 1) await limiter.acquire();
    expect(Date.now() - started).toBeLessThan(50);
  });

  it('obeys a gateway back-off even with our own pacing switched off', async () => {
    // A 429 with a Retry-After is aimed at the connection, not at the one
    // request that happened to be unlucky. Being told to wait and then
    // letting nine queued calls straight through is not waiting — and a
    // deployment choosing not to pace itself is not a decision that
    // overrules Randox telling us to stop.
    const limiter = new RequestRateLimiter(0);
    limiter.backOff(150);

    const started = Date.now();
    await limiter.acquire();
    expect(Date.now() - started).toBeGreaterThanOrEqual(130);

    // And once the back-off has elapsed it is out of the way again.
    const after = Date.now();
    await limiter.acquire();
    expect(Date.now() - after).toBeLessThan(50);
  });
});
