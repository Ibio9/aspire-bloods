/**
 * ---------------------------------------------------------------------------
 * WHAT THE CLINIC BOOKING API SENDS BACK — SIX GUESSES AND ONE SCHEMA.
 * ---------------------------------------------------------------------------
 *
 * The Postman collection gives every REQUEST body literally and gives no
 * response examples at all: the `response` array on every item is empty. The
 * OpenAPI definition's responses are `{statusCode, message}` envelopes rather
 * than payloads — with ONE exception, `RescheduleAppointmentResponse`, which is
 * a real schema and is the only documented Clinic Booking response there is.
 *
 * So six of the payloads in this file are INVENTED and one follows a document,
 * and that distinction is the point of keeping them here rather than in the
 * server:
 *
 *   bookingSpecServer.ts   generated from the documents. Enforces what we SEND.
 *   this file              fixtures. Describes what we GUESS is sent back.
 *
 * A test that fails against the server is a real contract failure. A test that
 * fails against these is a fixture disagreeing with a guess, and both should be
 * re-read when the real response shapes arrive.
 *
 * The field names are chosen to be the ones the requests themselves use —
 * `AppointmentSlotId`, `BookingId`, `RandoxBookingOrderId` — on the reasoning
 * that an API is usually consistent between what it accepts and what it
 * returns. That is a reasonable guess and it is still a guess, which is exactly
 * why the client reads all of them through the tolerant helpers.
 *
 * WHAT IS NOT INVENTED, and is modelled because it is documented or known:
 *   · availability comes back UTC (flow diagram)
 *   · a hold lasts 30 minutes (flow diagram)
 *   · the sandbox location with real availability is 30, Clinic Location
 *     Crumlin, and the collection's own 15 may have none (Chris Caulfield)
 *   · a slot is {Id, Date, Time, AvailableQuantity} in a bare top-level array,
 *     with the wall clock repeated inside the id — observed, Aug 2026
 *
 * NOTHING REAL IS IN HERE.
 */

/** Chris Caulfield, Aug 2026: the sandbox location that actually has slots. */
export const SANDBOX_LOCATION_ID = 30;
export const SANDBOX_LOCATION_NAME = 'Clinic Location Crumlin';

/** The collection's own location. Randox warn it may have no availability. */
export const COLLECTION_LOCATION_ID = 15;

export const UK_SERVICE_ID = 787;
export const ROI_SERVICE_ID = 788;

/** The order number the booking flow carries across as GPExternalNumber. */
export const FIXTURE_GP_EXTERNAL_NUMBER = 'GC1123-00000091';

/**
 * A day with slots on it. Fixed rather than "tomorrow": a fixture that moves
 * with the clock is a fixture that fails one day a year at a DST boundary and
 * nobody can reproduce it.
 *
 * 16 October 2025 deliberately — the collection's own date, and inside BST, so
 * any test built on it distinguishes the UTC wall clock from the London one.
 * At 09:30Z the London clock reads 10:30.
 */
export const FIXTURE_SLOT_DAY = '2025-10-16';

/**
 * THE SHAPE RANDOX ACTUALLY RETURN (observed Aug 2026), which is not the one
 * this fixture used to model.
 *
 * A slot is `{Id, Date, Time, AvailableQuantity}` — a day-first date and a bare
 * HH:mm, no combined datetime, no offset, no epoch — and the id is
 * `slot-room33-2026-08-17T07:00-staff19`, carrying the same wall clock. The
 * `72164:72164::1760607000:` form is the Postman collection's and has never
 * been seen on the wire.
 *
 * That gap is exactly what this fixture failed to catch: the client read five
 * invented field names, found none of them, and turned 114 real slots into an
 * empty diary — while every test here passed, because the fixture was answering
 * with the names the client was asking for.
 */
function slotAt(hhmm: string): { id: string; startUtc: string; date: string; time: string } {
  const startUtc = `${FIXTURE_SLOT_DAY}T${hhmm}:00.000Z`;
  const [yyyy, mm, dd] = FIXTURE_SLOT_DAY.split('-');
  return {
    id: `slot-room33-${FIXTURE_SLOT_DAY}T${hhmm}-staff19`,
    startUtc,
    date: `${dd}/${mm}/${yyyy}`,
    time: hhmm,
  };
}

