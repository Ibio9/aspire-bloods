import { randomUUID } from 'node:crypto';
import { RandoxWindowExpiredError } from '../errors.js';
import type { ClinicBookingClient } from '../clients/types.js';
import type {
  RandoxServiceLocation,
  RandoxAvailabilitySlot,
  HoldAvailabilityBookingResponse,
  CreateRandoxBookingRequest,
  CreateRandoxBookingResponse,
} from '../types.js';

const HOLD_DURATION_MS = 30 * 60 * 1000;

interface MockHold {
  holdReference: string;
  serviceLocationId: string;
  slotReference: string;
  expiresAt: number;
  consumed: boolean;
}

interface MockBooking {
  bookingReference: string;
  orderNumber: string;
  serviceLocationId: string;
  startUtc: string;
  cancelled: boolean;
}

/**
 * In-memory Clinic Booking. Enforces the two rules the real API has that
 * our code must survive: a hold expires after 30 minutes, and a hold is
 * single-use. Both surface as RandoxWindowExpiredError, which callers
 * treat as "the slot went" rather than as a fault.
 */
export class MockClinicBookingClient implements ClinicBookingClient {
  private readonly holds = new Map<string, MockHold>();
  private readonly bookings = new Map<string, MockBooking>();

  /** Test hook: pretend every hold has already lapsed. */
  expireHoldsImmediately = false;

  private readonly locations: RandoxServiceLocation[] = [
    { id: 'MOCK-LOC-1', name: 'Aspire Clinic — Manchester', addressLine1: '1 Example Street', city: 'Manchester', postcode: 'M1 1AA', latitude: 53.4808, longitude: -2.2426 },
    { id: 'MOCK-LOC-2', name: 'Aspire Clinic — Leeds', addressLine1: '2 Example Road', city: 'Leeds', postcode: 'LS1 1AA', latitude: 53.8008, longitude: -1.5491 },
  ];

  async getServiceLocations(): Promise<RandoxServiceLocation[]> {
    return this.locations;
  }

  async availabilityDetails(
    serviceLocationId: string,
    fromIsoDate: string,
    _toIsoDate: string,
  ): Promise<RandoxAvailabilitySlot[]> {
    if (!this.locations.some((l) => l.id === serviceLocationId)) {
      throw new Error(`Mock Booking: unknown service location "${serviceLocationId}".`);
    }

    // Half-hourly slots, 09:00–12:00 UTC on the from-date. Explicitly UTC:
    // the real API documents UTC and the caller must never re-zone them.
    const day = fromIsoDate.slice(0, 10);
    const slots: RandoxAvailabilitySlot[] = [];
    for (let halfHour = 0; halfHour < 6; halfHour += 1) {
      const hour = 9 + Math.floor(halfHour / 2);
      const minute = halfHour % 2 === 0 ? '00' : '30';
      const startUtc = `${day}T${String(hour).padStart(2, '0')}:${minute}:00.000Z`;
      slots.push({
        startUtc,
        endUtc: new Date(new Date(startUtc).getTime() + 30 * 60 * 1000).toISOString(),
        slotReference: `${serviceLocationId}:${startUtc}`,
      });
    }
    return slots;
  }

  async holdAvailabilityBooking(
    serviceLocationId: string,
    slotReference: string,
  ): Promise<HoldAvailabilityBookingResponse> {
    const holdReference = `HOLD-${randomUUID().slice(0, 8).toUpperCase()}`;
    const expiresAt = Date.now() + (this.expireHoldsImmediately ? -1_000 : HOLD_DURATION_MS);
    this.holds.set(holdReference, { holdReference, serviceLocationId, slotReference, expiresAt, consumed: false });
    return { holdReference, expiresAtUtc: new Date(expiresAt).toISOString() };
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
        `The 30-minute hold on this slot has expired. The appointment was not booked.`,
      );
    }
    if (!request.gpExternalNumber) {
      throw new Error('CreateRandoxBooking requires the Nexus Order Number as GPExternalNumber.');
    }

    hold.consumed = true;
    const bookingReference = `BOOK-${randomUUID().slice(0, 8).toUpperCase()}`;
    this.bookings.set(bookingReference, {
      bookingReference,
      orderNumber: request.gpExternalNumber,
      serviceLocationId: request.serviceLocationId,
      startUtc: request.startUtc,
      cancelled: false,
    });

    return {
      bookingReference,
      startUtc: request.startUtc,
      endUtc: new Date(new Date(request.startUtc).getTime() + 30 * 60 * 1000).toISOString(),
    };
  }

  async cancelRandoxBooking(bookingReference: string, orderNumber: string): Promise<void> {
    const booking = this.bookings.get(bookingReference);
    if (!booking) {
      throw new RandoxWindowExpiredError(
        'CancelRandoxBooking',
        orderNumber,
        `Booking ${bookingReference} is not recognised. It may already have been cancelled.`,
      );
    }
    // Real cancellation windows close before the appointment; an
    // appointment already in the past can't be cancelled.
    if (new Date(booking.startUtc).getTime() < Date.now()) {
      throw new RandoxWindowExpiredError(
        'CancelRandoxBooking',
        orderNumber,
        `Appointment for order ${orderNumber} has already taken place and cannot be cancelled.`,
      );
    }
    booking.cancelled = true;
  }

  async rescheduleAppointment(
    bookingReference: string,
    orderNumber: string,
    _newSlotReference: string,
    newStartUtc: string,
  ): Promise<CreateRandoxBookingResponse> {
    const booking = this.bookings.get(bookingReference);
    if (!booking || booking.cancelled) {
      throw new RandoxWindowExpiredError(
        'RescheduleAppointment',
        orderNumber,
        `Booking ${bookingReference} can no longer be rescheduled.`,
      );
    }
    booking.startUtc = newStartUtc;
    return {
      bookingReference,
      startUtc: newStartUtc,
      endUtc: new Date(new Date(newStartUtc).getTime() + 30 * 60 * 1000).toISOString(),
    };
  }

  reset(): void {
    this.holds.clear();
    this.bookings.clear();
    this.expireHoldsImmediately = false;
  }
}
