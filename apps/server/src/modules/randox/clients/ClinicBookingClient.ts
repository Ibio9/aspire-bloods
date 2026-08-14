import { RandoxHttpClient } from '../http/RandoxHttpClient.js';
import { bookingConnection, bookingServiceId } from '../config.js';
import { CLINIC_BOOKING_ENDPOINTS } from '../endpoints.js';
import { RandoxApiError, RandoxWindowExpiredError, looksLikeWindowExpired } from '../errors.js';
import type { ClinicBookingClient } from './types.js';
import {
  asRandoxInt,
  pickArray,
  pickNumber,
  pickString,
  requireString,
  bookingOutcomeSucceeded,
  slotDateDayFirst,
  slotInstantFromWireParts,
  slotDateIsoMidnightZ,
  slotTimeOfDay,
  londonWallClock,
  toUtcIso,
} from './parse.js';
import type {
  RandoxServiceLocation,
  RandoxServiceRegion,
  RandoxAvailabilitySlot,
  HoldAvailabilityBookingResponse,
  CreateRandoxBookingRequest,
  CreateRandoxBookingResponse,
  RescheduleAppointmentResponse,
  GetServiceLocationsWireRequest,
  AvailabilityDetailsWireRequest,
  HoldAvailabilityBookingWireRequest,
  CreateRandoxBookingWireRequest,
  CancelRandoxBookingWireRequest,
  RescheduleAppointmentWireRequest,
} from '../types.js';

/** Documented: a hold lasts 30 minutes. Used only when Randox don't tell us. */
const HOLD_DURATION_MS = 30 * 60 * 1000;

/**
 * ---------------------------------------------------------------------------
 * CLINIC BOOKING — SURFACE FROM THE SPEC, BODIES FROM THE COLLECTION.
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
 *  4. `AppointmentSlotTIme` is spelled with a capital I on the wire, in both
 *     calls — a case variant rather than the misspelling it was taken for.
 *  5. CANCEL TAKES A RANDOX INTEGER (`RandoxBookingOrderId`), not the string
 *     reference we had been inventing and not GPExternalNumber — so that id
 *     has to be captured at creation or a booking can never be cancelled.
 *
 * ── WHAT THE OpenAPI DEFINITION THEN CHANGED (Aug 2026) ───────────────────
 *
 * specs/clinic-booking-openapi3.json is the portal's own definition, and it
 * moved the SURFACE without moving the bodies:
 *
 *  · `BiologicalSex/GetBiologicalSex` IS NOT AN OPERATION. It was called in the
 *    sandbox on the strength of the auth document's worked example and answered
 *    404. This client never called it — the ids come from configuration — but
 *    the sandbox pass used it as its cheap credential probe, and a probe that
 *    404s proves nothing. GetServiceRegions is that probe now.
 *  · `RescheduleAppointment` IS SPECIFIED, with four required fields and a
 *    response schema, so it is implemented below instead of throwing.
 *  · `GetServiceRegions` is new and is in no document we held before.
 *
 * It did NOT displace the collection's request bodies, and the reason is in
 * endpoints.ts: the spec's examples are older and internally incoherent (a
 * ServiceId of 488, a date in the time field, no GPExternalNumber on the
 * create). Definition for the surface, collection for the bodies.
 *
 * RESPONSES ARE STILL ASSUMED, for six of the seven. The collection carries no
 * response examples at all and the spec's are `{statusCode, message}`
 * envelopes rather than payloads, so everything read below still goes through
 * the tolerant helpers under several plausible spellings. RescheduleAppointment
 * is the single exception and is read tolerantly anyway — one undated example
 * with a null in it is not a contract.
 *
 * TIME IS UTC ON THE WIRE, EVERY TIME. Availability is documented UTC, and
 * every timestamp crossing this boundary goes through toUtcIso() or the slot
 * formatters, never through a local-time getter.
 *
 * AND A SLOT IS TWO STRINGS, NOT AN INSTANT (observed Aug 2026). The sandbox
 * returns `{Id, Date, Time, AvailableQuantity}` with no combined datetime, no
 * offset and no epoch — so every slot field this client used to read was
 * invented, and 114 real slots parsed as an empty diary. Reading Date and Time
 * as UTC is what makes the hold echo Randox's own two strings back unchanged,
 * which is the only property that cannot be wrong. See
 * `slotInstantFromWireParts` in parse.ts for the whole argument and for the one
 * question it leaves open.
 */
