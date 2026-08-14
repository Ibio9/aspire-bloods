import { RandoxWindowExpiredError } from '../errors.js';
import { londonWallClock, slotDateDayFirst } from '../clients/parse.js';
import type { ClinicBookingClient } from '../clients/types.js';
import type {
  RandoxServiceLocation,
  RandoxServiceRegion,
  RandoxAvailabilitySlot,
  HoldAvailabilityBookingResponse,
  CreateRandoxBookingRequest,
  CreateRandoxBookingResponse,
  RescheduleAppointmentResponse,
} from '../types.js';

const HOLD_DURATION_MS = 30 * 60 * 1000;

/**
 * The sandbox location Randox say actually has availability (Chris Caulfield,
 * Aug 2026): Clinic Location Crumlin, LocationId 30. The Postman collection
 * uses 15, which may have no slots at all — so a first live smoke test against
 * 15 can look exactly like a broken integration while being an empty diary.
 * The mock uses 30 for the same reason a fixture uses a real-shaped id.
 */
export const SANDBOX_LOCATION_ID = '30';
export const SANDBOX_LOCATION_NAME = 'Clinic Location Crumlin';

interface MockHold {
  holdReference: string;
  bookingId: number;
  appointmentId: number;
  locationId: string;
  slotReference: string;
  expiresAt: number;
  consumed: boolean;
}

interface MockBooking {
  bookingReference: string;
  randoxBookingOrderId: number;
  /** What RescheduleAppointment identifies the booking by. Moves on a move. */
  appointmentId: number;
  orderNumber: string;
  locationId: string;
  slotReference: string;
  startUtc: string;
  cancelled: boolean;
}

/**
 * In-memory Clinic Booking, matching the collection's contract.
 *
 * It enforces the rules the real API has that our code must survive: a slot
 * can be taken between availability and hold, a hold expires after 30 minutes,
 * a hold is single-use, and a cancel needs Randox's own integer booking-order
 * id rather than any string of ours. Each surfaces the way the live client
 * makes it surface, so a test against this proves something about production.
 *
 * Deterministic ids, so an assertion can name one.
 */
export class MockClinicBookingClient implements ClinicBookingClient {
  private readonly holds = new Map<string, MockHold>();
  private readonly bookings = new Map<number, MockBooking>();
  private readonly takenSlots = new Set<string>();
  private counter = 0;

  /** Test hook: pretend every hold has already lapsed. */
  expireHoldsImmediately = false;
  /** Test hook: the next hold is refused as though somebody else took the slot. */
  nextHoldSlotTaken = false;
  /** Test hook: the next create fails after the hold was placed. */
  nextBookingFails = false;

  private readonly locations: RandoxServiceLocation[] = [
    {
      id: SANDBOX_LOCATION_ID,
      name: SANDBOX_LOCATION_NAME,
      addressLine1: '1 Example Street',
      city: 'Crumlin',
      postcode: 'BT29 4QY',
      latitude: 54.6167,
      longitude: -6.2167,
    },
    {
      id: '15',
      name: 'Clinic Location Fifteen',
      addressLine1: '2 Example Road',
      city: 'Belfast',
      postcode: 'BT1 1AA',
      latitude: 54.5973,
      longitude: -5.9301,
    },
  ];

  /**
   * A region is not a service. 787/788 are SERVICE ids from an email, these
   * are region ids from an endpoint, and nothing published relates the two —
   * so the fixture deliberately does not make them look related.
   */
  async getServiceRegions(): Promise<RandoxServiceRegion[]> {
    // Shaped like the real ones: {Id, Name, CurrencyCode, DisplayOrder}, and
    // the currency code is UK/ROI — which resembles the 787/788 choice and is
    // not it. Nothing here relates them, deliberately.
    return [
      { id: '3', name: 'Northern Ireland', currencyCode: 'UK' },
      { id: '6', name: 'Southern Ireland', currencyCode: 'ROI' },
    ];
  }

  async getServiceLocations(): Promise<RandoxServiceLocation[]> {
    return this.locations;
  }