export const FIXTURE_SLOTS = ['09:00', '09:30', '10:00', '10:30', '11:00'].map(slotAt);

/** The one the collection's own example holds and books: 09:30Z. */
export const FIXTURE_SLOT = FIXTURE_SLOTS[1];

interface Hold {
  bookingId: number;
  appointmentId: number;
  slotId: string;
  expiresAt: number;
  consumed: boolean;
}

/**
 * The mock's state machine.
 *
 * It models the four things that genuinely go wrong in this flow and that our
 * code has to survive, because each one is a normal outcome rather than a
 * fault: a slot taken between availability and hold, a hold that lapses, a
 * booking that fails after a hold, and a cancel of something already gone.
 */
export class BookingState {
  private readonly holds = new Map<number, Hold>();
  private readonly bookings = new Map<
    number,
    { appointmentId: number; slotId: string; gpExternalNumber: string; cancelled: boolean }
  >();
  private readonly taken = new Set<string>();
  private counter = 0;

  /** Test hooks, set through the server's override or directly. */
  slotsTaken = new Set<string>();
  holdsExpireImmediately = false;
  nextBookingFails = false;
  /** The next hold is REFUSED inside a 200, which is a thing this API does. */
  holdSoftFails = false;

  respond(routePath: string, body: unknown): { status: number; payload: unknown } {
    const request = (body ?? {}) as Record<string, unknown>;

    switch (routePath) {
      case 'Locations/GetServiceLocations':
        return { status: 200, payload: this.locations(Number(request.ServiceId)) };

      case 'Availability/AvailabilityDetails':
        return { status: 200, payload: this.availability(Number(request.LocationId), String(request.SearchFrom)) };


      case 'RandoxBookings/HoldAvailabilityBooking':
        return this.hold(String(request.AppointmentSlotId));

      case 'RandoxBookings/CreateRandoxBooking':
        return this.create(request);

      case 'RandoxBookings/RescheduleAppointment':
        return this.reschedule(Number(request.appointmentId), String(request.newAppointmentSlotId));

      case 'RandoxBookings/CancelRandoxBooking':
        return this.cancel(Number(request.RandoxBookingOrderId));

      case 'RandoxServices/GetServiceRegions':
        // OBSERVED: a bare top-level array of {Id, Name, CurrencyCode,
        // DisplayOrder}, eight of them. The CurrencyCode is UK/ROI, which
        // resembles the 787/788 ServiceId choice and is not it — a region
        // groups clinic locations (each carries a RegionId) and nothing
        // published relates the two.
        return {
          status: 200,
          payload: [
            { Id: 3, Name: 'Northern Ireland', CurrencyCode: 'UK', DisplayOrder: 9999 },
            { Id: 6, Name: 'Southern Ireland', CurrencyCode: 'ROI', DisplayOrder: 9999 },
          ],
        };

      default:
        return { status: 500, payload: { statusCode: '500', message: `No fixture for ${routePath}.` } };
    }
  }

  /**
   * OBSERVED: a bare top-level array, `Id` as a STRING, and a `RegionId` and
   * `Country` alongside the address. 51 of them in the sandbox; two here.
   *
   * The real Crumlin entry is used verbatim, address and coordinates included —
   * a clinic address is not patient data and a fixture that matches the wire is
   * worth more than an invented one.
   */
  private locations(serviceId: number) {
    if (serviceId !== UK_SERVICE_ID && serviceId !== ROI_SERVICE_ID) {
      // A wrong ServiceId is an empty list rather than an error, which is the
      // quietest possible failure and therefore the one worth modelling: the
      // caller must not read "no clinics" as "no clinics near you".
      return [];
    }
    return [
      {
        Id: String(SANDBOX_LOCATION_ID),
        Name: 'Crumlin',
        DisplayOrder: 80,
        RegionId: 3,
        AddressLine1: '15 Mill Road',
        AddressLine2: 'Crumlin',
        TownCity: 'Crumlin',
        PostalCode: 'BT29 4XL',
        Country: 'UK',
        Latitude: 54.621036143511,
        Longitude: -6.214933209888,
      },
      {
        Id: String(COLLECTION_LOCATION_ID),
        Name: 'Clinic Location Fifteen',
        DisplayOrder: 15,
        RegionId: 3,
        AddressLine1: '2 Example Road',
        AddressLine2: ' ',
        TownCity: 'Belfast',
        PostalCode: 'BT1 1AA',
        Country: 'UK',
        Latitude: 54.5973,
        Longitude: -5.9301,
      },
    ];
  }

