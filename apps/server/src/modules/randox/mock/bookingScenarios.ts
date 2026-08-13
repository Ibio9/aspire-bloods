/**
 * ---------------------------------------------------------------------------
 * WHAT THE CLINIC BOOKING API SENDS BACK — WHICH NOBODY HAS DOCUMENTED.
 * ---------------------------------------------------------------------------
 *
 * The Postman collection gives every REQUEST body literally and gives no
 * response examples at all: the `response` array on all six items is empty.
 * So every payload in this file is INVENTED, and that distinction is the point
 * of keeping it in its own file rather than mixing it into the server:
 *
 *   bookingSpecServer.ts   generated from the document. Enforces what we SEND.
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
 *   · a slot id embeds the slot's epoch, e.g. "72164:72164::1760607000:",
 *     which decodes to the exact UTC time the collection then sends
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

function slotAt(hhmm: string): { id: string; startUtc: string } {
  const startUtc = `${FIXTURE_SLOT_DAY}T${hhmm}:00.000Z`;
  const epoch = Math.floor(Date.parse(startUtc) / 1000);
  // The real id's shape, epoch included — see the note in clients/parse.ts.
  return { id: `72164:72164::${epoch}:`, startUtc };
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
  private readonly bookings = new Map<number, { slotId: string; gpExternalNumber: string; cancelled: boolean }>();
  private readonly taken = new Set<string>();
  private counter = 0;

  /** Test hooks, set through the server's override or directly. */
  slotsTaken = new Set<string>();
  holdsExpireImmediately = false;
  nextBookingFails = false;

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

      case 'RandoxBookings/CancelRandoxBooking':
        return this.cancel(Number(request.RandoxBookingOrderId));

      case 'BiologicalSex/GetBiologicalSex':
        return {
          status: 200,
          payload: [
            { id: '1', name: 'Male' },
            { id: '2', name: 'Female' },
          ],
        };

      default:
        return { status: 500, payload: { statusCode: '500', message: `No fixture for ${routePath}.` } };
    }
  }

  private locations(serviceId: number) {
    if (serviceId !== UK_SERVICE_ID && serviceId !== ROI_SERVICE_ID) {
      // A wrong ServiceId is an empty list rather than an error, which is the
      // quietest possible failure and therefore the one worth modelling: the
      // caller must not read "no clinics" as "no clinics near you".
      return { serviceLocations: [] };
    }
    return {
      serviceLocations: [
        {
          LocationId: SANDBOX_LOCATION_ID,
          Name: SANDBOX_LOCATION_NAME,
          AddressLine1: '1 Example Street',
          TownCity: 'Crumlin',
          PostalCode: 'BT29 4QY',
          Latitude: 54.6167,
          Longitude: -6.2167,
        },
        {
          LocationId: COLLECTION_LOCATION_ID,
          Name: 'Clinic Location Fifteen',
          AddressLine1: '2 Example Road',
          TownCity: 'Belfast',
          PostalCode: 'BT1 1AA',
          Latitude: 54.5973,
          Longitude: -5.9301,
        },
      ],
    };
  }

  private availability(locationId: number, searchFrom: string) {
    // Location 15 has an empty diary, exactly as Randox warn. A legitimate
    // answer, and one a caller must not read as a failure.
    if (locationId === COLLECTION_LOCATION_ID) return { availability: [] };
    if (locationId !== SANDBOX_LOCATION_ID) return { availability: [] };

    const from = Date.parse(searchFrom);
    return {
      availability: FIXTURE_SLOTS.filter(
        (s) => !this.taken.has(s.id) && !this.slotsTaken.has(s.id) && (Number.isNaN(from) || Date.parse(s.startUtc) >= from),
      ).map((s) => ({
        AppointmentSlotId: s.id,
        // UTC, with an explicit Z. Documented.
        AppointmentSlotDateTime: s.startUtc,
        DurationMinutes: 30,
      })),
    };
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
    const id = 1144015 + this.counter;
    const expiresAt = Date.now() + (this.holdsExpireImmediately ? -1_000 : 30 * 60 * 1000);
    this.holds.set(id, { bookingId: id, appointmentId: id, slotId, expiresAt, consumed: false });

    return {
      status: 200,
      payload: {
        BookingId: id,
        AppointmentId: id,
        HoldReference: String(id),
        ExpiresAtUtc: new Date(expiresAt).toISOString(),
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
      slotId: hold.slotId,
      gpExternalNumber: String(request.GPExternalNumber ?? ''),
      cancelled: false,
    });

    return {
      status: 200,
      payload: {
        RandoxBookingOrderId: randoxBookingOrderId,
        BookingId: bookingId,
        AppointmentId: Number(request.AppointmentId),
        AppointmentSlotId: hold.slotId,
        AppointmentSlotDateTime: FIXTURE_SLOTS.find((s) => s.id === hold.slotId)?.startUtc ?? null,
        GPExternalNumber: request.GPExternalNumber,
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
    return { status: 200, payload: { RandoxBookingOrderId: randoxBookingOrderId, Cancelled: true } };
  }

  /** What the fixture believes, for a test that wants to assert on state. */
  bookingFor(randoxBookingOrderId: number) {
    return this.bookings.get(randoxBookingOrderId) ?? null;
  }
}
