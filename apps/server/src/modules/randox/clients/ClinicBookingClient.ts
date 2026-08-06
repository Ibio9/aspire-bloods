import { RandoxHttpClient } from '../http/RandoxHttpClient.js';
import { bookingConnection } from '../config.js';
import type { ClinicBookingClient } from './types.js';
import { pickArray, pickNumber, pickString, requireString, toUtcIso } from './parse.js';
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
 * Clinic Booking API — in-clinic appointments only. Home-kit orders never
 * touch this client (there is no slot to book).
 *
 * UNVERIFIED. No OpenAPI specification for this API has been provided —
 * access is still pending. The endpoint PATHS and the call order below come
 * from the Randox flow PDFs in specs/ and are documented fact:
 * /Locations/GetServiceLocations, /Availability/AvailabilityDetails,
 * /RandoxBookings/HoldAvailabilityBooking,
 * /RandoxBookings/CreateRandoxBooking, plus CancelRandoxBooking and
 * RescheduleAppointment.
 *
 * The request and response BODIES are not documented anywhere we have, so
 * every property name here is an assumption, read through the tolerant
 * helpers in parse.ts — a name guessed wrong degrades to "field absent",
 * which is handled, rather than crashing. When the real spec lands, this
 * file and the Clinic Booking section of types.ts are what change; nothing
 * above them does.
 *
 * Availability is documented as UTC. Every timestamp crossing this boundary
 * goes through toUtcIso() so a response without an explicit zone designator
 * cannot be reinterpreted as server-local time.
 */
export class LiveClinicBookingClient implements ClinicBookingClient {
  private readonly http = new RandoxHttpClient(bookingConnection());

  async getServiceLocations(): Promise<RandoxServiceLocation[]> {
    const body = await this.http.request<unknown>('Locations/GetServiceLocations');
    return pickArray(body, 'serviceLocations', 'ServiceLocations', 'locations').map((raw) => ({
      id: requireString(raw, 'a service location id', 'id', 'Id', 'serviceLocationId', 'locationId'),
      name: pickString(raw, 'name', 'Name', 'locationName', 'siteName') ?? 'Unnamed location',
      addressLine1: pickString(raw, 'addressLine1', 'AddressLine1', 'address1', 'address'),
      city: pickString(raw, 'city', 'City', 'town', 'townCity'),
      postcode: pickString(raw, 'postcode', 'Postcode', 'postCode', 'postalCode'),
      // Documented as present, for "closest to" sorting we do ourselves.
      latitude: pickNumber(raw, 'latitude', 'Latitude', 'lat'),
      longitude: pickNumber(raw, 'longitude', 'Longitude', 'lng', 'long'),
    }));
  }

  async availabilityDetails(
    serviceLocationId: string,
    fromIsoDate: string,
    toIsoDate: string,
  ): Promise<RandoxAvailabilitySlot[]> {
    const body = await this.http.request<unknown>('Availability/AvailabilityDetails', {
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
    const body = await this.http.request<unknown>('RandoxBookings/HoldAvailabilityBooking', {
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
    const body = await this.http.request<unknown>('RandoxBookings/CreateRandoxBooking', {
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
    await this.http.request<unknown>('RandoxBookings/CancelRandoxBooking', {
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
    const body = await this.http.request<unknown>('RandoxBookings/RescheduleAppointment', {
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
