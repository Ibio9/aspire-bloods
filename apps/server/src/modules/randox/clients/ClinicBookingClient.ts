import { RandoxHttpClient } from '../http/RandoxHttpClient.js';
import { bookingConnection } from '../config.js';
import type { ClinicBookingClient } from './types.js';
import { pickArray, pickString, requireString, toUtcIso } from './parse.js';
import type {
  RandoxServiceLocation,
  RandoxAvailabilitySlot,
  HoldAvailabilityBookingResponse,
  CreateRandoxBookingRequest,
  CreateRandoxBookingResponse,
} from '../types.js';

/** Documented: a hold lasts 30 minutes. Used only when Randox don't tell us. */
const HOLD_DURATION_MS = 30 * 60 * 1000;

/**
 * Clinic Booking API — in-clinic appointments only. Home-kit and mobile
 * phlebotomy orders never touch this client (no slot to book).
 *
 * Every timestamp crossing this boundary is UTC, converted through
 * toUtcIso() so a response without an explicit zone designator can't be
 * reinterpreted as server-local time.
 */
export class LiveClinicBookingClient implements ClinicBookingClient {
  private readonly http = new RandoxHttpClient(bookingConnection());

  async getServiceLocations(): Promise<RandoxServiceLocation[]> {
    const body = await this.http.request<unknown>('GetServiceLocations');
    return pickArray(body, 'serviceLocations', 'ServiceLocations', 'locations').map((raw) => ({
      id: requireString(raw, 'a service location id', 'id', 'Id', 'serviceLocationId', 'locationId'),
      name: pickString(raw, 'name', 'Name', 'locationName', 'siteName') ?? 'Unnamed location',
      addressLine1: pickString(raw, 'addressLine1', 'AddressLine1', 'address1', 'address'),
      city: pickString(raw, 'city', 'City', 'town'),
      postcode: pickString(raw, 'postcode', 'Postcode', 'postCode', 'zip'),
    }));
  }

  async availabilityDetails(
    serviceLocationId: string,
    fromIsoDate: string,
    toIsoDate: string,
  ): Promise<RandoxAvailabilitySlot[]> {
    const body = await this.http.request<unknown>('AvailabilityDetails', {
      query: { serviceLocationId, fromDate: fromIsoDate, toDate: toIsoDate },
    });

    return pickArray(body, 'availability', 'Availability', 'slots', 'availabilityDetails')
      .map((raw): RandoxAvailabilitySlot | null => {
        const startUtc = toUtcIso(pickString(raw, 'startUtc', 'StartUtc', 'start', 'startDateTime', 'appointmentDateTime'));
        if (!startUtc) return null;
        return {
          startUtc,
          endUtc: toUtcIso(pickString(raw, 'endUtc', 'EndUtc', 'end', 'endDateTime')),
          slotReference:
            pickString(raw, 'slotReference', 'SlotReference', 'slotId', 'availabilityId', 'id') ?? startUtc,
        };
      })
      .filter((s): s is RandoxAvailabilitySlot => s !== null);
  }

  async holdAvailabilityBooking(
    serviceLocationId: string,
    slotReference: string,
  ): Promise<HoldAvailabilityBookingResponse> {
    const body = await this.http.request<unknown>('HoldAvailabilityBooking', {
      method: 'POST',
      body: { serviceLocationId, slotReference },
    });

    return {
      holdReference: requireString(body, 'the hold reference', 'holdReference', 'HoldReference', 'holdId', 'reference', 'id'),
      // Prefer Randox's own expiry. Falling back to now+30min is safe in
      // one direction only — if their window is shorter, CreateRandoxBooking
      // fails as a window-expired rejection, which is handled.
      expiresAtUtc:
        toUtcIso(pickString(body, 'expiresAtUtc', 'ExpiresAtUtc', 'expiresAt', 'holdExpiry', 'expiryDateTime')) ??
        new Date(Date.now() + HOLD_DURATION_MS).toISOString(),
    };
  }

  async createRandoxBooking(request: CreateRandoxBookingRequest): Promise<CreateRandoxBookingResponse> {
    const body = await this.http.request<unknown>('CreateRandoxBooking', {
      method: 'POST',
      body: {
        holdReference: request.holdReference,
        serviceLocationId: request.serviceLocationId,
        // Documented field name — this is how the booking is tied back to
        // the Nexus order. Spelled exactly as the brief gives it.
        GPExternalNumber: request.gpExternalNumber,
        startUtc: request.startUtc,
      },
      windowedOperation: { name: 'CreateRandoxBooking', orderNumber: request.gpExternalNumber },
    });

    return {
      bookingReference: requireString(
        body,
        'the booking reference',
        'bookingReference',
        'BookingReference',
        'bookingId',
        'reference',
        'id',
      ),
      startUtc: toUtcIso(pickString(body, 'startUtc', 'StartUtc', 'start', 'appointmentDateTime')) ?? request.startUtc,
      endUtc: toUtcIso(pickString(body, 'endUtc', 'EndUtc', 'end')),
    };
  }

  async cancelRandoxBooking(bookingReference: string, orderNumber: string): Promise<void> {
    await this.http.request<unknown>('CancelRandoxBooking', {
      method: 'POST',
      body: { bookingReference, GPExternalNumber: orderNumber },
      windowedOperation: { name: 'CancelRandoxBooking', orderNumber },
    });
  }

  async rescheduleAppointment(
    bookingReference: string,
    orderNumber: string,
    newSlotReference: string,
    newStartUtc: string,
  ): Promise<CreateRandoxBookingResponse> {
    const body = await this.http.request<unknown>('RescheduleAppointment', {
      method: 'POST',
      body: { bookingReference, GPExternalNumber: orderNumber, slotReference: newSlotReference, startUtc: newStartUtc },
      windowedOperation: { name: 'RescheduleAppointment', orderNumber },
    });

    return {
      bookingReference: pickString(body, 'bookingReference', 'BookingReference', 'bookingId', 'reference') ?? bookingReference,
      startUtc: toUtcIso(pickString(body, 'startUtc', 'StartUtc', 'start')) ?? newStartUtc,
      endUtc: toUtcIso(pickString(body, 'endUtc', 'EndUtc', 'end')),
    };
  }
}
