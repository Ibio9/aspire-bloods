import type { RandoxOrder } from '@prisma/client';
import { prisma } from '../../db/client.js';
import { env } from '../../config/env.js';
import { nexusLabClient } from './clients/index.js';
import { isRandoxEnabled } from './config.js';
import { orderStatusFromCode } from './types.js';
import { ingestOrderResults } from './ingestionService.js';
import { orderRefOf } from './orderService.js';

/**
 * Randox ask for one poll per outstanding order per hour, staggered by
 * order creation time so a clinic's orders don't all fire at :00.
 *
 * The design constraint that matters more than the schedule: this file is
 * a TRIGGER, and it is the only thing that knows polling exists. It
 * decides *when* to look at an order and then calls
 * onOrderStatusChanged() — which does the work. Randox say webhooks are
 * coming; when they arrive, the webhook route calls that same function
 * with the order number from the callback and this file is deleted. No
 * ingestion, mapping, code-handling or storage logic lives here, precisely
 * so that deletion is safe.
 */

/** Orders that can still produce something. Anything else stops polling. */
const OUTSTANDING_STATUSES = ['INCOMPLETE', 'SUBMITTED', 'PENDING_RESULTS'] as const;

/**
 * Spreads an order's polls across the hour by its creation minute, so two
 * hundred orders created in a morning clinic don't all hit Randox in the
 * same tick. An order created at 09:47 is polled at 10:47, 11:47, …
 */
export function scheduleFirstPoll(createdAt: Date): Date {
  const intervalMs = env.RANDOX_POLL_INTERVAL_MINUTES * 60_000;
  return new Date(createdAt.getTime() + intervalMs);
}

/**
 * Next poll time after a successful check: one interval on from the
 * order's own creation offset, never from "now" — polling from now would
 * let repeated slow responses drift every order onto the same schedule,
 * which is the clustering the stagger exists to avoid.
 */
function nextScheduledPoll(order: RandoxOrder, now: Date): Date {
  const intervalMs = env.RANDOX_POLL_INTERVAL_MINUTES * 60_000;
  const elapsed = now.getTime() - order.createdAt.getTime();
  const periods = Math.floor(elapsed / intervalMs) + 1;
  return new Date(order.createdAt.getTime() + periods * intervalMs);
}

/**
 * Exponential backoff on consecutive failures, capped. A Randox outage
 * shouldn't turn into a poll storm the moment they come back, and an order
 * that has failed a dozen times in a row is a problem for an admin, not
 * something to keep retrying at full rate.
 */
function backoffPoll(consecutiveFailures: number, now: Date): Date {
  const baseMs = env.RANDOX_POLL_INTERVAL_MINUTES * 60_000;
  const factor = Math.min(2 ** Math.max(consecutiveFailures - 1, 0), 8);
  return new Date(now.getTime() + baseMs * factor);
}

export interface OrderUpdateResult {
  orderNumber: string;
  statusCode: number | null;
  ingested: boolean;
  message: string;
}

/**
 * Reconciles one order with Randox and ingests its results if they're
 * ready. THIS is the webhook seam — a future webhook handler calls this
 * and nothing else.
 *
 * Safe to call repeatedly for the same order: ingestion is idempotent on
 * the Order Number.
 */