export class LiveClinicBookingClient implements ClinicBookingClient {
  private readonly http = new RandoxHttpClient(bookingConnection());

  /**
   * GET /RandoxServices/GetServiceRegions — no body, no parameters.
   *
   * THE CHEAP PROOF THAT THE CREDENTIALS WORK. It touches no order, creates
   * nothing and leaves nothing to clean up, and it fails for exactly the same
   * reasons a bad subscription key or a bad B2C scope fails — which is what
   * makes it worth having as a probe. Nothing in the booking flow needs it: a
   * ServiceId is configuration (787/788), not something to look up here.
   */
  async getServiceRegions(): Promise<RandoxServiceRegion[]> {
    const body = await this.http.request<unknown>(CLINIC_BOOKING_ENDPOINTS.getServiceRegions.path, {
      method: CLINIC_BOOKING_ENDPOINTS.getServiceRegions.verb,
    });

    // A bare top-level array — CONFIRMED against the sandbox, and the same
    // shape all eight Nexus reference endpoints return. `pickArray` takes that
    // as its first case; the wrapped form is still handled.
    // Observed: {Id, Name, CurrencyCode, DisplayOrder}, eight regions.
    return pickArray(body, 'serviceRegions', 'ServiceRegions', 'regions', 'Regions').map((raw) => ({
      id: requireString(raw, 'a service region id', 'regionId', 'RegionId', 'id', 'Id', 'serviceRegionId'),
      name: pickString(raw, 'name', 'Name', 'regionName', 'RegionName') ?? 'Unnamed region',
      currencyCode: pickString(raw, 'currencyCode', 'CurrencyCode'),
    }));
  }

  /**
   * POST /Locations/GetServiceLocations — `{ "ServiceId": 787 }`.
   * ServiceId as a NUMBER on this endpoint. The one field both documents type
   * identically and give the same value for.
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
        // OBSERVED, AND NOT WHAT WAS GUESSED. A slot is
        // `{Id, Date, Time, AvailableQuantity}` — a day-first date and a bare
        // HH:mm in two separate fields, with no combined datetime anywhere.
        // The old reader looked for `appointmentSlotDateTime` and four other
        // invented names, found none, and dropped every slot: 114 of them came
        // back as an empty diary. The full note is on
        // `slotInstantFromWireParts` in parse.ts.
        const wireDate = pickString(raw, 'date', 'Date', 'appointmentSlotDate', 'AppointmentSlotDate');
        const wireTime = pickString(raw, 'time', 'Time', 'appointmentSlotTime', 'AppointmentSlotTime');
        const startUtc =
          slotInstantFromWireParts(wireDate, wireTime) ??
          // The collection's older shape, kept because the two documents show
          // two formats and only one of them has been seen on the wire.
          toUtcIso(
            pickString(raw, 'appointmentSlotDateTime', 'AppointmentSlotDateTime', 'startUtc', 'StartUtc', 'start'),
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
          // Randox's own strings, untouched. The hold sends these two fields
          // back and the formatters that build them are the identity on this
          // reading — so a test can prove the request equals the response.
          wireDate: wireDate ?? slotDateDayFirst(startUtc),
          wireTime: wireTime ?? slotTimeOfDay(startUtc),
          availableQuantity: pickNumber(raw, 'availableQuantity', 'AvailableQuantity'),
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

    assertBookingOutcome(body, CLINIC_BOOKING_ENDPOINTS.holdAvailabilityBooking.path, slotReference);

    const bookingId = pickNumber(body, 'bookingId', 'BookingId');

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
      bookingId,
      /**
       * THE HOLD RETURNS ONE ID AND THE CREATE WANTS TWO.
       *
       * Observed: a successful hold answers `{"BookingId": 87819, ...}` and
       * carries no AppointmentId at all. CreateRandoxBooking requires both, and
       * sending it without one is not a soft failure — Randox answer
       * `400 "Randox Booking failure, invalid appointment id."`, which is how
       * this was found.
       *
       * So the two are the same number, and that is evidence rather than
       * convenience: the collection's own example sends `"BookingId": 1144015,
       * "AppointmentId": 1144015` — the identical value twice — and the hold,
       * which is the only call before the create that could produce either,
       * returns exactly one id. Randox's own error names the field that was
       * missing, which is as close to confirmation as this API gets.
       *
       * Still nullable by type, and `createRandoxBooking` still refuses rather
       * than sending a zero: booking against somebody else's appointment id is
       * worse than not booking.
       */
      appointmentId: pickNumber(body, 'appointmentId', 'AppointmentId') ?? bookingId,
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