  async availabilityDetails(
    locationId: string,
    searchFromIsoDate: string,
    untilIsoDate?: string,
  ): Promise<RandoxAvailabilitySlot[]> {
    if (!this.locations.some((l) => l.id === locationId)) {
      throw new Error(`Mock Booking: unknown location "${locationId}".`);
    }
    // LocationId 15 is the collection's, and Randox warn it may have no slots.
    // Modelled rather than described: an empty diary is a legitimate answer and
    // the caller has to handle it without reading it as a failure.
    if (locationId === '15') return [];

    // Half-hourly, 09:00–12:00. THE SHAPE IS THE OBSERVED ONE: a slot is a
    // day-first `Date` and a bare `Time`, and the id embeds the same wall clock
    // (`slot-room33-2026-09-01T09:00-staff19`) rather than an epoch. The
    // epoch-bearing `72164:72164::1760607000:` form is in the Postman
    // collection and has never been seen on the wire; a fixture that models the
    // document rather than the API is how 114 slots came back as none.
    const day = searchFromIsoDate.slice(0, 10);
    const untilMs = untilIsoDate ? Date.parse(`${untilIsoDate.slice(0, 10)}T23:59:59.999Z`) : null;
    const slots: RandoxAvailabilitySlot[] = [];

    for (let halfHour = 0; halfHour < 6; halfHour += 1) {
      const hour = 9 + Math.floor(halfHour / 2);
      const minute = halfHour % 2 === 0 ? '00' : '30';
      const wireTime = `${String(hour).padStart(2, '0')}:${minute}`;
      const startUtc = `${day}T${wireTime}:00.000Z`;
      if (untilMs !== null && Date.parse(startUtc) > untilMs) continue;
      const slotReference = `slot-room33-${day}T${wireTime}-staff${19 + halfHour}`;
      if (this.takenSlots.has(slotReference)) continue;
      slots.push({
        startUtc,
        // Randox send no end time on a real slot.
        endUtc: null,
        slotReference,
        wireDate: slotDateDayFirst(startUtc),
        wireTime,
        availableQuantity: 1,
        local: londonWallClock(startUtc),
      });
    }
    return slots;
  }

  async holdAvailabilityBooking(
    locationId: string,
    slotReference: string,
    startUtc: string,
  ): Promise<HoldAvailabilityBookingResponse> {
    // THE SLOT WENT WHILE THE PATIENT WAS CHOOSING. The commonest real failure
    // in this flow, and the one a booking UI has to survive gracefully: it is
    // a race, not a fault, so it arrives as a closed window.
    if (this.nextHoldSlotTaken || this.takenSlots.has(slotReference)) {
      this.nextHoldSlotTaken = false;
      this.takenSlots.add(slotReference);
      throw new RandoxWindowExpiredError(
        'HoldAvailabilityBooking',
        slotReference,
        'That appointment slot is no longer available. It was taken while it was being chosen.',
      );
    }
    if (!startUtc || Number.isNaN(Date.parse(startUtc))) {
      throw new Error('Mock Booking: HoldAvailabilityBooking needs the slot’s UTC instant to build its date and time.');
    }

    this.counter += 1;
    const id = 1144015 + this.counter;
    const holdReference = String(id);
    const expiresAt = Date.now() + (this.expireHoldsImmediately ? -1_000 : HOLD_DURATION_MS);
    this.holds.set(holdReference, {
      holdReference,
      bookingId: id,
      appointmentId: id,
      locationId,
      slotReference,
      expiresAt,
      consumed: false,
    });
    // Randox return ONE id and the create needs two — the fixture makes them
    // equal because the collection's own example does (1144015 twice) and
    // because a real create without an AppointmentId is
    // `400 "Randox Booking failure, invalid appointment id."`
    return {
      holdReference,
      expiresAtUtc: new Date(expiresAt).toISOString(),
      bookingId: id,
      appointmentId: id,
    };
  }

