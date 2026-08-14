import { prisma } from '../../db/client.js';
import { recordAuditLog } from '../../lib/auditLog.js';
import { decryptField } from '../../lib/crypto.js';
import { clinicBookingClient } from './clients/index.js';
import { bookingServiceId, isRandoxEnabled } from './config.js';
import { RandoxWindowExpiredError } from './errors.js';
import { RandoxOrderError, mustFindOrder, type WindowedResult } from './orderService.js';
import type { CreateRandoxBookingRequest } from './types.js';

/**
 * In-clinic appointment flow, in the documented order — confirmed by the flow
 * diagram and the Postman collection (Aug 2026):
 *
 *   Nexus CreatePendingOrder  → capture the Order Number
 *   GetServiceLocations → AvailabilityDetails → HoldAvailabilityBooking
 *   → CreateRandoxBooking, carrying that Order Number as GPExternalNumber
 *
 * "Important to send the Order Number captured above as the GPExternalNumber"
 * is the flow diagram's own sentence, and it is the whole joint between the
 * two APIs: nothing else on a booking references the laboratory order.
 *
 * The hold lasts 30 minutes. Everything after the hold is windowed: if the
 * patient dithers past the expiry, CreateRandoxBooking is refused and the
 * caller is told the slot has gone, rather than being shown an error.
 *
 * Only in-clinic orders come through here. Home-kit and mobile-phlebotomy
 * orders have no slot to book and never touch the Booking API.
 *
 * SLOTS ARE UTC END TO END. They arrive UTC, are stored UTC, are sent back to
 * Randox as UTC wall-clock date and time fields, and are rendered in
 * Europe/London exactly once, at the edge — every slot carries its UK-local
 * form beside the instant so a consumer cannot accidentally localise into the
 * reader's own zone. Nothing in this module converts anything.
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
 * Slots come back in UTC and are passed on in UTC, each carrying its UK-local
 * rendering beside the instant. Nothing in this module converts anything.
 *
 * `to` is an upper bound applied to the RESULT: AvailabilityDetails takes a
 * SearchFrom and has no SearchTo, so the range is closed on our side rather
 * than by a request field the API has never been shown to accept.
 */
export async function listAvailability(serviceLocationId: string, fromIsoDate: string, toIsoDate: string) {
  assertEnabled();
  return clinicBookingClient().availabilityDetails(serviceLocationId, fromIsoDate, toIsoDate);
}

/**
 * Holds a slot and records the hold against the order, so the 30-minute
 * expiry is visible to us rather than only known to Randox.
 *
 * Everything the create will need is stored HERE, in one write: the slot id,
 * the BookingId/AppointmentId pair the hold returns, and the service id. The
 * create is a separate request from a separate page view — possibly after a
 * reload — so anything only held in memory between the two is a booking that
 * cannot be completed.
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

  const hold = await clinicBookingClient().holdAvailabilityBooking(
    input.serviceLocationId,
    input.slotReference,
    input.startUtc,
  );

  const held = {
    serviceLocationId: input.serviceLocationId,
    serviceLocationName: input.serviceLocationName ?? null,
    serviceId: bookingServiceId(),
    slotReference: input.slotReference,
    holdReference: hold.holdReference,
    holdExpiresAt: new Date(hold.expiresAtUtc),
    holdBookingId: hold.bookingId,
    holdAppointmentId: hold.appointmentId,
    startUtc: new Date(input.startUtc),
    status: 'HELD' as const,
  };

  const appointment = await prisma.randoxAppointment.upsert({
    where: { orderId: order.id },
    create: { orderId: order.id, ...held },
    update: { ...held, cancelledAt: null },
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
 * The patient block CreateRandoxBooking requires.
 *
 * Built from the patient's own profile at booking time and NOT from the order
 * snapshot: the order snapshot exists to corroborate an incoming result
 * against what the laboratory was told (see identityCheck.ts), and this is a
 * different job — it is who Randox should expect at the clinic door, and it
 * should be whatever the patient has most recently told us.
 *
 * Address, town and postcode are optional on the profile (they are asked for
 * at invite activation and can be filled in later) and are required by the
 * booking. Refused rather than blanked: an appointment filed against an empty
 * address is a record with a hole in it at the one clinic that has to find the
 * person.
 */
