import { RandoxHttpClient } from '../http/RandoxHttpClient.js';
import { bookingConnection, bookingServiceId } from '../config.js';
import { CLINIC_BOOKING_ENDPOINTS } from '../endpoints.js';
import { RandoxUnsupportedOperationError } from '../errors.js';
import type { ClinicBookingClient } from './types.js';
import {
  asRandoxInt,
  pickArray,
  pickNumber,
  pickString,
  requireString,
  slotDateDayFirst,
  slotDateIsoMidnightZ,
  slotTimeOfDay,
  londonWallClock,
  toUtcIso,
} from './parse.js';
import type {
  RandoxServiceLocation,
  RandoxAvailabilitySlot,
  HoldAvailabilityBookingResponse,
  CreateRandoxBookingRequest,
  CreateRandoxBookingResponse,
  GetServiceLocationsWireRequest,
  AvailabilityDetailsWireRequest,
  HoldAvailabilityBookingWireRequest,
  CreateRandoxBookingWireRequest,
  CancelRandoxBookingWireRequest,
} from '../types.js';

/** Documented: a hold lasts 30 minutes. Used only when Randox don't tell us. */
const HOLD_DURATION_MS = 30 * 60 * 1000;

/**
 * ---------------------------------------------------------------------------
 * CLINIC BOOKING — BUILT FROM THE POSTMAN COLLECTION (Aug 2026).
 * ---------------------------------------------------------------------------
 *
 * In-clinic appointments only. Home-kit orders never touch this client (there
 * is no slot to book).
 *
 * WHAT CHANGED WHEN THE COLLECTION ARRIVED, and it was not a detail. Every
 * request body in this file used to be a guess — `{ serviceLocationId,
 * slotReference }` for a hold, `{ holdReference, startUtc }` for a booking —
 * read through tolerant helpers so that a wrong guess "degraded gracefully".
 * That reasoning is sound for a RESPONSE and worthless for a REQUEST: a
 * response we misread loses a field, and a request we misspell is refused
 * whole. Not one of the guessed names was right. The bodies below are the
 * collection's, literally.
 *
 * FIVE THINGS THE COLLECTION SETTLES THAT NOTHING ELSE DID:
 *
 *  1. EVERY BOOKING CALL IS POST, including GetServiceLocations and
 *     AvailabilityDetails, which read. Same rule as Nexus: takes a body, POST.
 *  2. A ServiceId IS REQUIRED, and there are exactly two of them in the world
 *     (787 UK / 788 ROI). Nothing the API returns tells you which — it is
 *     configuration. See bookingServiceId().
 *  3. THE SAME FIELD TAKES TWO DATE FORMATS in one flow: day-first on the
 *     hold, ISO-at-midnight on the create. Each endpoint gets its own.
 *  4. `AppointmentSlotTIme` is misspelled on the wire, in both calls.
 *  5. CANCEL TAKES A RANDOX INTEGER (`RandoxBookingOrderId`), not the string
 *     reference we had been inventing and not GPExternalNumber — so that id
 *     has to be captured at creation or a booking can never be cancelled.
 *
 * AND ONE THING IT CONTRADICTS: there is no RescheduleAppointment endpoint in
 * it. See the method at the bottom.
 *
 * RESPONSES ARE STILL ASSUMED. The collection carries no response examples at
 * all, so everything read below still goes through the tolerant helpers under
 * several plausible spellings. That asymmetry is deliberate and is the honest
 * state of this API: what we send is documented, what we receive is not.
 *
 * TIME IS UTC ON THE WIRE, EVERY TIME. Availability is documented UTC, the
 * slot fields carry the UTC wall clock (provable from the collection's own
 * AppointmentSlotId — see the note in parse.ts), and every timestamp crossing
 * this boundary goes through toUtcIso() or the slot formatters, never through
 * a local-time getter.
 */
export class LiveClinicBookingClient implements ClinicBookingClient {
  private readonly http = new RandoxHttpClient(bookingConnection());

