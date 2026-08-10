import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/db/client.js', () => ({ prisma: {} }));

// isRandoxEnabled() gates the sweep; forced on so the re-entrancy tests below
// exercise the real body rather than its disabled early return.
const findMany = vi.fn();
vi.mock('../src/modules/randox/config.js', () => ({
  isRandoxEnabled: () => true,
  assertRandoxConfigured: () => undefined,
}));

const { scheduleFirstPoll, runRandoxPollingJob } = await import('../src/modules/randox/pollingJob.js');
const { prisma } = await import('../src/db/client.js');

/**
 * Randox ask for one poll per outstanding order per hour, staggered by
 * order creation time so a clinic's morning orders don't all fire in the
 * same tick. The stagger is the whole point — a schedule anchored to "now"
 * would let every order drift onto the same minute.
 */
describe('poll scheduling', () => {
  it('schedules the first poll one interval after the order was created', () => {
    const createdAt = new Date('2026-08-06T09:47:00.000Z');
    expect(scheduleFirstPoll(createdAt).toISOString()).toBe('2026-08-06T10:47:00.000Z');
  });

  it('keeps each order on its own offset within the hour', () => {
    const a = scheduleFirstPoll(new Date('2026-08-06T09:03:00.000Z'));
    const b = scheduleFirstPoll(new Date('2026-08-06T09:47:00.000Z'));
    expect(a.getUTCMinutes()).toBe(3);
    expect(b.getUTCMinutes()).toBe(47);
    expect(a.getTime()).not.toBe(b.getTime());
  });
});

/**
 * A sweep polls its batch one order at a time against a third-party API, so
 * it can outrun the cron interval that started it. An order's nextPollAt only
 * moves forward AFTER its poll returns, so a second sweep starting mid-flight
 * selects the same orders and polls them again — which is exactly the thing
 * Randox's "one poll per outstanding order per hour" asks us not to do.
 */
describe('sweep re-entrancy', () => {
  beforeEach(() => {
    findMany.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma as any).randoxOrder = { findMany };
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips a tick that fires while the previous sweep is still running', async () => {
    let release: () => void = () => undefined;
    findMany.mockImplementationOnce(
      () => new Promise((resolve) => { release = () => resolve([]); }),
    );

    const first = runRandoxPollingJob();
    // Second tick lands mid-flight and must not start a second selection.
    await runRandoxPollingJob();
    expect(findMany).toHaveBeenCalledTimes(1);

    release();
    await first;
  });

  it('releases the guard after a sweep that throws, not just a clean one', async () => {
    findMany.mockRejectedValueOnce(new Error('database unavailable'));
    await runRandoxPollingJob();

    // A guard left set by a failed sweep would stop polling for the lifetime
    // of the process — silently, since the job never throws.
    findMany.mockResolvedValueOnce([]);
    await runRandoxPollingJob();
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});
