import { RandoxUnsupportedOperationError, RandoxWindowExpiredError } from '../errors.js';
import { londonWallClock } from '../clients/parse.js';
import type { ClinicBookingClient } from '../clients/types.js';
import type {
  RandoxServiceLocation,
  RandoxAvailabilitySlot,
  HoldAvailabilityBookingResponse,
  CreateRandoxBookingRequest,
  CreateRandoxBookingResponse,
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

    // Half-hourly, 09:00–12:00 UTC. Explicitly UTC: the real API documents UTC
    // and the caller must never re-zone them.
    const day = searchFromIsoDate.slice(0, 10);
    const untilMs = untilIsoDate ? Date.parse(`${untilIsoDate.slice(0, 10)}T23:59:59.999Z`) : null;
    const slots: RandoxAvailabilitySlot[] = [];

    for (let halfHour = 0; halfHour < 6; halfHour += 1) {
      const hour = 9 + Math.floor(halfHour / 2);
      const minute = halfHour % 2 === 0 ? '00' : '30';
      const startUtc = `${day}T${String(hour).padStart(2, '0')}:${minute}:00.000Z`;
      if (untilMs !== null && Date.parse(startUtc) > untilMs) continue;
      // The real slot id embeds the slot's epoch — see the note in parse.ts.
      const epoch = Math.floor(Date.parse(startUtc) / 1000);
      const slotReference = `${72164 + halfHour}:${72164 + halfHour}::${epoch}:`;
      if (this.takenSlots.has(slotReference)) continue;
      slots.push({
        startUtc,
        endUtc: new Date(Date.parse(startUtc) + 30 * 60 * 1000).toISOString(),
        slotReference,
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

  /** Not a documented endpoint — the mock refuses exactly as the live client does. */
  async rescheduleAppointment(): Promise<never> {
    throw new RandoxUnsupportedOperationError(
      'RescheduleAppointment',
      'The Clinic Booking API documents no reschedule endpoint. Cancel and book the new slot instead.',
    );
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