  /**
   * POST /Locations/GetServiceLocations — `{ "ServiceId": 787 }`.
   * ServiceId as a NUMBER on this endpoint.
   */
  async getServiceLocations(): Promise<RandoxServiceLocation[]> {
    const body = await this.http.request<unknown>(CLINIC_BOOKING_ENDPOINTS.getServiceLocations.path, {
      method: CLINIC_BOOKING_ENDPOINTS.getServiceLocations.verb,
      body: { ServiceId: bookingServiceId() } satisfies GetServiceLocationsWireRequest,
    });

    return pickArray(body, 'serviceLocations', 'ServiceLocations', 'locations', 'Locations').map((raw) => ({
      id: requireString(raw, 'a service location id', 'locationId', 'LocationId', 'id', 'Id', 'serviceLocationId'),
      name: pickString(raw, 'name', 'Name', 'locationName', 'LocationName', 'siteName') ?? 'Unnamed location',
      addressLine1: pickString(raw, 'addressLine1', 'AddressLine1', 'address1', 'address'),
      city: pickString(raw, 'townCity', 'TownCity', 'city', 'City', 'town'),
      postcode: pickString(raw, 'postalCode', 'PostalCode', 'postcode', 'Postcode', 'postCode'),
      latitude: pickNumber(raw, 'latitude', 'Latitude', 'lat'),
      longitude: pickNumber(raw, 'longitude', 'Longitude', 'lng', 'long'),
    }));
  }

  /**
   * POST /Availability/AvailabilityDetails —
   * `{ "ServiceId": "787", "LocationId": 15, "SearchFrom": "...Z" }`.
   * ServiceId a STRING here and LocationId a NUMBER, which is the opposite way
   * round from the hold. Sent as this endpoint's own example types them.
   *
   * THERE IS NO SearchTo. The collection sends a single SearchFrom and nothing
   * bounds the other end, so `until` is applied HERE, to what came back,
   * rather than being invented as a request field. Filtering our own result is
   * honest; adding a parameter the API has never been shown to accept is not,
   * and an ignored unknown field would silently return months of slots.
   */
  async availabilityDetails(
    locationId: string,
    searchFromIsoDate: string,
    untilIsoDate?: string,
  ): Promise<RandoxAvailabilitySlot[]> {
    const numericLocationId = asRandoxInt(locationId);
    if (numericLocationId === null) {
      throw new Error(
        `Clinic Booking location id "${locationId}" is not an integer. AvailabilityDetails takes LocationId as a number.`,
      );
    }

    const body = await this.http.request<unknown>(CLINIC_BOOKING_ENDPOINTS.availabilityDetails.path, {
      method: CLINIC_BOOKING_ENDPOINTS.availabilityDetails.verb,
      body: {
        // STRING on this endpoint. Their example, not a conversion of ours.
        ServiceId: String(bookingServiceId()),
        LocationId: numericLocationId,
        SearchFrom: normaliseSearchFrom(searchFromIsoDate),
      } satisfies AvailabilityDetailsWireRequest,
    });

    // Inclusive of the whole `until` day: the caller passes a date, not an
    // instant, and "up to and including Friday" is what a date range means.
    const untilMs = untilIsoDate ? Date.parse(`${untilIsoDate.slice(0, 10)}T23:59:59.999Z`) : null;

    return pickArray(body, 'availability', 'Availability', 'availabilityDetails', 'slots', 'appointmentSlots')
      .map((raw): RandoxAvailabilitySlot | null => {
        const startUtc = toUtcIso(
          pickString(raw, 'appointmentSlotDateTime', 'AppointmentSlotDateTime', 'startUtc', 'StartUtc', 'start', 'startDateTime'),
        );
        if (!startUtc) return null;
        if (untilMs !== null && Date.parse(startUtc) > untilMs) return null;
        return {
          startUtc,
          endUtc: toUtcIso(pickString(raw, 'endUtc', 'EndUtc', 'end', 'endDateTime')),
          slotReference: requireString(
            raw,
            'the appointment slot id',
            'appointmentSlotId',
            'AppointmentSlotId',
            'slotId',
            'SlotId',
            'id',
          ),
          // Computed once, here, so nothing downstream has to know the zone —
          // and named `local` beside `startUtc` so the two cannot be confused.
          local: londonWallClock(startUtc),
        };
      })
      .filter((s): s is RandoxAvailabilitySlot => s !== null);
  }