    // A CREATE CAN REFUSE INSIDE A 200, and reading that as a success writes an
    // appointment the patient does not have and then tells them to come in.
    assertBookingOutcome(body, CLINIC_BOOKING_ENDPOINTS.createRandoxBooking.path, request.gpExternalNumber);

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
      startUtc:
        toUtcIso(
          pickString(body, 'newAppointmentDateTime', 'NewAppointmentDateTime', 'appointmentSlotDateTime', 'startUtc', 'start'),
        ) ?? request.startUtc,
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
    const body = await this.http.request<unknown>(CLINIC_BOOKING_ENDPOINTS.cancelRandoxBooking.path, {
      method: CLINIC_BOOKING_ENDPOINTS.cancelRandoxBooking.verb,
      body: { RandoxBookingOrderId: randoxBookingOrderId } satisfies CancelRandoxBookingWireRequest,
      windowedOperation: { name: 'CancelRandoxBooking', orderNumber },
    });

    // The cancel carries the envelope too — observed:
    // `{"RandoxBookingOrderId":22560,"SuccessFailCode":"Success","FailureDescription":null}`.
    // A cancel silently read as done is an appointment still on Randox's diary
    // and a slot nobody can rebook.
    assertBookingOutcome(body, CLINIC_BOOKING_ENDPOINTS.cancelRandoxBooking.path, orderNumber);
  }

  /**
   * POST /RandoxBookings/RescheduleAppointment.
   *
   * IT IS CALLABLE AT LAST, AND PRODUCTION DOES NOT CALL IT YET. Both halves of
   * that matter.
   *
   * This method threw `RandoxUnsupportedOperationError` for two revisions, and
   * the reason was always the SHAPE and never the existence: Randox named the
   * endpoint on page 3 of the Corporate Customer API Flow (1-Nov-24) and
   * published no path, verb or field for it, and a guessed request on this API
   * is refused whole. specs/clinic-booking-openapi3.json now gives all of it —
   * and gives it better than any other operation here, as a `required` list of
   * four rather than as an example somebody once sent.
   *
   * WHAT IS STILL UNKNOWN IS THE ANSWER. `SuccessFailCode` reports a refusal
   * inside a 200, which nothing else on either API does, so a wrong reading
   * here tells a patient their appointment moved when it did not — and the only
   * evidence for how it is spelled in practice is one example with a null in
   * it. `bookingOutcomeSucceeded()` treats anything not recognisably affirmative
   * as a failure, which is the safe direction, and the sandbox pass calls this
   * so a real body can be read.
   *
   * THE ENVELOPE IS NOT THIS OPERATION'S. The spec declares it here and only
   * here, and HoldAvailabilityBooking answers with the same four fields — so
   * the same judgement is made on the hold, in the same helper.
   *
   * SO bookingService.rescheduleBooking STILL COMPOSES hold → create → cancel.
   * That is not caution for its own sake: this endpoint takes no hold, so there
   * is no way to find out whether the new slot is free before committing to
   * moving somebody off a slot they already have. The composed path is safe
   * under every answer. Switch it once a capture shows what this returns.
   */
  async rescheduleAppointment(
    appointmentId: number,
    serviceLocationId: string,
    newSlotReference: string,
  ): Promise<RescheduleAppointmentResponse> {
    const numericLocationId = asRandoxInt(serviceLocationId);
    if (numericLocationId === null) {
      throw new Error(
        `Clinic Booking location id "${serviceLocationId}" is not an integer. RescheduleAppointment declares ` +
          'locationId as an integer, and it is one of its four required fields.',
      );
    }

    const body = await this.http.request<unknown>(CLINIC_BOOKING_ENDPOINTS.rescheduleAppointment.path, {
      method: CLINIC_BOOKING_ENDPOINTS.rescheduleAppointment.verb,
      // camelCase and all four fields, exactly as the spec's schema declares
      // them — it is the only document that spells this request at all.
      body: {
        appointmentId,
        serviceId: bookingServiceId(),
        locationId: numericLocationId,
        newAppointmentSlotId: newSlotReference,
      } satisfies RescheduleAppointmentWireRequest,
      windowedOperation: { name: 'RescheduleAppointment', orderNumber: newSlotReference },
      // A reschedule moves a real appointment. A 502 says nothing about whether
      // it landed, and a retry could move somebody twice — the same reasoning
      // that makes CreateRandoxBooking and CreatePendingOrder non-retryable.
      retryable: false,
    });

    // NOT `assertBookingOutcome`: a reschedule reports its outcome UPWARD as a
    // value rather than by throwing, because the caller has an old appointment
    // to reason about and needs to hear "it did not move" as an answer.
    const successFailCode = pickString(body, 'successFailCode', 'SuccessFailCode', 'successCode', 'status');
    const failureDescription = pickString(body, 'failureDescription', 'FailureDescription', 'message', 'error');

    return {
      bookingId: pickNumber(body, 'bookingId', 'BookingId'),
      succeeded: bookingOutcomeSucceeded(successFailCode, failureDescription),
      successFailCode,
      failureDescription,
      newStartUtc: toUtcIso(
        pickString(body, 'newAppointmentDateTime', 'NewAppointmentDateTime', 'appointmentSlotDateTime', 'startUtc'),
      ),
    };
  }
}