export async function onOrderStatusChanged(orderNumber: string): Promise<OrderUpdateResult> {
  const order = await prisma.randoxOrder.findUnique({ where: { orderNumber } });
  if (!order) {
    return { orderNumber, statusCode: null, ingested: false, message: `No local record of order ${orderNumber}.` };
  }

  const now = new Date();

  // GetOrderStatus wants both identifiers. An order missing the numeric one
  // cannot be polled at all, so it is stalled explicitly rather than
  // failing on every sweep forever.
  if (order.randoxOrderId === null) {
    await prisma.randoxOrder.update({
      where: { id: order.id },
      data: { nextPollAt: null, lastPollError: 'No Randox numeric order id recorded, so GetOrderStatus cannot be called.' },
    });
    return {
      orderNumber,
      statusCode: null,
      ingested: false,
      message: `Order ${orderNumber} has no Randox order id recorded, so it cannot be polled.`,
    };
  }

  const status = await nexusLabClient().getOrderStatus({ orderId: order.randoxOrderId, orderNumber });
  const statusName = orderStatusFromCode(status.statusId);

  if (!statusName) {
    // An unrecognised status code is never coerced into a known one. The
    // order keeps its previous status, the raw code is recorded, and it
    // stays in the polling rotation.
    console.warn(
      `[randox] order ${orderNumber} returned unrecognised status code ${status.statusId} ("${status.statusDescription ?? 'no description'}") — status left unchanged.`,
    );
    await prisma.randoxOrder.update({
      where: { id: order.id },
      data: {
        rawStatusCode: status.statusId,
        lastPolledAt: now,
        pollAttempts: { increment: 1 },
        nextPollAt: nextScheduledPoll(order, now),
        lastPollError: `Unrecognised status code ${status.statusId}`,
      },
    });
    await prisma.ingestionLogEntry.create({
      data: {
        sourceKey: 'randox_api',
        externalId: orderNumber,
        outcome: 'FAILED',
        message: `Randox returned an unrecognised order status code (${status.statusId}). The order was left on its previous status rather than guessed at.`,
      },
    });
    return {
      orderNumber,
      statusCode: status.statusId,
      ingested: false,
      message: `Unrecognised status code ${status.statusId}.`,
    };
  }

  // Status 5. Either we cancelled it, or every result was voided. Stop
  // polling either way — nothing further will arrive.
  if (statusName === 'CANCELLED') {
    await prisma.randoxOrder.update({
      where: { id: order.id },
      data: {
        status: 'CANCELLED',
        rawStatusCode: status.statusId,
        cancelledAt: order.cancelledAt ?? now,
        cancelReason: order.cancelReason ?? (status.statusDescription ?? 'Cancelled by the laboratory.'),
        lastPolledAt: now,
        pollAttempts: { increment: 1 },
        consecutiveFailures: 0,
        lastPollError: null,
        nextPollAt: null,
      },
    });
    return { orderNumber, statusCode: status.statusId, ingested: false, message: 'Order cancelled. Polling stopped.' };
  }

  if (statusName !== 'COMPLETE') {
    await prisma.randoxOrder.update({
      where: { id: order.id },
      data: {
        status: statusName,
        rawStatusCode: status.statusId,
        lastPolledAt: now,
        pollAttempts: { increment: 1 },
        consecutiveFailures: 0,
        lastPollError: null,
        nextPollAt: nextScheduledPoll(order, now),
      },
    });
    return {
      orderNumber,
      statusCode: status.statusId,
      ingested: false,
      message: `Order is ${statusName.toLowerCase().replace(/_/g, ' ')}.`,
    };
  }

  const result = await ingestOrderResults(orderRefOf(order));

  // A partial delivery keeps polling: more markers are still coming. A
  // complete one stops. An unmatched patient keeps polling too — the
  // account may be created shortly and the results are already at Randox.
  const keepPolling = result.outcome === 'PARTIAL' || result.outcome === 'UNMATCHED_PATIENT';

  await prisma.randoxOrder.update({
    where: { id: order.id },
    data: {
      status: result.outcome === 'ALL_VOIDED' ? 'CANCELLED' : 'COMPLETE',
      rawStatusCode: status.statusId,
      completedAt: order.completedAt ?? now,
      lastPolledAt: now,
      pollAttempts: { increment: 1 },
      consecutiveFailures: 0,
      lastPollError: null,
      nextPollAt: keepPolling ? nextScheduledPoll(order, now) : null,
    },
  });

  return {
    orderNumber,
    statusCode: status.statusId,
    ingested: result.outcome === 'INGESTED' || result.outcome === 'PARTIAL',
    message: result.message,
  };
}

/**
 * The sweep. Picks up orders whose stagger says they're due, in batches,
 * and reconciles each one independently — one bad order never blocks the
 * rest of the run.
 */
export async function runRandoxPollingSweep(): Promise<{ polled: number; ingested: number; failed: number }> {
  if (!isRandoxEnabled()) return { polled: 0, ingested: 0, failed: 0 };

  const now = new Date();
  const due = await prisma.randoxOrder.findMany({
    where: {
      status: { in: [...OUTSTANDING_STATUSES] },
      nextPollAt: { not: null, lte: now },
      consecutiveFailures: { lt: env.RANDOX_POLL_MAX_FAILURES },
    },
    orderBy: { nextPollAt: 'asc' },
    take: env.RANDOX_POLL_BATCH_SIZE,
  });

  let ingested = 0;
  let failed = 0;

  for (const order of due) {
    try {
      const result = await onOrderStatusChanged(order.orderNumber);
      if (result.ingested) ingested += 1;
    } catch (e) {
      failed += 1;
      const consecutiveFailures = order.consecutiveFailures + 1;
      const message = e instanceof Error ? e.message : 'unknown error';
      console.error(`[randox] polling order ${order.orderNumber} failed (${consecutiveFailures} in a row):`, e);

      const givingUp = consecutiveFailures >= env.RANDOX_POLL_MAX_FAILURES;
      await prisma.randoxOrder.update({
        where: { id: order.id },
        data: {
          lastPolledAt: now,
          pollAttempts: { increment: 1 },
          consecutiveFailures,
          lastPollError: message.slice(0, 500),
          // Stops polling but leaves the order outstanding, so it shows up
          // in the admin view as needing attention rather than vanishing.
          nextPollAt: givingUp ? null : backoffPoll(consecutiveFailures, now),
        },
      });

      await prisma.ingestionLogEntry
        .create({
          data: {
            sourceKey: 'randox_api',
            externalId: order.orderNumber,
            outcome: 'FAILED',
            message: givingUp
              ? `Polling gave up on order ${order.orderNumber} after ${consecutiveFailures} consecutive failures. Last error: ${message}. This order needs an admin to look at it. It will not be retried automatically.`
              : `Poll of order ${order.orderNumber} failed (${consecutiveFailures} in a row): ${message}`,
          },
        })
        .catch(() => {});
    }
  }

  return { polled: due.length, ingested, failed };
}

/** Cron entry point. Never throws — a bad sweep must not kill the scheduler. */
export async function runRandoxPollingJob(): Promise<void> {
  try {
    const summary = await runRandoxPollingSweep();
    if (summary.polled > 0) {
      console.log(
        `[randox] polling sweep: ${summary.polled} order(s) due, ${summary.ingested} ingested, ${summary.failed} failed.`,
      );
    }
  } catch (e) {
    console.error('[randox] polling sweep failed:', e);
  }
}