  /**
   * POST /RandoxBookings/HoldAvailabilityBooking.
   *
   * ServiceId NUMBER, LocationId STRING, date day-first, time as UTC HH:mm,
   * and `AppointmentSlotTIme` spelled Randox's way. All four are this
   * endpoint's own example.
   */
  async holdAvailabilityBooking(
    locationId: string,
    slotReference: string,
    startUtc: string,
  ): Promise<HoldAvailabilityBookingResponse> {
    const body = await this.http.request<unknown>(CLINIC_BOOKING_ENDPOINTS.holdAvailabilityBooking.path, {
      method: CLINIC_BOOKING_ENDPOINTS.holdAvailabilityBooking.verb,
      body: {
        ServiceId: bookingServiceId(),
        LocationId: String(locationId),
        AppointmentSlotId: slotReference,
        AppointmentSlotDate: slotDateDayFirst(startUtc),
        AppointmentSlotTIme: slotTimeOfDay(startUtc),
      } satisfies HoldAvailabilityBookingWireRequest,
      // A hold is a race by nature: the slot can go between availability and
      // this call, and Randox refusing it is an outcome rather than a fault.
      windowedOperation: { name: 'HoldAvailabilityBooking', orderNumber: slotReference },
    });

    return {
      holdReference: requireString(
        body,
        'the hold reference',
        'holdReference',
        'HoldReference',
        'bookingId',
        'BookingId',
        'holdId',
        'reference',
        'id',
      ),
      expiresAtUtc:
        toUtcIso(pickString(body, 'expiresAtUtc', 'ExpiresAtUtc', 'expiresAt', 'holdExpiry', 'expiryDateTime')) ??
        new Date(Date.now() + HOLD_DURATION_MS).toISOString(),
      // CreateRandoxBooking sends BookingId and AppointmentId and the hold is
      // the only prior call that could have produced them. An inference, so
      // nullable by type — createRandoxBooking refuses without them rather
      // than sending a zero, which would book against somebody else's id.
      bookingId: pickNumber(body, 'bookingId', 'BookingId'),
      appointmentId: pickNumber(body, 'appointmentId', 'AppointmentId'),
    };
  }

  /**
   * POST /RandoxBookings/CreateRandoxBooking.
   *
   * The one call that ties the two APIs together: the Nexus order number goes
   * across as GPExternalNumber, which the flow diagram states in as many words
   * — "Important to send the Order Number captured above as the
   * GPExternalNumber".
   *
   * Note the date format differs from the hold, three lines above, for the
   * same conceptual field. Their inconsistency, faithfully reproduced.
   */
  async createRandoxBooking(request: CreateRandoxBookingRequest): Promise<CreateRandoxBookingResponse> {
    if (!request.gpExternalNumber || request.gpExternalNumber.trim() === '') {
      throw new Error(
        'CreateRandoxBooking requires the Nexus Order Number as GPExternalNumber. Without it the appointment is not ' +
          'joined to any laboratory order, which is the entire purpose of the call.',
      );
    }

    const wire: CreateRandoxBookingWireRequest = {
      BookingId: request.bookingId,
      AppointmentId: request.appointmentId,
      // Both STRINGS on this endpoint, and both numbers on others.
      ServiceId: String(bookingServiceId()),
      LocationId: String(request.serviceLocationId),
      AppointmentSlotId: request.slotReference,
      AppointmentSlotDate: slotDateIsoMidnightZ(request.startUtc),
      AppointmentSlotTIme: slotTimeOfDay(request.startUtc),
      FirstName: request.patient.firstName,
      LastName: request.patient.lastName,
      // "1990-01-01T00:00:00" in their example — no zone designator. A date of
      // birth is a calendar date and never an instant, so it is widened to
      // their form and never put through a timezone conversion.
      DateOfBirth: `${request.patient.dateOfBirth.slice(0, 10)}T00:00:00`,
      BiologicalSexId: request.patient.biologicalSexId,
      EmailAddress: request.patient.email,
      ConfirmEmailAddress: request.patient.email,
      ContactNumber: request.patient.contactNumber,
      AddressLine1: request.patient.addressLine1,
      AddressLine2: request.patient.addressLine2,
      TownCity: request.patient.townCity,
      PostalCode: request.patient.postalCode,
      CountryId: request.patient.countryId,
      // FALSE, DELIBERATELY, ALL THREE. Randox would be messaging our patient
      // directly about an appointment made through our portal, and consent to
      // that has not been asked for or recorded anywhere in this product. The
      // clinic communicates with its own patients.
      CommunicationPreferenceEmail: false,
      CommunicationPreferenceSMS: false,
      CommunicationPreferenceTelephone: false,
      GPExternalNumber: request.gpExternalNumber,
    };

    const body = await this.http.request<unknown>(CLINIC_BOOKING_ENDPOINTS.createRandoxBooking.path, {
      method: CLINIC_BOOKING_ENDPOINTS.createRandoxBooking.verb,
      body: wire,
      windowedOperation: { name: 'CreateRandoxBooking', orderNumber: request.gpExternalNumber },
      // A booking is a create. A 502 says nothing about whether it landed, and
      // a retried create is a second appointment for a real patient — the same
      // reasoning that makes CreatePendingOrder non-retryable.
      retryable: false,
    });

    return {
      bookingReference: requireString(
        body,
        'the booking reference',
        'randoxBookingOrderId',
        'RandoxBookingOrderId',
        'bookingReference',
        'BookingReference',
        'bookingId',
        'BookingId',
        'reference',
        'id',
      ),
      // The id CancelRandoxBooking takes. Read first under its own documented
      // name, because that is the field the cancel example names.
      randoxBookingOrderId: pickNumber(body, 'randoxBookingOrderId', 'RandoxBookingOrderId', 'bookingOrderId', 'orderId'),
      startUtc: toUtcIso(pickString(body, 'appointmentSlotDateTime', 'startUtc', 'StartUtc', 'start')) ?? request.startUtc,
      endUtc: toUtcIso(pickString(body, 'endUtc', 'EndUtc', 'end')),
    };
  }