  private availability(locationId: number, searchFrom: string) {
    // Location 15 has an empty diary, exactly as Randox warn. A legitimate
    // answer, and one a caller must not read as a failure.
    if (locationId === COLLECTION_LOCATION_ID) return [];
    if (locationId !== SANDBOX_LOCATION_ID) return [];

    const from = Date.parse(searchFrom);
    // A BARE TOP-LEVEL ARRAY, and the observed field names. Both confirmed
    // against the sandbox; the wrapped `{availability: [...]}` shape was a
    // guess, and so was every key inside it.
    return FIXTURE_SLOTS.filter(
      (s) => !this.taken.has(s.id) && !this.slotsTaken.has(s.id) && (Number.isNaN(from) || Date.parse(s.startUtc) >= from),
    ).map((s) => ({
      Id: s.id,
      Date: s.date,
      Time: s.time,
      AvailableQuantity: 1,
    }));
  }

  private hold(slotId: string): { status: number; payload: unknown } {
    if (this.taken.has(slotId) || this.slotsTaken.has(slotId)) {
      // The slot went between availability and hold. 409 with wording
      // looksLikeWindowExpired recognises, so it arrives as a closed window
      // rather than as a fault — which is what it is.
      return {
        status: 409,
        payload: {
          statusCode: '409',
          message: 'That appointment slot is no longer available — it was taken while it was being held.',
        },
      };
    }

    this.counter += 1;
    const id = 87819 + this.counter;
    const expiresAt = Date.now() + (this.holdsExpireImmediately ? -1_000 : 30 * 60 * 1000);
    this.holds.set(id, { bookingId: id, appointmentId: id, slotId, expiresAt, consumed: false });

    // THE OBSERVED ENVELOPE, and it is not what this fixture used to return.
    // A real hold answers `{BookingId, SuccessFailCode, FailureDescription,
    // NewAppointmentDateTime}` — the same four fields the OpenAPI file declares
    // only on RescheduleAppointment. Three things follow, and the fixture has
    // to model all of them or it hides each one:
    //
    //  · ONE id comes back, not two. The create wants BookingId AND
    //    AppointmentId, and sending it without the second is
    //    `400 "Randox Booking failure, invalid appointment id."`
    //  · NO expiry is stated, so the documented 30 minutes is a client-side
    //    deadline and the client's fallback is what production uses.
    //  · A hold can REFUSE inside a 200 (see `holdSoftFails`), which the old
    //    fixture could not express at all.
    if (this.holdSoftFails) {
      this.holdSoftFails = false;
      return {
        status: 200,
        payload: {
          BookingId: null,
          SuccessFailCode: 'Fail',
          FailureDescription: 'That appointment slot is no longer available.',
          NewAppointmentDateTime: null,
        },
      };
    }

    return {
      status: 200,
      payload: {
        BookingId: id,
        SuccessFailCode: 'Success',
        FailureDescription: null,
        NewAppointmentDateTime: null,
      },
    };
  }

  private create(request: Record<string, unknown>): { status: number; payload: unknown } {
    const bookingId = Number(request.BookingId);
    const hold = this.holds.get(bookingId);
    if (!hold) {
      return { status: 409, payload: { statusCode: '409', message: 'That hold is no longer valid.' } };
    }
    if (hold.consumed || Date.now() > hold.expiresAt) {
      return {
        status: 409,
        payload: {
          statusCode: '409',
          message: 'The 30-minute hold on this slot has expired. The appointment was not booked.',
        },
      };
    }
    if (this.nextBookingFails) {
      this.nextBookingFails = false;
      // 500, NOT a closed window: this is the case where Randox fall over
      // after a hold was placed, and the caller must not report it to a patient
      // as "that slot has gone" when the slot is still theirs for 30 minutes.
      return { status: 500, payload: { statusCode: '500', message: 'Internal error.' } };
    }

    hold.consumed = true;
    this.taken.add(hold.slotId);
    const randoxBookingOrderId = 32285 + this.counter;
    this.bookings.set(randoxBookingOrderId, {
      appointmentId: Number(request.AppointmentId),
      slotId: hold.slotId,
      gpExternalNumber: String(request.GPExternalNumber ?? ''),
      cancelled: false,
    });

    // THE OBSERVED CREATE RESPONSE. Note `SuccessFailCode: 0` — a NUMBER here
    // and the string "Success" on the hold, the reschedule and the cancel, in
    // one flow. Modelled rather than tidied, because that inconsistency is the
    // thing a reader of this fixture needs to know.
    return {
      status: 200,
      payload: {
        BookingId: bookingId,
        RandoxBookingOrderId: randoxBookingOrderId,
        RandoxBookingAppointmentId: bookingId,
        SuccessFailCode: 0,
        FailureDescription: null,
      },
    };
  }