  async createRandoxBooking(request: CreateRandoxBookingRequest): Promise<CreateRandoxBookingResponse> {
    const hold = this.holds.get(request.holdReference);
    if (!hold) {
      throw new RandoxWindowExpiredError(
        'CreateRandoxBooking',
        request.gpExternalNumber,
        `Hold ${request.holdReference} is not recognised. It may already have expired.`,
      );
    }
    if (hold.consumed || Date.now() > hold.expiresAt) {
      throw new RandoxWindowExpiredError(
        'CreateRandoxBooking',
        request.gpExternalNumber,
        'The 30-minute hold on this slot has expired. The appointment was not booked.',
      );
    }
    if (!request.gpExternalNumber) {
      throw new Error('CreateRandoxBooking requires the Nexus Order Number as GPExternalNumber.');
    }
    if (this.nextBookingFails) {
      // A create that fails AFTER a hold was placed. The hold is deliberately
      // left unconsumed and live: the slot is still ours until it lapses, so
      // the patient can try again without going back to availability.
      this.nextBookingFails = false;
      throw new Error('Mock Booking: CreateRandoxBooking failed after the hold was placed.');
    }

    hold.consumed = true;
    this.takenSlots.add(hold.slotReference);
    const randoxBookingOrderId = 32285 + this.counter;
    const booking: MockBooking = {
      bookingReference: String(randoxBookingOrderId),
      randoxBookingOrderId,
      appointmentId: request.appointmentId,
      orderNumber: request.gpExternalNumber,
      locationId: request.serviceLocationId,
      slotReference: hold.slotReference,
      startUtc: request.startUtc,
      cancelled: false,
    };
    this.bookings.set(randoxBookingOrderId, booking);

    return {
      bookingReference: booking.bookingReference,
      randoxBookingOrderId,
      startUtc: request.startUtc,
      endUtc: new Date(Date.parse(request.startUtc) + 30 * 60 * 1000).toISOString(),
    };
  }

  async cancelRandoxBooking(randoxBookingOrderId: number, orderNumber: string): Promise<void> {
    const booking = this.bookings.get(randoxBookingOrderId);
    if (!booking) {
      throw new RandoxWindowExpiredError(
        'CancelRandoxBooking',
        orderNumber,
        `Booking ${randoxBookingOrderId} is not recognised. It may already have been cancelled.`,
      );
    }
    // Real cancellation windows close before the appointment; an appointment
    // already in the past can't be cancelled.
    if (Date.parse(booking.startUtc) < Date.now()) {
      throw new RandoxWindowExpiredError(
        'CancelRandoxBooking',
        orderNumber,
        `Appointment for order ${orderNumber} has already taken place and cannot be cancelled.`,
      );
    }
    booking.cancelled = true;
    // The slot goes back on the diary, which is what makes "cancel, then book
    // the new time" testable as the reschedule route.
    this.takenSlots.delete(booking.slotReference);
  }

  /**
   * Specified since Aug 2026 — and it REFUSES INSIDE A 200, which is the whole
   * reason to model it rather than to throw.
   *
   * Every other failure on this API arrives as a 4xx and the transport throws,
   * so a caller that forgets to check gets an exception. Here a refusal is a
   * successful response with `succeeded: false` in it, and a caller that
   * forgets tells a patient their appointment moved when it did not. A fixture
   * that always succeeded would make that bug untestable.
   *
   * No hold is taken, exactly as the documented request implies — so the "slot
   * gone" case is a soft failure rather than a RandoxWindowExpiredError.
   */
  async rescheduleAppointment(
    appointmentId: number,
    serviceLocationId: string,
    newSlotReference: string,
  ): Promise<RescheduleAppointmentResponse> {
    const fail = (failureDescription: string): RescheduleAppointmentResponse => ({
      bookingId: null,
      succeeded: false,
      successFailCode: 'Fail',
      failureDescription,
      newStartUtc: null,
    });

    const booking = [...this.bookings.values()].find(
      (b) => b.appointmentId === appointmentId && !b.cancelled,
    );
    if (!booking) return fail('No active appointment was found for that appointment id.');
    if (booking.locationId !== serviceLocationId) {
      return fail('That appointment is not at the location given.');
    }
    if (this.takenSlots.has(newSlotReference)) {
      return fail('That appointment slot is no longer available.');
    }

    // The observed id carries the slot's own wall clock. The fixture is allowed
    // to read its own format; nothing in the CLIENT parses a slot id, because
    // two formats exist and neither is documented.
    const wall = /-(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})-/.exec(newSlotReference);
    if (!wall) return fail('That appointment slot id was not recognised.');

    this.takenSlots.delete(booking.slotReference);
    this.takenSlots.add(newSlotReference);
    booking.slotReference = newSlotReference;
    booking.startUtc = `${wall[1]}T${wall[2]}:00.000Z`;
    this.counter += 1;
    booking.appointmentId = 87608 + this.counter;

    return {
      bookingId: booking.appointmentId,
      succeeded: true,
      successFailCode: 'Success',
      failureDescription: null,
      newStartUtc: booking.startUtc,
    };
  }

  reset(): void {
    this.holds.clear();
    this.bookings.clear();
    this.takenSlots.clear();
    this.counter = 0;
    this.expireHoldsImmediately = false;
    this.nextHoldSlotTaken = false;
    this.nextBookingFails = false;
  }
}