  /**
   * POST /RandoxBookings/CancelRandoxBooking — `{ "RandoxBookingOrderId": 32285 }`.
   *
   * ONE FIELD, AND IT IS A RANDOX INTEGER. This used to send
   * `{ bookingReference, GPExternalNumber }`, neither of which appears in the
   * collection: a cancel that would have been refused every time, discovered
   * by the first patient who tried to cancel an appointment.
   */
  async cancelRandoxBooking(randoxBookingOrderId: number, orderNumber: string): Promise<void> {
    await this.http.request<unknown>(CLINIC_BOOKING_ENDPOINTS.cancelRandoxBooking.path, {
      method: CLINIC_BOOKING_ENDPOINTS.cancelRandoxBooking.verb,
      body: { RandoxBookingOrderId: randoxBookingOrderId } satisfies CancelRandoxBookingWireRequest,
      windowedOperation: { name: 'CancelRandoxBooking', orderNumber },
    });
  }

  /**
   * NOT AN ENDPOINT ANYONE HAS DOCUMENTED.
   *
   * This called `RandoxBookings/RescheduleAppointment`, described here as
   * documented. It is not in the Postman collection — the only
   * machine-readable list of this API's endpoints Randox have sent — and it is
   * not in the flow diagram, the auth document or either PDF. The path came
   * from somebody's recollection, and a path called on a recollection is a
   * feature that passes every test and 404s in production.
   *
   * NOT SILENTLY REIMPLEMENTED AS CANCEL-THEN-REBOOK either, tempting as that
   * is with all three calls documented: a second CreateRandoxBooking against
   * one GPExternalNumber may well be accepted, and two live appointments for
   * one order is a worse failure than no reschedule at all. Cancel and book
   * again is the right sequence and it is the CALLER's to run, with the
   * patient watching, in that order — hold the new slot first, so a failure
   * leaves the original appointment standing.
   *
   * On the list for Randox: is there a reschedule endpoint?
   */
  async rescheduleAppointment(): Promise<never> {
    throw new RandoxUnsupportedOperationError(
      'RescheduleAppointment',
      'The Clinic Booking API documents no reschedule endpoint — it is absent from the Postman collection, the flow ' +
        'diagram and both auth documents. Cancel the appointment and book the new slot instead, holding the new slot ' +
        'first so a failure leaves the existing appointment in place.',
    );
  }
}

/**
 * SearchFrom, in the form the example uses: "2025-09-10T00:00:00.000Z".
 *
 * A bare "2025-09-10" is widened to midnight UTC rather than being handed to
 * `new Date()` as-is anywhere downstream — a date with no zone is read as
 * local, which on a UK server in summer starts the search an hour into the
 * previous day and can drop the first slot of the range.
 */
function normaliseSearchFrom(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T00:00:00.000Z`;
  // toUtcIso yields exactly the example's shape — toISOString always carries
  // three fractional digits and a literal Z — so there is nothing to reformat.
  const iso = toUtcIso(trimmed);
  if (!iso) {
    throw new Error(`"${value}" is not a usable SearchFrom date. Expected yyyy-mm-dd or an ISO-8601 instant.`);
  }
  return iso;
}