  /**
   * RescheduleAppointment — AND THE ONLY CALL ON EITHER API THAT REFUSES INSIDE
   * A 200.
   *
   * That is why the failure branches below answer 200 with a `SuccessFailCode`
   * rather than a 4xx. It is not a convenience of the fixture: the spec's
   * response schema carries `SuccessFailCode` and `FailureDescription` beside
   * the new booking id, which only makes sense if a refusal can arrive as a
   * success at the HTTP layer. A client that reads the status and stops would
   * tell a patient their appointment moved when it did not, and the ONLY way to
   * catch that in a test is for the mock to actually do it.
   *
   * The shape follows the spec's example (PascalCase, a null
   * FailureDescription on success, a .NET round-trip datetime); the VALUES are
   * invented, and the two failure sentences are ours.
   */
  private reschedule(appointmentId: number, newSlotId: string): { status: number; payload: unknown } {
    const fail = (description: string) => ({
      status: 200,
      payload: {
        BookingId: null,
        SuccessFailCode: 'Fail',
        FailureDescription: description,
        NewAppointmentDateTime: null,
      },
    });

    const entry = [...this.bookings.entries()].find(([, b]) => b.appointmentId === appointmentId && !b.cancelled);
    if (!entry) return fail('No active appointment was found for that appointment id.');

    const [randoxBookingOrderId, booking] = entry;
    const slot = FIXTURE_SLOTS.find((s) => s.id === newSlotId);
    if (!slot) return fail('That appointment slot id was not recognised.');
    if (this.taken.has(newSlotId) || this.slotsTaken.has(newSlotId)) {
      // The reschedule takes no hold, so this is the race it cannot avoid.
      return fail('That appointment slot is no longer available.');
    }

    this.taken.delete(booking.slotId);
    this.taken.add(newSlotId);
    booking.slotId = newSlotId;
    // OBSERVED: the booking id did NOT change on a real reschedule (87820 in,
    // 87820 out), where the spec's example shows 87556 -> 87608. Modelled as
    // unchanged, which is what was seen; a caller must not rely on either.
    const newBookingId = booking.appointmentId;

    return {
      status: 200,
      payload: {
        BookingId: newBookingId,
        SuccessFailCode: 'Success',
        FailureDescription: null,
        // NO TIMEZONE, observed: Randox echo the wall clock they were given
        // ("2026-08-17T07:30:00"). toUtcIso appends Z absent a zone.
        NewAppointmentDateTime: slot.startUtc.replace(/\.\d+Z$/, ''),
        RandoxBookingOrderId: randoxBookingOrderId,
      },
    };
  }

  private cancel(randoxBookingOrderId: number): { status: number; payload: unknown } {
    const booking = this.bookings.get(randoxBookingOrderId);
    if (!booking || booking.cancelled) {
      return {
        status: 409,
        payload: { statusCode: '409', message: 'That booking is no longer active and cannot be cancelled.' },
      };
    }
    booking.cancelled = true;
    this.taken.delete(booking.slotId);
    // Observed. The cancel carries the envelope too, so a cancel can refuse
    // inside a 200 exactly as the other three mutations can.
    return {
      status: 200,
      payload: { RandoxBookingOrderId: randoxBookingOrderId, SuccessFailCode: 'Success', FailureDescription: null },
    };
  }

  /** What the fixture believes, for a test that wants to assert on state. */
  bookingFor(randoxBookingOrderId: number) {
    return this.bookings.get(randoxBookingOrderId) ?? null;
  }
}