async function buildBookingPatient(
  patientId: string,
  orderNumber: string,
): Promise<CreateRandoxBookingRequest['patient']> {
  const patient = await prisma.user.findUnique({ where: { id: patientId }, include: { patientProfile: true } });
  const profile = patient?.patientProfile;
  if (!patient || !profile) {
    throw new RandoxOrderError(`Order ${orderNumber} has no patient profile, so no appointment can be booked.`, 409);
  }

  const missing: string[] = [];
  const address = readEncrypted(profile.addressEncrypted);
  if (!address) missing.push('address');
  if (!profile.postcode) missing.push('postcode');
  const contactNumber = readEncrypted(profile.contactNumberEncrypted);
  if (!contactNumber) missing.push('contact number');
  if (!patient.email) missing.push('email address');
  const dateOfBirth = readEncrypted(profile.dobEncrypted)?.slice(0, 10);
  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) missing.push('date of birth');

  if (missing.length > 0) {
    throw new RandoxOrderError(
      `This patient’s ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} missing, and Randox require ` +
        `${missing.length === 1 ? 'it' : 'them'} on an appointment. The appointment was not booked.`,
      409,
    );
  }

  // An address is one encrypted blob; the booking wants it in lines. Split on
  // newlines and commas, keep the first two lines and take the town from the
  // last part where there is one — imperfect, and deliberately not "improved"
  // by guessing which fragment is a town, because the alternative to an
  // imperfect split is asking the patient for structured lines, which is a
  // product change and not a transport one.
  const parts = address!
    .split(/[\n,]/)
    .map((p) => p.trim())
    .filter(Boolean);

  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    dateOfBirth: dateOfBirth!,
    // Randox's own documented ids: 1 Male, 2 Female. Refused rather than
    // defaulted, exactly as on the order path — an appointment carrying the
    // wrong sex is a record a clinician has to reconcile by hand.
    biologicalSexId: profile.sex === 'MALE' ? 1 : profile.sex === 'FEMALE' ? 2 : refuseSex(orderNumber),
    email: patient.email,
    contactNumber: contactNumber!,
    addressLine1: parts[0] ?? '',
    addressLine2: parts.length > 2 ? parts[1] : '',
    townCity: parts.length > 2 ? parts[parts.length - 1] : (parts[1] ?? ''),
    postalCode: profile.postcode!,
    // 1 in the collection's example, which is the only value anyone has shown
    // us. Not configurable until there is a second one to choose between.
    countryId: 1,
  };
}

function readEncrypted(value: string | null): string | null {
  if (!value) return null;
  try {
    const plain = decryptField(value).trim();
    return plain === '' ? null : plain;
  } catch {
    return null;
  }
}

