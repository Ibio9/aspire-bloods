import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/db/client.js', () => ({ prisma: {} }));

const { scheduleFirstPoll } = await import('../src/modules/randox/pollingJob.js');

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
