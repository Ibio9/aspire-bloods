import { prisma } from '../../db/client.js';
import { recordAuditLog } from '../../lib/auditLog.js';
import { clinicBookingClient } from './clients/index.js';
import { isRandoxEnabled } from './config.js';
import { RandoxWindowExpiredError } from './errors.js';
import { RandoxOrderError, mustFindOrder, type WindowedResult } from './orderService.js';

/**
 * In-clinic appointment flow, in the documented order:
 *
 *   GetServiceLocations → AvailabilityDetails → HoldAvailabilityBooking
 *   → CreateRandoxBooking (carrying the Nexus Order Number as
 *     GPExternalNumber)
 *
 * The hold lasts 30 minutes. Everything after the hold is windowed: if the
 * patient dithers past the expiry, CreateRandoxBooking is refused and the
 * caller is told the slot has gone, rather than being shown an error.
 *
 * Only in-clinic orders come through here. Home-kit and mobile-phlebotomy
 * orders have no slot to book and never touch the Booking API.
 */

function assertEnabled(): void {
  if (!isRandoxEnabled()) {
    throw new RandoxOrderError('The Randox integration is switched off (RANDOX_ENABLED=false).', 503);
  }
}

export async function listServiceLocations() {
  assertEnabled();
  return clinicBookingClient().getServiceLocations();
}

/**
 * Slots come back in UTC and are passed on in UTC. Nothing in this module
 * converts to local time — that happens once, at render, where the
 * viewer's zone is actually known.
 */
export async function listAvailability(serviceLocationId: string, fromIsoDate: string, toIsoDate: string) {
  assertEnabled();
  return clinicBookingClient().availabilityDetails(serviceLocationId, fromIsoDate, toIsoDate);
}

/**
 * Holds a slot and records the hold against the order, so the 30-minute
 * expiry is visible to us rather than only known to Randox.
 */
export async function holdSlot(input: {
  orderNumber: string;
  serviceLocationId: string;
  serviceLocationName?: string | null;
  slotReference: string;
  startUtc: string;
  actorUserId: string | null;
}) {
  assertEnabled();
  const order = await mustFindOrder(input.orderNumber);

  if (order.collectionMethod !== 'IN_CLINIC') {
    throw new RandoxOrderError(
      `Order ${input.orderNumber} was placed for ${order.collectionMethod.toLowerCase().replace('_', ' ')} collection, which has no appointment to book.`,
      409,
    );
  }

  const hold = await clinicBookingClient().holdAvailabilityBooking(input.serviceLocationId, input.slotReference);

  const appointment = await prisma.randoxAppointment.upsert({
    where: { orderId: order.id },
    create: {
      orderId: order.id,
      serviceLocationId: input.serviceLocationId,
      serviceLocationName: input.serviceLocationName ?? null,
      holdReference: hold.holdReference,
      holdExpiresAt: new Date(hold.expiresAtUtc),
      startUtc: new Date(input.startUtc),
      status: 'HELD',
    },
    update: {
      serviceLocationId: input.serviceLocationId,
      serviceLocationName: input.serviceLocationName ?? null,
      holdReference: hold.holdReference,
      holdExpiresAt: new Date(hold.expiresAtUtc),
      startUtc: new Date(input.startUtc),
      status: 'HELD',
      cancelledAt: null,
    },
  });

  await recordAuditLog({
    actorUserId: input.actorUserId,
    action: 'RANDOX_SLOT_HELD',
    targetType: 'RandoxAppointment',
    targetId: appointment.id,
    metadata: {
      orderNumber: input.orderNumber,
      serviceLocationId: input.serviceLocationId,
      startUtc: input.startUtc,
      holdExpiresAt: hold.expiresAtUtc,
    },
  });

  return { appointment, holdExpiresAtUtc: hold.expiresAtUtc };
}

/**
 * Confirms the held slot. The Nexus Order Number goes across as
 * GPExternalNumber — that is what ties the appointment to the lab order.
 */