/**
 * ---------------------------------------------------------------------------
 * EVERY CLINIC BOOKING MUTATION CAN REFUSE INSIDE A 200, SO EVERY ONE IS READ.
 * ---------------------------------------------------------------------------
 *
 * OBSERVED against the sandbox (Aug 2026). All four mutations answer with the
 * same envelope, and the OpenAPI file declares it on ONE of them:
 *
 *   hold        {BookingId, SuccessFailCode: "Success", FailureDescription,
 *                NewAppointmentDateTime}
 *   create      {BookingId, RandoxBookingOrderId, RandoxBookingAppointmentId,
 *                SuccessFailCode: 0, FailureDescription}
 *   reschedule  {BookingId, SuccessFailCode: "Success", FailureDescription,
 *                NewAppointmentDateTime}
 *   cancel      {RandoxBookingOrderId, SuccessFailCode: "Success",
 *                FailureDescription}
 *
 * So `RescheduleAppointmentResponse` is the shared shape rather than that
 * operation's own, and **the transport does not throw on any of these** — a
 * refusal is an HTTP 200 with a word in a field. Read as a success, a failed
 * create writes an appointment nobody has, and the patient is told to come in.
 * That is the single worst outcome available on this API, and the only thing
 * standing in front of it is this function.
 *
 * **`SuccessFailCode` IS `"Success"` ON THREE OF THEM AND `0` ON THE CREATE** —
 * a different type AND a different vocabulary within one flow. `pickString`
 * coerces the number, and `"0"` is in the success set, so both read. Do not
 * "tidy" that by making the set strings only.
 *
 * A failure that reads like a lost slot becomes a closed window, so the caller
 * says "that time has gone, choose another" rather than showing an error page.
 * Everything else is a fault. And `bookingOutcomeSucceeded` defaults to
 * FAILURE, so an unrecognised word is refused rather than waved through.
 */
function assertBookingOutcome(body: unknown, endpointPath: string, reference: string): void {
  const successFailCode = pickString(body, 'successFailCode', 'SuccessFailCode');
  const failureDescription = pickString(body, 'failureDescription', 'FailureDescription');
  // Absent entirely: nothing to judge. Only the four mutations carry it, and a
  // future endpoint that does not is not thereby a failure.
  if (successFailCode === null) return;
  if (bookingOutcomeSucceeded(successFailCode, failureDescription)) return;

  const detail = failureDescription ?? `Randox answered "${successFailCode}".`;
  const operation = endpointPath.split('/').pop() ?? endpointPath;
  if (looksLikeWindowExpired(409, detail)) {
    throw new RandoxWindowExpiredError(operation, reference, detail);
  }
  throw new RandoxApiError(`${operation} was refused: ${detail}`, 200, endpointPath, JSON.stringify(body));
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