function refuseSex(orderNumber: string): never {
  throw new RandoxOrderError(
    `Order ${orderNumber} has no biological sex on the patient profile, and Randox require one on an appointment.`,
    409,
  );
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
  // The create sends BookingId, AppointmentId and AppointmentSlotId, all of
  // which come off the hold. Refused rather than defaulted to zero: a booking
  // built on somebody else's ids is worse than no booking.
  if (
    appointment.holdBookingId === null ||
    appointment.holdAppointmentId === null ||
    !appointment.slotReference
  ) {
    throw new RandoxOrderError(
      `The hold on order ${orderNumber} is missing the identifiers CreateRandoxBooking needs (BookingId, ` +
        'AppointmentId, AppointmentSlotId). Hold the slot again.',
      409,
    );
  }

  /**
   * ── AN EXPIRED HOLD IS REFUSED HERE, BEFORE RANDOX ARE ASKED (Aug 2026) ──
   *
   * The hold lasts 30 minutes (`HOLD_DURATION_MS` in ClinicBookingClient, and
   * whatever expiry Randox return in preference to it). Until now the only
   * thing that noticed a lapsed hold was Randox refusing the create, and the
   * catch below turned that into the right message — which is correct as a
   * BACKSTOP and wrong as the only check, for two reasons:
   *
   *  · It sends a full patient record — name, date of birth, address, contact
   *    number — to a third party on a request we already know cannot succeed.
   *  · It is a create, and a create is deliberately not retryable (see
   *    createRandoxBooking). If Randox's own view of the hold has drifted from
   *    ours by a few seconds, "we knew it had expired and asked anyway" is the
   *    one way this path can produce an appointment nobody intended.
   *
   * The row is marked EXPIRED in the same breath, so a HELD row can never sit
   * there looking live after its own deadline has passed. The `catch` stays: a
   * slot can be taken by somebody else well inside the thirty minutes, and only
   * Randox know that.
   */
  if (appointment.holdExpiresAt !== null && appointment.holdExpiresAt.getTime() <= Date.now()) {
    await prisma.randoxAppointment.update({ where: { id: appointment.id }, data: { status: 'EXPIRED' } });
    await recordAuditLog({
      actorUserId,
      action: 'RANDOX_BOOKING_HOLD_EXPIRED',
      targetType: 'RandoxAppointment',
      targetId: appointment.id,
      metadata: { orderNumber, holdExpiresAt: appointment.holdExpiresAt.toISOString(), detectedBy: 'local-deadline' },
    });
    return {
      ok: false,
      windowExpired: true,
      message: 'That slot is no longer being held for you. Please choose another time.',
    };
  }

  const patient = await buildBookingPatient(order.patientId, orderNumber);

  try {
    const booking = await clinicBookingClient().createRandoxBooking({
      holdReference: appointment.holdReference,
      bookingId: appointment.holdBookingId,
      appointmentId: appointment.holdAppointmentId,
      serviceLocationId: appointment.serviceLocationId,
      slotReference: appointment.slotReference,
      startUtc: appointment.startUtc.toISOString(),
      // THE JOINT BETWEEN THE TWO APIs. `order.orderNumber` is what
      // CreatePendingOrder gave us (seeded from its externalNumber) — see the
      // note on reconcileOrderNumber in orderService.ts.
      gpExternalNumber: order.orderNumber,
      patient,
    });

    await prisma.randoxAppointment.update({
      where: { id: appointment.id },
      data: {
        bookingReference: booking.bookingReference,
        // The only id CancelRandoxBooking takes. Stored in the same write as
        // the booking becoming real.
        randoxBookingOrderId: booking.randoxBookingOrderId,
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

/**
 * CancelRandoxBooking. Windowed. Does not cancel the lab order itself.
 *
 * Takes Randox's own `RandoxBookingOrderId` and nothing else — the single
 * field their example carries. An appointment booked before that id was
 * captured cannot be cancelled through the API, and says so rather than
 * sending a reference the endpoint has no field for.
 */
export async function cancelBooking(orderNumber: string, actorUserId: string | null): Promise<WindowedResult> {
  assertEnabled();
  const order = await mustFindOrder(orderNumber);
  const appointment = await prisma.randoxAppointment.findUnique({ where: { orderId: order.id } });

  if (!appointment?.bookingReference) {
    throw new RandoxOrderError(`Order ${orderNumber} has no confirmed appointment to cancel.`, 409);
  }
  if (appointment.randoxBookingOrderId === null) {
    throw new RandoxOrderError(
      `The appointment on order ${orderNumber} has no RandoxBookingOrderId recorded, which is the only identifier ` +
        'CancelRandoxBooking accepts. It was booked before that id was captured — cancel it with Randox directly.',
      409,
    );
  }

  try {
    await clinicBookingClient().cancelRandoxBooking(appointment.randoxBookingOrderId, orderNumber);
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

/**
 * MOVING AN APPOINTMENT. THE ENDPOINT IS CALLABLE NOW AND THIS STILL DOES NOT
 * CALL IT — WHICH IS A DIFFERENT REASON FROM THE LAST TWO (Aug 2026).
 *
 * The history is worth three lines, because the conclusion has survived two
 * arguments that were both wrong:
 *
 *   "there is no such endpoint"        WRONG. It is on page 3 of
 *                                     specs/20241028-Corporate-Customer-API-Flow.pdf,
 *                                     dated 1-Nov-24.
 *   "there is no way to spell a call"  Right at the time, and no longer true.
 *                                     specs/clinic-booking-openapi3.json gives
 *                                     the path, the verb and four REQUIRED
 *                                     fields, and LiveClinicBookingClient
 *                                     implements it.
 *
 * SO WHY IS THIS STILL COMPOSED? Because of what the documented request does
 * NOT contain: a hold. RescheduleAppointment takes an appointment id and a new
 * slot id, and there is no HoldAvailabilityBooking in front of it — so there is
 * no way to find out whether the new slot is free BEFORE giving up the one the
 * patient already has. Its own response schema says the same thing from the
 * other side: it carries a `SuccessFailCode`, i.e. it can refuse, and by then
 * the request has been made.
 *
 * Every previous version of this note argued from a gap in the documents. This
 * one argues from what the documents say, and it is the first version that will
 * still be right after Randox answer their email.
 *
 * THE ORDER OF THE THREE CALLS IS THE WHOLE DESIGN:
 *
 *   1. hold the new slot   — if it has gone, nothing has happened yet and the
 *                            patient still has their original appointment
 *   2. book the new slot   — if this fails, likewise: the old one stands
 *   3. cancel the old one  — only once the replacement genuinely exists
 *
 * Cancelling first would be simpler and is the version that loses somebody's
 * appointment when step 2 fails. There is a window in between where two
 * bookings exist against one order number; that is the safe side of the
 * trade, and step 3 closes it in the same request.
 *
 * WHETHER RANDOX ACCEPT A SECOND BOOKING AGAINST ONE GPExternalNumber IS
 * UNKNOWN, and this ordering is safe under both answers — which is why it does
 * not need to be known first. Refused: step 2 fails, the original appointment
 * is untouched, the patient is told the time is unavailable. Accepted: step 3
 * cancels the old one and exactly one survives. On the list for Randox.
 *
 * IF STEP 3 FAILS the new appointment is kept and the failure is audited: a
 * stale booking Randox still hold is a phone call, and a patient with no
 * appointment at all is a wasted trip.
 *
 * WHAT WOULD CHANGE THIS. The sandbox pass now calls RescheduleAppointment. If
 * a capture shows it holds the slot itself — or refuses cleanly and leaves the
 * original standing — then one atomic call beats three, and this becomes a
 * two-line function. That is a decision to make on a capture, not on a schema.
 */
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

  const previous = {
    startUtc: appointment.startUtc.toISOString(),
    bookingReference: appointment.bookingReference,
    randoxBookingOrderId: appointment.randoxBookingOrderId,
  };
  const client = clinicBookingClient();
  const patient = await buildBookingPatient(order.patientId, orderNumber);

  let hold;
  try {
    hold = await client.holdAvailabilityBooking(appointment.serviceLocationId, newSlotReference, newStartUtc);
  } catch (e) {
    if (e instanceof RandoxWindowExpiredError) {
      await recordAuditLog({
        actorUserId,
        action: 'RANDOX_BOOKING_RESCHEDULE_SLOT_GONE',
        targetType: 'RandoxAppointment',
        targetId: appointment.id,
        metadata: { orderNumber, newSlotReference, message: e.message },
      });
      return {
        ok: false,
        windowExpired: true,
        message: 'That time is no longer available. The existing appointment has not been changed.',
      };
    }
    throw e;
  }

  if (hold.bookingId === null || hold.appointmentId === null) {
    return {
      ok: false,
      windowExpired: false,
      message: 'That time could not be held. The existing appointment has not been changed.',
    };
  }

  let booking;
  try {
    booking = await client.createRandoxBooking({
      holdReference: hold.holdReference,
      bookingId: hold.bookingId,
      appointmentId: hold.appointmentId,
      serviceLocationId: appointment.serviceLocationId,
      slotReference: newSlotReference,
      startUtc: newStartUtc,
      gpExternalNumber: order.orderNumber,
      patient,
    });
  } catch (e) {
    if (e instanceof RandoxWindowExpiredError) {
      await recordAuditLog({
        actorUserId,
        action: 'RANDOX_BOOKING_RESCHEDULE_WINDOW_EXPIRED',
        targetType: 'RandoxAppointment',
        targetId: appointment.id,
        metadata: { orderNumber, message: e.message },
      });
      return {
        ok: false,
        windowExpired: true,
        message: 'That time is no longer available. The existing appointment has not been changed.',
      };
    }
    throw e;
  }

  // The replacement exists. Only now is the original given up.
  let previousCancelled = false;
  if (previous.randoxBookingOrderId !== null) {
    try {
      await client.cancelRandoxBooking(previous.randoxBookingOrderId, orderNumber);
      previousCancelled = true;
    } catch (e) {
      // Kept, not thrown. The patient has a valid appointment at the new time;
      // an old one Randox have not released is a phone call, and failing here
      // would tell them their move did not happen when it did.
      await recordAuditLog({
        actorUserId,
        action: 'RANDOX_BOOKING_RESCHEDULE_OLD_NOT_CANCELLED',
        targetType: 'RandoxAppointment',
        targetId: appointment.id,
        metadata: {
          orderNumber,
          previousRandoxBookingOrderId: previous.randoxBookingOrderId,
          newBookingReference: booking.bookingReference,
          message: e instanceof Error ? e.message : 'unknown error',
          note: 'The new appointment is booked. The previous one may still be held by Randox — cancel it by hand.',
        },
      });
    }
  }

  await prisma.randoxAppointment.update({
    where: { id: appointment.id },
    data: {
      slotReference: newSlotReference,
      holdReference: hold.holdReference,
      holdExpiresAt: new Date(hold.expiresAtUtc),
      holdBookingId: hold.bookingId,
      holdAppointmentId: hold.appointmentId,
      bookingReference: booking.bookingReference,
      randoxBookingOrderId: booking.randoxBookingOrderId,
      startUtc: new Date(booking.startUtc),
      endUtc: booking.endUtc ? new Date(booking.endUtc) : null,
      status: 'BOOKED',
    },
  });

  await recordAuditLog({
    actorUserId,
    action: 'RANDOX_BOOKING_RESCHEDULED',
    targetType: 'RandoxAppointment',
    targetId: appointment.id,
    metadata: {
      orderNumber,
      from: previous.startUtc,
      to: booking.startUtc,
      previousBookingReference: previous.bookingReference,
      previousCancelled,
      note: 'Composed from HoldAvailabilityBooking + CreateRandoxBooking + CancelRandoxBooking. RescheduleAppointment is specified and callable, and is not used here because it takes no hold — so it cannot check the new slot is free before the old one is given up.',
    },
  });

  return { ok: true, windowExpired: false, message: 'Appointment moved.' };
}