export async function confirmBooking(
  orderNumber: string,
  actorUserId: string | null,
): Promise<WindowedResult & { bookingReference?: string }> {
  assertEnabled();
  const order = await mustFindOrder(orderNumber);
  const appointment = await prisma.randoxAppointment.findUnique({ where: { orderId: order.id } });

  if (!appointment || !appointment.holdReference) {
    throw new RandoxOrderError(`Order ${orderNumber} has no held slot to confirm.`, 409);
  }
  if (appointment.status === 'BOOKED') {
    return { ok: true, windowExpired: false, message: 'Already booked.', bookingReference: appointment.bookingReference ?? undefined };
  }

  try {
    const booking = await clinicBookingClient().createRandoxBooking({
      holdReference: appointment.holdReference,
      serviceLocationId: appointment.serviceLocationId,
      gpExternalNumber: orderNumber,
      startUtc: appointment.startUtc.toISOString(),
    });

    await prisma.randoxAppointment.update({
      where: { id: appointment.id },
      data: {
        bookingReference: booking.bookingReference,
        startUtc: new Date(booking.startUtc),
        endUtc: booking.endUtc ? new Date(booking.endUtc) : null,
        status: 'BOOKED',
      },
    });

    await recordAuditLog({
      actorUserId,
      action: 'RANDOX_BOOKING_CONFIRMED',
      targetType: 'RandoxAppointment',
      targetId: appointment.id,
      metadata: { orderNumber, bookingReference: booking.bookingReference, startUtc: booking.startUtc },
    });

    return { ok: true, windowExpired: false, message: 'Appointment booked.', bookingReference: booking.bookingReference };
  } catch (e) {
    if (e instanceof RandoxWindowExpiredError) {
      // The hold lapsed. Mark it EXPIRED rather than leaving a HELD row
      // that looks live — the patient has to pick a slot again.
      await prisma.randoxAppointment.update({ where: { id: appointment.id }, data: { status: 'EXPIRED' } });
      await recordAuditLog({
        actorUserId,
        action: 'RANDOX_BOOKING_HOLD_EXPIRED',
        targetType: 'RandoxAppointment',
        targetId: appointment.id,
        metadata: { orderNumber, message: e.message },
      });
      return {
        ok: false,
        windowExpired: true,
        message: 'That slot is no longer being held for you. Please choose another time.',
      };
    }
    throw e;
  }
}

/** CancelRandoxBooking. Windowed. Does not cancel the lab order itself. */
export async function cancelBooking(orderNumber: string, actorUserId: string | null): Promise<WindowedResult> {
  assertEnabled();
  const order = await mustFindOrder(orderNumber);
  const appointment = await prisma.randoxAppointment.findUnique({ where: { orderId: order.id } });

  if (!appointment?.bookingReference) {
    throw new RandoxOrderError(`Order ${orderNumber} has no confirmed appointment to cancel.`, 409);
  }

  try {
    await clinicBookingClient().cancelRandoxBooking(appointment.bookingReference, orderNumber);
  } catch (e) {
    if (e instanceof RandoxWindowExpiredError) {
      await recordAuditLog({
        actorUserId,
        action: 'RANDOX_BOOKING_CANCEL_WINDOW_EXPIRED',
        targetType: 'RandoxAppointment',
        targetId: appointment.id,
        metadata: { orderNumber, message: e.message },
      });
      return { ok: false, windowExpired: true, message: e.message };
    }
    throw e;
  }

  await prisma.randoxAppointment.update({
    where: { id: appointment.id },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  });

  await recordAuditLog({
    actorUserId,
    action: 'RANDOX_BOOKING_CANCELLED',
    targetType: 'RandoxAppointment',
    targetId: appointment.id,
    metadata: { orderNumber, bookingReference: appointment.bookingReference },
  });

  return { ok: true, windowExpired: false, message: 'Appointment cancelled.' };
}

/** RescheduleAppointment. Windowed. */
export async function rescheduleBooking(
  orderNumber: string,
  newSlotReference: string,
  newStartUtc: string,
  actorUserId: string | null,
): Promise<WindowedResult> {
  assertEnabled();
  const order = await mustFindOrder(orderNumber);
  const appointment = await prisma.randoxAppointment.findUnique({ where: { orderId: order.id } });

  if (!appointment?.bookingReference) {
    throw new RandoxOrderError(`Order ${orderNumber} has no confirmed appointment to reschedule.`, 409);
  }

  try {
    const updated = await clinicBookingClient().rescheduleAppointment(
      appointment.bookingReference,
      orderNumber,
      newSlotReference,
      newStartUtc,
    );

    await prisma.randoxAppointment.update({
      where: { id: appointment.id },
      data: {
        bookingReference: updated.bookingReference,
        startUtc: new Date(updated.startUtc),
        endUtc: updated.endUtc ? new Date(updated.endUtc) : null,
        status: 'BOOKED',
      },
    });

    await recordAuditLog({
      actorUserId,
      action: 'RANDOX_BOOKING_RESCHEDULED',
      targetType: 'RandoxAppointment',
      targetId: appointment.id,
      metadata: { orderNumber, from: appointment.startUtc.toISOString(), to: updated.startUtc },
    });

    return { ok: true, windowExpired: false, message: 'Appointment moved.' };
  } catch (e) {
    if (e instanceof RandoxWindowExpiredError) {
      await recordAuditLog({
        actorUserId,
        action: 'RANDOX_BOOKING_RESCHEDULE_WINDOW_EXPIRED',
        targetType: 'RandoxAppointment',
        targetId: appointment.id,
        metadata: { orderNumber, message: e.message },
      });
      return { ok: false, windowExpired: true, message: e.message };
    }
    throw e;
  }
}
