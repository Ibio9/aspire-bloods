import { describe, it, expect, vi, afterAll, beforeEach } from 'vitest';
import { createFakePrisma, seedCatalogue, seedPatient, seedOrder, type FakePrisma } from './support/fakePrisma.js';

/**
 * ---------------------------------------------------------------------------
 * THE DOCUMENTED BOOKING FLOW, END TO END, OVER HTTP.
 * ---------------------------------------------------------------------------
 *
 * Nexus CreatePendingOrder → capture the Order Number
 *   → CB GetServiceLocations → AvailabilityDetails → HoldAvailabilityBooking
 *   → CB CreateRandoxBooking, carrying the Order Number as GPExternalNumber
 *   → Nexus GetOrderStatus through 1, 2, 3, 4
 *   → Nexus GetOrderResultReports and GetOrderResultDetail at status 4
 *
 *   → CB RescheduleAppointment, which refuses INSIDE a 200
 *
 * Plus the four failure paths that are NORMAL rather than exceptional: a hold
 * that expires, a booking that fails after a hold, a cancel, and a slot taken
 * between availability and hold.
 *
 * TWO REAL CLIENTS, TWO MOCK SERVERS, TWO SEPARATE HOSTS — which is itself part
 * of what is being tested. Nexus and Clinic Booking have different base URLs,
 * different subscription keys, different B2C client ids and different scopes,
 * and a single-host test would prove none of that stayed separate.
 *
 * WHAT THE BOOKING MOCK ENFORCES is the point of the exercise: it is generated
 * from BOTH Randox documents — the OpenAPI definition for the surface, the
 * Postman collection for the bodies — and rejects a request whose fields, types
 * or date shapes differ from what the two AGREE on. So "we send what Randox
 * documented" is a 400 when it stops being true, rather than a comment claiming
 * it. Where the two documents disagree it accepts either, because enforcing one
 * side of a genuine disagreement is enforcing a coin toss.
 *
 * NOTHING REAL GOES NEAR IT. Invented names, invented dates of birth, invented
 * order numbers, and a date of birth that belongs to nobody.
 */

const NEXUS_PORT = 44319;
const BOOKING_PORT = 44321;

vi.mock('../src/config/env.js', async () => {
  const actual = await vi.importActual<typeof import('../src/config/env.js')>('../src/config/env.js');
  return {
    ...actual,
    env: {
      ...actual.env,
      RANDOX_NEXUS_BASE_URL: `http://127.0.0.1:${44319}/api`,
      RANDOX_NEXUS_SUBSCRIPTION_KEY: 'fixture-nexus-key',
      RANDOX_NEXUS_TOKEN_URL: `http://127.0.0.1:${44319}/token`,
      RANDOX_NEXUS_USERNAME: 'fixture-user',
      RANDOX_NEXUS_PASSWORD: 'fixture-password',
      RANDOX_BOOKING_BASE_URL: `http://127.0.0.1:${44321}/booking-platform-api`,
      RANDOX_BOOKING_SUBSCRIPTION_KEY: 'fixture-booking-key',
      RANDOX_BOOKING_TOKEN_URL: `http://127.0.0.1:${44321}/token`,
      RANDOX_BOOKING_USERNAME: 'fixture-user',
      RANDOX_BOOKING_PASSWORD: 'fixture-password',
      RANDOX_BOOKING_REGION: 'UK' as const,
      RANDOX_BOOKING_SERVICE_ID_UK: 787,
      RANDOX_BOOKING_SERVICE_ID_ROI: 788,
      RANDOX_BEARER_TOKEN_ENABLED: true,
      RANDOX_REFERENCE_DATA_METHOD: 'get' as const,
      RANDOX_RETRY_MAX_ATTEMPTS: 1,
      // The service layer refuses to do anything with the integration off, and
      // this file is about what it does when it is on.
      RANDOX_ENABLED: true,
    },
  };
});

const db: FakePrisma = createFakePrisma();
vi.mock('../src/db/client.js', () => ({ prisma: db }));
vi.mock('../src/modules/storage/LocalDiskStorageAdapter.js', () => ({
  storageAdapter: { save: async () => ({ storageKey: 'k', sizeBytes: 1 }) },
}));

// The service layer gets the LIVE clients, pointed at the two mock servers.
// A service test over the fixture clients would prove the service agrees with
// our idea of Randox, which is the thing under test.
vi.mock('../src/modules/randox/clients/index.js', async () => {
  const nexusMod = await import('../src/modules/randox/clients/NexusLabClient.js');
  const bookingMod = await import('../src/modules/randox/clients/ClinicBookingClient.js');
  return {
    nexusLabClient: () => new nexusMod.LiveNexusLabClient(),
    clinicBookingClient: () => new bookingMod.LiveClinicBookingClient(),
  };
});

const { startMockNexusServer } = await import('../src/modules/randox/mock/specServer.js');
const { startMockBookingServer, bodyMismatches, loadBookingRoutes, shapeOf } = await import(
  '../src/modules/randox/mock/bookingSpecServer.js'
);
const bookingFixtures = await import('../src/modules/randox/mock/bookingScenarios.js');
const scenarios = await import('../src/modules/randox/mock/scenarios.js');

const nexusServer = await startMockNexusServer({ port: NEXUS_PORT });
const bookingServer = await startMockBookingServer({ port: BOOKING_PORT });

// The REAL clients on both sides. A contract test over our own fixture clients
// could only prove that our idea of Randox is self-consistent.
const { LiveNexusLabClient } = await import('../src/modules/randox/clients/NexusLabClient.js');
const { LiveClinicBookingClient } = await import('../src/modules/randox/clients/ClinicBookingClient.js');
const { NEXUS_ENDPOINTS, CLINIC_BOOKING_ENDPOINTS, bookingVerbForPath } = await import(
  '../src/modules/randox/endpoints.js'
);
const { RandoxWindowExpiredError } = await import('../src/modules/randox/errors.js');
const { slotDateDayFirst, slotDateIsoMidnightZ, slotTimeOfDay, londonWallClock, slotInstantFromWireParts } =
  await import('../src/modules/randox/clients/parse.js');
const { __setConfigCachesForTest } = await import('../src/modules/randox/config.js');

__setConfigCachesForTest({}, { panels: {}, tests: {}, markerNameOverrides: {}, panelsByRandoxId: {} });

const nexus = () => new LiveNexusLabClient();
const booking = () => new LiveClinicBookingClient();

const CRUMLIN = String(bookingFixtures.SANDBOX_LOCATION_ID);

afterAll(async () => {
  await nexusServer.close();
  await bookingServer.close();
});

beforeEach(() => {
  nexusServer.requests.length = 0;
  bookingServer.requests.length = 0;
});

/** Invented. */
const PATIENT = {
  firstName: 'Fixture',
  lastName: 'Patient',
  dateOfBirth: '1990-01-01',
  biologicalSexId: 2,
  email: 'fixture.patient@example.test',
  contactNumber: '07700900000',
  addressLine1: '1 Fixture Street',
  addressLine2: '',
  townCity: 'Fixtureton',
  postalCode: 'M1 1AA',
  countryId: 1,
};

// ---------------------------------------------------------------------------
// The collection itself
// ---------------------------------------------------------------------------

describe('the two Clinic Booking documents, reconciled', () => {
  const byPath = () => new Map(loadBookingRoutes().map((r) => [r.path, r]));

  it('is seven operations — one GET and six POSTs — and our table matches path for path', () => {
    const routes = loadBookingRoutes();
    expect(routes).toHaveLength(7);
    for (const route of routes) {
      expect(bookingVerbForPath(route.path), route.path).toBe(route.verb);
    }
    expect(routes.filter((r) => r.verb === 'GET').map((r) => r.path)).toEqual(['RandoxServices/GetServiceRegions']);
    expect(routes.filter((r) => r.verb === 'POST')).toHaveLength(6);
    // Every name in our table is a path in the definition, and vice versa.
    expect(new Set(Object.values(CLINIC_BOOKING_ENDPOINTS).map((e) => e.path))).toEqual(
      new Set(routes.map((r) => r.path)),
    );
  });

  it('HAS NO GetBiologicalSex, which is why it 404’d in the sandbox', () => {
    // It is in the CB STES auth document's worked example, it was in our
    // endpoint table as the one GET, and Randox answered
    // 404 {"statusCode": 404, "message": "Resource not found"}.
    // The ids come from the CreateRandoxBooking description instead.
    expect(loadBookingRoutes().some((r) => /biologicalsex/i.test(r.path))).toBe(false);
    expect(Object.keys(CLINIC_BOOKING_ENDPOINTS)).not.toContain('getBiologicalSex');
  });

  it('DOES have a reschedule, with all four fields required — so the client no longer refuses', () => {
    const route = byPath().get('RandoxBookings/RescheduleAppointment')!;
    expect(route.verb).toBe('POST');
    // The only request on this API with a schema rather than an example behind
    // it. Its body comes from the spec, because nothing else spells it at all.
    expect(Object.keys(route.specExample!).sort()).toEqual([
      'appointmentId',
      'locationId',
      'newAppointmentSlotId',
      'serviceId',
    ]);
    expect(route.collectionExample).toBeNull();
  });

  it('really does type ServiceId and LocationId inconsistently across its own calls', () => {
    const example = (path: string) => byPath().get(path)!.collectionExample!;
    // Their inconsistency, not ours, and the reason each request is built to
    // its OWN example rather than to one house style.
    expect(typeof example('Locations/GetServiceLocations').ServiceId).toBe('number');
    expect(typeof example('Availability/AvailabilityDetails').ServiceId).toBe('string');
    expect(typeof example('Availability/AvailabilityDetails').LocationId).toBe('number');
    expect(typeof example('RandoxBookings/HoldAvailabilityBooking').LocationId).toBe('string');
  });

  it('sends the same slot date in two different formats, one per endpoint', () => {
    const example = (path: string) => byPath().get(path)!.collectionExample!;
    expect(shapeOf(String(example('RandoxBookings/HoldAvailabilityBooking').AppointmentSlotDate))).toBe(
      'day-first-date',
    );
    expect(shapeOf(String(example('RandoxBookings/CreateRandoxBooking').AppointmentSlotDate))).toBe('iso-instant');
  });

  /**
   * THE RECONCILIATION ITSELF, PINNED — because "the two documents differ only
   * in case" is the claim the mock's whole body checker rests on, and it is a
   * claim about two files that Randox can change under us.
   */
  it('DIFFERS FROM THE SPEC ONLY IN CASE, on every field of every shared endpoint', () => {
    const shared = loadBookingRoutes().filter((r) => r.collectionExample && r.specExample);
    expect(shared).toHaveLength(5);

    for (const route of shared) {
      const collection = Object.keys(route.collectionExample!).map((k) => k.toLowerCase()).sort();
      const spec = Object.keys(route.specExample!).map((k) => k.toLowerCase()).sort();
      // GPExternalNumber is in the collection's create and not in the spec's,
      // and the flow diagram requires it in as many words — a spec example that
      // omits a field is SILENT about it, not against it. That is the one and
      // only field either document has that the other does not.
      const onlyInCollection = collection.filter((k) => !spec.includes(k));
      const onlyInSpec = spec.filter((k) => !collection.includes(k));
      expect(onlyInSpec, route.path).toEqual([]);
      expect(onlyInCollection, route.path).toEqual(
        route.path === 'RandoxBookings/CreateRandoxBooking' ? ['gpexternalnumber'] : [],
      );
    }
  });

  it('“AppointmentSlotTIme” IS A CASE VARIANT, NOT A MISSPELLING', () => {
    // Recorded as a fact rather than as a fear. The capital I was described for
    // two revisions as a misspelling whose correction "would produce a request
    // with no slot time in it" — a guess with a consequence attached. The two
    // documents spell it `AppointmentSlotTIme` and `appointmentSlotTime`, which
    // differ in one character's CASE and nothing else.
    const hold = byPath().get('RandoxBookings/HoldAvailabilityBooking')!;
    const create = byPath().get('RandoxBookings/CreateRandoxBooking')!;

    expect(Object.keys(hold.collectionExample!)).toContain('AppointmentSlotTIme');
    expect(Object.keys(create.collectionExample!)).toContain('AppointmentSlotTIme');

    // The spec is not even self-consistent about case between its OWN two
    // examples — PascalCase on the hold, camelCase on the create — which is
    // the strongest evidence there is that the API does not care.
    expect(Object.keys(hold.specExample!)).toContain('AppointmentSlotTime');
    expect(Object.keys(create.specExample!)).toContain('appointmentSlotTime');

    for (const spelling of ['AppointmentSlotTime', 'appointmentSlotTime']) {
      expect(spelling.toLowerCase()).toBe('AppointmentSlotTIme'.toLowerCase());
    }
  });

  it('disagrees with the spec on exactly ONE type, and it is the stale example', () => {
    const hold = byPath().get('RandoxBookings/HoldAvailabilityBooking')!;
    // 488 is not a service id. There are two in the world, 787 and 788, and no
    // third — which is what dates the spec's example rather than ours.
    expect(hold.specExample!.ServiceId).toBe('488');
    expect(typeof hold.collectionExample!.ServiceId).toBe('number');

    const disagreements = loadBookingRoutes()
      .filter((r) => r.collectionExample && r.specExample)
      .flatMap((r) =>
        Object.entries(r.collectionExample!)
          .map(([field, value]) => {
            const match = Object.entries(r.specExample!).find(([k]) => k.toLowerCase() === field.toLowerCase());
            return match && typeof match[1] !== typeof value ? `${r.path}.${field}` : null;
          })
          .filter((x): x is string => x !== null),
      );
    expect(disagreements).toEqual(['RandoxBookings/HoldAvailabilityBooking.ServiceId']);
  });
});

// ---------------------------------------------------------------------------
// The trap the collection proves on its own
// ---------------------------------------------------------------------------

describe('slot times are the UTC wall clock, not the UK one', () => {
  /**
   * PROVABLE FROM THE COLLECTION ITSELF, which is why it is asserted rather
   * than commented. Their AppointmentSlotId is "72164:72164::1760607000:" and
   * 1760607000 is 2025-10-16T09:30:00Z — the same 09:30 their example sends as
   * AppointmentSlotTIme. On 16 October London is on BST, so that instant reads
   * 10:30 locally. A formatter using local getters would have held a slot an
   * hour from the one the patient picked, for seven months of every year.
   */
  it('the collection’s own slot id decodes to the time it sends', () => {
    const example = loadBookingRoutes().find((r) => r.path === 'RandoxBookings/HoldAvailabilityBooking')!.example!;
    const epoch = Number(String(example.AppointmentSlotId).split(':')[3]);
    const instant = new Date(epoch * 1000).toISOString();

    expect(slotTimeOfDay(instant)).toBe(example.AppointmentSlotTIme);
    expect(slotDateDayFirst(instant)).toBe(example.AppointmentSlotDate);
    // And the London clock disagrees, which is the whole point.
    expect(londonWallClock(instant).time).toBe('10:30');
    expect(londonWallClock(instant).time).not.toBe(example.AppointmentSlotTIme);
  });

  /**
   * THE OBSERVED SLOT, AND THE ONE PROPERTY THAT CANNOT BE WRONG.
   *
   * The sandbox returns `{Id: "slot-room33-2026-08-17T07:00-staff19", Date:
   * "17/08/2026", Time: "07:00", AvailableQuantity: 1}` — a day-first date and
   * a bare HH:mm, no combined datetime, no offset, no epoch. Nothing in either
   * document shows that shape, and the client's five guessed field names turned
   * 114 real slots into an empty diary.
   *
   * Whether those two strings are UTC or clinic-local is NOT settled. What is
   * settled is that they must be echoed: `Date` and `Time` are exactly the two
   * fields HoldAvailabilityBooking wants back. Reading them as UTC is the only
   * reading under which our own formatters reproduce them character for
   * character, which is what this asserts on the real captured values.
   */
  it('a slot read from Randox’s Date and Time round-trips to the identical strings', () => {
    const startUtc = slotInstantFromWireParts('17/08/2026', '07:00')!;
    expect(startUtc).toBe('2026-08-17T07:00:00.000Z');
    expect(slotDateDayFirst(startUtc)).toBe('17/08/2026');
    expect(slotTimeOfDay(startUtc)).toBe('07:00');

    // And the failure it rules out: read as London in August, 07:00 would go
    // back to Randox as 06:00 — a booking at a time they never offered.
    expect(londonWallClock(startUtc).time).toBe('08:00');
    expect(londonWallClock(startUtc).time).not.toBe('07:00');
  });

  it('refuses a malformed Date or Time rather than inventing an instant', () => {
    // The spec's own create example puts a DATE in the time field
    // ("appointmentSlotTime": "2024-04-11"). Anything that is not day-first
    // date plus HH:mm is null, and the slot is dropped rather than guessed at.
    expect(slotInstantFromWireParts('17/08/2026', '2024-04-11')).toBeNull();
    expect(slotInstantFromWireParts('2026-08-17', '07:00')).toBeNull();
    expect(slotInstantFromWireParts(null, '07:00')).toBeNull();
    expect(slotInstantFromWireParts('17/08/2026', null)).toBeNull();
  });

  it('the create’s date is midnight Z on the same day, per its own example', () => {
    const example = loadBookingRoutes().find((r) => r.path === 'RandoxBookings/CreateRandoxBooking')!.example!;
    const epoch = Number(String(example.AppointmentSlotId).split(':')[3]);
    const instant = new Date(epoch * 1000).toISOString();
    expect(slotDateIsoMidnightZ(instant)).toBe(example.AppointmentSlotDate);
    expect(slotTimeOfDay(instant)).toBe(example.AppointmentSlotTIme);
  });
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe('Clinic Booking auth', () => {
  /**
   * THE FOUR VALUES THE CB AUTH DOCUMENT GIVES, PINNED AGAINST THE DEFAULTS.
   *
   * Pinned because the Nexus scope was WRONG BY ONE HYPHEN until this pass —
   * `gptestorderportal-externalapi` where both the PDF's own link target and
   * the Postman collection say `gptestorderportal-external-api`. It came from
   * transcribing the PDF's rendered paragraph, where the hyphen falls on a
   * line break and is swallowed; the CB scope is mangled the same way two
   * paragraphs later. A wrong scope means B2C issues no token at all, so
   * every call 401s from the first one with a message about the token rather
   * than about the scope.
   */
  it('carries the documented client id, scope, token URL and base URL as defaults', async () => {
    const actual = await vi.importActual<typeof import('../src/config/env.js')>('../src/config/env.js');
    const defaults = actual.envSchema_forDefaultsTestingOnly.parse({
      APP_BASE_URL: 'http://localhost:5173',
      API_BASE_URL: 'http://localhost:4000',
      DATABASE_URL: 'postgresql://t:t@localhost:5432/t',
      JWT_ACCESS_SECRET: 'x'.repeat(40),
      JWT_REFRESH_SECRET: 'x'.repeat(40),
      CSRF_SECRET: 'x'.repeat(40),
      ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
      FILE_SIGNING_SECRET: 'x'.repeat(40),
    });

    expect(defaults.RANDOX_BOOKING_CLIENT_ID).toBe('0b0399a4-d61f-43fc-a0d0-3311f60cdcb1');
    expect(defaults.RANDOX_BOOKING_SCOPE).toBe(
      'https://randoxclinicbooking.onmicrosoft.com/clinic-booking-platform-api/user_impersonation',
    );
    expect(defaults.RANDOX_B2C_TOKEN_URL).toBe(
      'https://randoxclinicbooking.b2clogin.com/randoxclinicbooking.onmicrosoft.com/B2C_1_apim_ropc_signin1/oauth2/v2.0/token',
    );
    expect(defaults.RANDOX_BOOKING_BASE_URL).toBe(
      'https://stes-cb-platform-apim.azure-api.net/booking-platform-api/',
    );

    // THE HYPHEN. Asserted both ways, because the failure is one character.
    expect(defaults.RANDOX_NEXUS_SCOPE).toBe(
      'https://randoxclinicbooking.onmicrosoft.com/gptestorderportal-external-api/User.Read.All',
    );
    expect(defaults.RANDOX_NEXUS_SCOPE).not.toContain('externalapi');

    // 787 UK, 788 ROI, and no third value.
    expect(defaults.RANDOX_BOOKING_SERVICE_ID_UK).toBe(787);
    expect(defaults.RANDOX_BOOKING_SERVICE_ID_ROI).toBe(788);

    // Both credentials go by default. The document settles it: "Authorisation
    // will be the bearer token and in the header section include the following
    // key: Ocp-Apim-Subscription-Key."
    expect(defaults.RANDOX_BEARER_TOKEN_ENABLED).toBe(true);
  });

  it('sends BOTH the bearer and the subscription key, on every call', async () => {
    await booking().getServiceLocations();
    const call = bookingServer.requests.at(-1)!;
    expect(call.hadSubscriptionKey).toBe(true);
    expect(call.hadBearer).toBe(true);
  });

  it('a request missing either credential is the documented 401', async () => {
    const res = await fetch(`${bookingServer.url}/${CLINIC_BOOKING_ENDPOINTS.getServiceLocations.path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(401);
    // The 401 body uses `status`, not `statusCode`.
    expect(await res.json()).toMatchObject({ status: '401' });
  });

  it('a booking endpoint called with GET is a 405', async () => {
    const res = await fetch(`${bookingServer.url}/${CLINIC_BOOKING_ENDPOINTS.availabilityDetails.path}`, {
      headers: { 'Ocp-Apim-Subscription-Key': 'k', Authorization: 'Bearer t' },
    });
    expect(res.status).toBe(405);
  });
});

// ---------------------------------------------------------------------------
// The body checker itself — a test of the test
// ---------------------------------------------------------------------------

describe('the mock’s body checking', () => {
  const holdRoute = () => loadBookingRoutes().find((r) => r.path === 'RandoxBookings/HoldAvailabilityBooking')!;
  const holdExample = () => holdRoute().collectionExample!;
  const holdSpec = () => holdRoute().specExample!;

  it('passes the collection’s own example', () => {
    expect(bodyMismatches(holdExample(), holdExample(), holdSpec())).toEqual([]);
  });

  it('ACCEPTS a case variant, because the two documents disagree on case throughout', () => {
    // This test used to assert the OPPOSITE — that correcting the capital I in
    // `AppointmentSlotTIme` was a 400. That was the mock enforcing one side of
    // a disagreement between two Randox documents, which is enforcing a coin
    // toss. `AppointmentSlotTIme` and `appointmentSlotTime` differ in one
    // character's case, and every field of every shared endpoint differs the
    // same way, which is what case-insensitive model binding looks like.
    const { AppointmentSlotTIme, ...rest } = holdExample();
    expect(bodyMismatches(holdExample(), { ...rest, AppointmentSlotTime: AppointmentSlotTIme }, holdSpec())).toEqual([]);
  });

  it('still catches a field that is genuinely misspelled', () => {
    // Case-insensitive is not name-insensitive. A dropped letter is a field
    // Randox have never named, and it is still refused.
    const { AppointmentSlotTIme, ...rest } = holdExample();
    const problems = bodyMismatches(holdExample(), { ...rest, AppointmentSlotTme: AppointmentSlotTIme }, holdSpec());
    expect(problems.join(' ')).toMatch(/"AppointmentSlotTIme" is missing/);
    expect(problems.join(' ')).toMatch(/"AppointmentSlotTme" is not a field/);
  });

  it('catches the two date formats being swapped', () => {
    const problems = bodyMismatches(
      holdExample(),
      { ...holdExample(), AppointmentSlotDate: '2025-10-16T00:00:00Z' },
      holdSpec(),
    );
    expect(problems.join(' ')).toMatch(/AppointmentSlotDate.*iso-instant.*day-first-date/);
  });

  it('catches an id sent in the wrong form — unless the other document sends it that way', () => {
    // AvailabilityDetails: both documents type ServiceId as a string, so a
    // number is refused with nothing to fall back on.
    const availability = loadBookingRoutes().find((r) => r.path === 'Availability/AvailabilityDetails')!;
    const problems = bodyMismatches(
      availability.collectionExample!,
      { ...availability.collectionExample!, ServiceId: 787 },
      availability.specExample,
    );
    expect(problems.join(' ')).toMatch(/"ServiceId" is a number; this endpoint's example sends a string/);

    // The hold is the one field the two disagree about (787 against "488"), so
    // a string passes there. Accepting where they differ is the point — see
    // the note at the top of bookingSpecServer.ts.
    expect(bodyMismatches(holdExample(), { ...holdExample(), ServiceId: '787' }, holdSpec())).toEqual([]);
  });

  it('catches a field NO Randox document has', () => {
    // An invented SearchTo would be ignored by a real API and would silently
    // return an unbounded range, which is the failure this refuses to allow.
    const problems = bodyMismatches(holdExample(), { ...holdExample(), SearchTo: '2025-10-20' }, holdSpec());
    expect(problems.join(' ')).toMatch(/"SearchTo" is not a field/);
  });

  it('accepts GPExternalNumber, which only the collection has', () => {
    // The field joining a booking to a laboratory order. The spec's create
    // example omits it and the flow diagram requires it in as many words; an
    // example that does not show a field is SILENT about it, not against it.
    const create = loadBookingRoutes().find((r) => r.path === 'RandoxBookings/CreateRandoxBooking')!;
    expect(Object.keys(create.specExample!)).not.toContain('gpExternalNumber');
    expect(bodyMismatches(create.collectionExample!, create.collectionExample!, create.specExample)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The happy path, whole
// ---------------------------------------------------------------------------

describe('the documented flow', () => {
  it('walks order → locations → availability → hold → booking → status → results', async () => {
    // ---- 1. Nexus CreatePendingOrder, and capture the Order Number --------
    const created = await nexus().createPendingOrder({
      FirstName: 'Fixture',
      LastName: 'Patient',
      DateOfBirth: '1990-01-01',
      BiologicalSexId: 2,
      TestClinicLocationId: 146,
      PanelIds: [1],
      TestIds: [],
      IsHealthCheckPanelReport: true,
      IsCvScoreRequired: false,
      TestReasons: [{ Id: 1, Details: 'Private health screening requested by the patient.' }],
    });
    // "Important to capture Order Number as this will be main reference id" —
    // and what the response actually carries is `externalNumber`.
    expect(created.externalNumber).toBeTruthy();
    const orderNumber = created.externalNumber;

    // ---- 2. CB GetServiceLocations ---------------------------------------
    const locations = await booking().getServiceLocations();
    expect(locations.map((l) => l.id)).toContain(CRUMLIN);
    const request = bookingServer.requests.at(-1)!;
    // The UK service id, as a NUMBER, per this endpoint's example.
    expect(request.body).toEqual({ ServiceId: 787 });

    // ---- 3. AvailabilityDetails ------------------------------------------
    const slots = await booking().availabilityDetails(CRUMLIN, bookingFixtures.FIXTURE_SLOT_DAY);
    expect(slots.length).toBeGreaterThan(0);
    const availabilityCall = bookingServer.requests.at(-1)!;
    // ServiceId a STRING and LocationId a NUMBER on this one. The opposite way
    // round from the hold two calls later.
    expect(availabilityCall.body).toEqual({
      ServiceId: '787',
      LocationId: 30,
      SearchFrom: `${bookingFixtures.FIXTURE_SLOT_DAY}T00:00:00.000Z`,
    });
    for (const slot of slots) {
      expect(slot.startUtc.endsWith('Z')).toBe(true);
      expect(slot.local.timeZone).toBe('Europe/London');
    }

    const slot = slots.find((s) => s.startUtc.includes('T09:30'))!;
    // BST: the instant is 09:30Z and the clinic clock says 10:30.
    expect(slot.local.time).toBe('10:30');
    // Randox's own two strings, carried untouched beside the instant.
    expect(slot.wireDate).toBe('16/10/2025');
    expect(slot.wireTime).toBe('09:30');
    expect(slot.availableQuantity).toBe(1);

    // ---- 4. HoldAvailabilityBooking --------------------------------------
    const hold = await booking().holdAvailabilityBooking(CRUMLIN, slot.slotReference, slot.startUtc);
    expect(hold.bookingId).toBeTypeOf('number');
    const holdCall = bookingServer.requests.at(-1)!;
    expect(holdCall.body).toMatchObject({
      ServiceId: 787,
      LocationId: '30',
      AppointmentSlotId: slot.slotReference,
      AppointmentSlotDate: '16/10/2025',
      AppointmentSlotTIme: '09:30',
    });
    // THE ECHO, ASSERTED AS ONE LINE: the two strings sent back are the two
    // strings that arrived. Whatever zone Randox mean by them, we do not
    // reinterpret them on the way out.
    expect((holdCall.body as Record<string, unknown>).AppointmentSlotDate).toBe(slot.wireDate);
    expect((holdCall.body as Record<string, unknown>).AppointmentSlotTIme).toBe(slot.wireTime);
    // The 30-minute window, which is what everything after this is racing.
    const heldFor = Date.parse(hold.expiresAtUtc) - Date.now();
    expect(heldFor).toBeGreaterThan(25 * 60 * 1000);
    expect(heldFor).toBeLessThanOrEqual(30 * 60 * 1000);

    // ---- 5. CreateRandoxBooking, carrying the Nexus order number ----------
    const confirmed = await booking().createRandoxBooking({
      holdReference: hold.holdReference,
      bookingId: hold.bookingId!,
      appointmentId: hold.appointmentId!,
      serviceLocationId: CRUMLIN,
      slotReference: slot.slotReference,
      startUtc: slot.startUtc,
      gpExternalNumber: orderNumber,
      patient: PATIENT,
    });

    const bookCall = bookingServer.requests.at(-1)!;
    const bookBody = bookCall.body as Record<string, unknown>;
    // THE JOINT BETWEEN THE TWO APIs, asserted as one line: the string Nexus
    // returned from CreatePendingOrder is the string Clinic Booking receives.
    expect(bookBody.GPExternalNumber).toBe(orderNumber);
    expect(bookBody.GPExternalNumber).toBe(created.externalNumber);
    // Its own date format, not the hold's, three requests apart.
    expect(bookBody.AppointmentSlotDate).toBe('2025-10-16T00:00:00Z');
    expect(bookBody.AppointmentSlotTIme).toBe('09:30');
    // Both ids as strings here and as numbers elsewhere.
    expect(bookBody.ServiceId).toBe('787');
    expect(bookBody.LocationId).toBe('30');
    // Never opts a patient into Randox's own messaging.
    expect(bookBody.CommunicationPreferenceEmail).toBe(false);
    expect(bookBody.CommunicationPreferenceSMS).toBe(false);
    expect(bookBody.CommunicationPreferenceTelephone).toBe(false);
    // The id the cancel will need, captured at creation.
    expect(confirmed.randoxBookingOrderId).toBeTypeOf('number');

    // ---- 6. Nexus GetOrderStatus through 1, 2, 3, 4 -----------------------
    for (const statusId of [1, 2, 3, 4]) {
      nexusServer.setOverride(NEXUS_ENDPOINTS.getOrderStatus.path, () => scenarios.statusResponse(statusId));
      const status = await nexus().getOrderStatus({
        orderId: scenarios.FIXTURE_ORDER_ID,
        orderNumber,
        clinicId: 146,
      });
      expect(status.statusId).toBe(statusId);
    }
    // The flow diagram requires ClinicId here; the two examples omit it. Sent.
    const statusCall = nexusServer.requests.filter((r) => r.path === NEXUS_ENDPOINTS.getOrderStatus.path).at(-1)!;
    expect(statusCall.method).toBe('POST');
    expect(statusCall.body).toMatchObject({ OrderNumber: orderNumber, ClinicId: 146 });
    nexusServer.setOverride(NEXUS_ENDPOINTS.getOrderStatus.path, null);

    // ---- 7. At status 4: reports, then detail -----------------------------
    nexusServer.setOverride(NEXUS_ENDPOINTS.getOrderResultReports.path, () => scenarios.reportsResponse());
    nexusServer.setOverride(NEXUS_ENDPOINTS.getOrderResultDetail.path, () =>
      scenarios.resultDetailWith([scenarios.CLEAN_ROW]),
    );

    const ref = { orderId: scenarios.FIXTURE_ORDER_ID, orderNumber, clinicId: 146 };
    const pdf = await nexus().getOrderResultReports(ref);
    expect(pdf).toBeTruthy();
    expect(Buffer.from(pdf!, 'base64').subarray(0, 5).toString('utf-8')).toBe('%PDF-');

    const detail = await nexus().getOrderResultDetail(ref);
    expect(detail.reportResults).toHaveLength(1);

    // Both result endpoints take the Order Number AND the Clinic Id.
    for (const path of [NEXUS_ENDPOINTS.getOrderResultReports.path, NEXUS_ENDPOINTS.getOrderResultDetail.path]) {
      const call = nexusServer.requests.filter((r) => r.path === path).at(-1)!;
      expect(call.method).toBe('POST');
      expect(call.body).toMatchObject({ orderNumber, clinicId: 146 });
    }

    nexusServer.setOverride(NEXUS_ENDPOINTS.getOrderResultReports.path, null);
    nexusServer.setOverride(NEXUS_ENDPOINTS.getOrderResultDetail.path, null);
  });

  it('GetServiceRegions is a GET with no body — the credential probe', async () => {
    // The sandbox pass's probe used to be GetBiologicalSex, which 404s. A probe
    // that hits a non-existent endpoint cannot tell a working key from a broken
    // one, which is the only thing a probe is for.
    const regions = await booking().getServiceRegions();
    expect(regions.length).toBeGreaterThan(0);
    const call = bookingServer.requests.at(-1)!;
    expect(call.method).toBe('GET');
    expect(call.body).toBeUndefined();
    expect(call.hadSubscriptionKey).toBe(true);
    expect(call.hadBearer).toBe(true);
  });

  it('RESCHEDULES with the spec’s four fields, and reports a refusal inside a 200', async () => {
    const slots = await booking().availabilityDetails(CRUMLIN, bookingFixtures.FIXTURE_SLOT_DAY);
    const slot = slots[0];
    const hold = await booking().holdAvailabilityBooking(CRUMLIN, slot.slotReference, slot.startUtc);
    const confirmed = await booking().createRandoxBooking({
      holdReference: hold.holdReference,
      bookingId: hold.bookingId!,
      appointmentId: hold.appointmentId!,
      serviceLocationId: CRUMLIN,
      slotReference: slot.slotReference,
      startUtc: slot.startUtc,
      gpExternalNumber: bookingFixtures.FIXTURE_GP_EXTERNAL_NUMBER,
      patient: PATIENT,
    });

    const target = slots.find((s) => s.slotReference !== slot.slotReference)!;
    const moved = await booking().rescheduleAppointment(hold.appointmentId!, CRUMLIN, target.slotReference);

    // camelCase and all four, which is the spec's schema and not an example.
    expect(bookingServer.requests.at(-1)!.body).toEqual({
      appointmentId: hold.appointmentId,
      serviceId: 787,
      locationId: 30,
      newAppointmentSlotId: target.slotReference,
    });
    expect(moved.succeeded).toBe(true);
    expect(moved.newStartUtc).toBe(target.startUtc);

    // THE FAILURE MODE UNIQUE TO THIS CALL. A refusal is a 200 with
    // SuccessFailCode set to something else — nothing else on either API does
    // that, and a caller reading only the HTTP status would report a move that
    // never happened.
    const refused = await booking().rescheduleAppointment(999999, CRUMLIN, target.slotReference);
    expect(refused.succeeded).toBe(false);
    expect(refused.failureDescription).toBeTruthy();

    // Both slots go back on the diary. The mock server holds one state for the
    // whole file, so a test that books and walks away silently shortens the
    // diary for every test after it — which is how the service tests below
    // started reading `slots[2]` of an array with two things in it.
    await booking().cancelRandoxBooking(confirmed.randoxBookingOrderId!, bookingFixtures.FIXTURE_GP_EXTERNAL_NUMBER);
  });

  it('keeps the two APIs on separate hosts and separate keys', async () => {
    await booking().getServiceLocations();
    await nexus().getTestingReasons();
    // Each mock only ever saw its own traffic. If the connections were sharing
    // a base URL or a key, one of these would be empty and the other doubled.
    expect(bookingServer.requests).toHaveLength(1);
    expect(nexusServer.requests).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// The failure paths, which are outcomes rather than faults
// ---------------------------------------------------------------------------

describe('the failure paths', () => {
  async function freshSlot() {
    const slots = await booking().availabilityDetails(CRUMLIN, bookingFixtures.FIXTURE_SLOT_DAY);
    return slots[0];
  }

  it('A SLOT TAKEN BETWEEN AVAILABILITY AND HOLD is a closed window, not an error', async () => {
    const slot = await freshSlot();
    bookingServer.setOverride(CLINIC_BOOKING_ENDPOINTS.holdAvailabilityBooking.path, () => ({
      status: 409,
      payload: { statusCode: '409', message: 'That appointment slot is no longer available — it was taken.' },
    }));

    // RandoxWindowExpiredError and not RandoxApiError: the caller shows "that
    // time has gone, choose another" rather than an error page.
    await expect(
      booking().holdAvailabilityBooking(CRUMLIN, slot.slotReference, slot.startUtc),
    ).rejects.toBeInstanceOf(RandoxWindowExpiredError);

    bookingServer.setOverride(CLINIC_BOOKING_ENDPOINTS.holdAvailabilityBooking.path, null);
  });

  it('A HOLD CAN FAIL INSIDE A 200, and is not read as a hold that worked', async () => {
    /**
     * OBSERVED (Aug 2026). A real hold answers `{BookingId, SuccessFailCode,
     * FailureDescription, NewAppointmentDateTime}` — the same four fields the
     * OpenAPI file declares only on RescheduleAppointment. So the envelope is
     * shared, and a REFUSED hold is a successful HTTP response: the transport
     * does not throw, and a client reading only the status gets a hold with a
     * null booking id and finds out two requests later, at a create that 400s
     * for reasons that make no sense there.
     */
    const slot = await freshSlot();
    bookingServer.setOverride(CLINIC_BOOKING_ENDPOINTS.holdAvailabilityBooking.path, () => ({
      status: 200,
      payload: {
        BookingId: null,
        SuccessFailCode: 'Fail',
        FailureDescription: 'That appointment slot is no longer available.',
        NewAppointmentDateTime: null,
      },
    }));

    // And the slot being gone is a race, so it surfaces as a closed window —
    // "that time has gone, choose another" — rather than an error page.
    await expect(
      booking().holdAvailabilityBooking(CRUMLIN, slot.slotReference, slot.startUtc),
    ).rejects.toBeInstanceOf(RandoxWindowExpiredError);

    bookingServer.setOverride(CLINIC_BOOKING_ENDPOINTS.holdAvailabilityBooking.path, null);
  });

  it('a soft failure that is NOT a lost slot is a fault, not a closed window', async () => {
    const slot = await freshSlot();
    bookingServer.setOverride(CLINIC_BOOKING_ENDPOINTS.holdAvailabilityBooking.path, () => ({
      status: 200,
      payload: {
        BookingId: null,
        SuccessFailCode: 'Fail',
        FailureDescription: 'Randox Booking failure, invalid location id.',
        NewAppointmentDateTime: null,
      },
    }));

    const attempt = booking().holdAvailabilityBooking(CRUMLIN, slot.slotReference, slot.startUtc);
    await expect(attempt).rejects.not.toBeInstanceOf(RandoxWindowExpiredError);
    // The sentence Randox sent survives into the message, rather than being
    // flattened to "the hold failed".
    await expect(attempt).rejects.toThrow(/invalid location id/);

    bookingServer.setOverride(CLINIC_BOOKING_ENDPOINTS.holdAvailabilityBooking.path, null);
  });

  it('A HOLD THAT EXPIRED is refused at the create, as a closed window', async () => {
    const slot = await freshSlot();
    const hold = await booking().holdAvailabilityBooking(CRUMLIN, slot.slotReference, slot.startUtc);

    bookingServer.setOverride(CLINIC_BOOKING_ENDPOINTS.createRandoxBooking.path, () => ({
      status: 409,
      payload: {
        statusCode: '409',
        message: 'The 30-minute hold on this slot has expired. The appointment was not booked.',
      },
    }));

    await expect(
      booking().createRandoxBooking({
        holdReference: hold.holdReference,
        bookingId: hold.bookingId!,
        appointmentId: hold.appointmentId!,
        serviceLocationId: CRUMLIN,
        slotReference: slot.slotReference,
        startUtc: slot.startUtc,
        gpExternalNumber: bookingFixtures.FIXTURE_GP_EXTERNAL_NUMBER,
        patient: PATIENT,
      }),
    ).rejects.toBeInstanceOf(RandoxWindowExpiredError);

    bookingServer.setOverride(CLINIC_BOOKING_ENDPOINTS.createRandoxBooking.path, null);
  });

  it('A BOOKING THAT FAILS AFTER A HOLD is a fault, and is NOT dressed up as a lost slot', async () => {
    const slot = await freshSlot();
    const hold = await booking().holdAvailabilityBooking(CRUMLIN, slot.slotReference, slot.startUtc);

    bookingServer.setOverride(CLINIC_BOOKING_ENDPOINTS.createRandoxBooking.path, () => ({
      status: 500,
      payload: { statusCode: '500', message: 'Internal error.' },
    }));

    const attempt = booking().createRandoxBooking({
      holdReference: hold.holdReference,
      bookingId: hold.bookingId!,
      appointmentId: hold.appointmentId!,
      serviceLocationId: CRUMLIN,
      slotReference: slot.slotReference,
      startUtc: slot.startUtc,
      gpExternalNumber: bookingFixtures.FIXTURE_GP_EXTERNAL_NUMBER,
      patient: PATIENT,
    });

    // THE DISTINCTION MATTERS TO THE PATIENT. Randox falling over is not "that
    // time has gone": the slot is still held for the rest of the 30 minutes and
    // trying again is the right advice. Telling them to pick another time would
    // give up a slot they still have.
    await expect(attempt).rejects.not.toBeInstanceOf(RandoxWindowExpiredError);
    await expect(attempt).rejects.toThrow(/500/);

    bookingServer.setOverride(CLINIC_BOOKING_ENDPOINTS.createRandoxBooking.path, null);
  });

  it('A CREATE IS NEVER RETRIED, because a retried booking is a second appointment', async () => {
    const slot = await freshSlot();
    const hold = await booking().holdAvailabilityBooking(CRUMLIN, slot.slotReference, slot.startUtc);

    let attempts = 0;
    bookingServer.setOverride(CLINIC_BOOKING_ENDPOINTS.createRandoxBooking.path, () => {
      attempts += 1;
      return { status: 503, payload: { statusCode: '503', message: 'Service unavailable.' } };
    });

    await expect(
      booking().createRandoxBooking({
        holdReference: hold.holdReference,
        bookingId: hold.bookingId!,
        appointmentId: hold.appointmentId!,
        serviceLocationId: CRUMLIN,
        slotReference: slot.slotReference,
        startUtc: slot.startUtc,
        gpExternalNumber: bookingFixtures.FIXTURE_GP_EXTERNAL_NUMBER,
        patient: PATIENT,
      }),
    ).rejects.toThrow();

    // 503 is on the retryable list and this call is not. Same reasoning as
    // CreatePendingOrder: a gateway error says nothing about whether the
    // booking landed, and a retry bleeds and bills somebody twice.
    expect(attempts).toBe(1);

    bookingServer.setOverride(CLINIC_BOOKING_ENDPOINTS.createRandoxBooking.path, null);
  });

  it('A CANCEL sends Randox’s own booking-order id and nothing else', async () => {
    const slot = await freshSlot();
    const hold = await booking().holdAvailabilityBooking(CRUMLIN, slot.slotReference, slot.startUtc);
    const confirmed = await booking().createRandoxBooking({
      holdReference: hold.holdReference,
      bookingId: hold.bookingId!,
      appointmentId: hold.appointmentId!,
      serviceLocationId: CRUMLIN,
      slotReference: slot.slotReference,
      startUtc: slot.startUtc,
      gpExternalNumber: bookingFixtures.FIXTURE_GP_EXTERNAL_NUMBER,
      patient: PATIENT,
    });

    await booking().cancelRandoxBooking(confirmed.randoxBookingOrderId!, bookingFixtures.FIXTURE_GP_EXTERNAL_NUMBER);
    const cancelCall = bookingServer.requests.at(-1)!;
    // ONE FIELD. Not a booking reference of ours, not GPExternalNumber.
    expect(cancelCall.body).toEqual({ RandoxBookingOrderId: confirmed.randoxBookingOrderId });

    // And cancelling it twice is a closed window rather than a fault.
    await expect(
      booking().cancelRandoxBooking(confirmed.randoxBookingOrderId!, bookingFixtures.FIXTURE_GP_EXTERNAL_NUMBER),
    ).rejects.toBeInstanceOf(RandoxWindowExpiredError);
  });
});

// ---------------------------------------------------------------------------
// The service layer, over the same wire
// ---------------------------------------------------------------------------

describe('the booking service', () => {
  const ORDER_NUMBER = 'GC1123-00000091';

  beforeEach(async () => {
    for (const value of Object.values(db)) {
      if (value && typeof value === 'object' && 'rows' in value) (value as { rows: unknown[] }).rows.length = 0;
    }
    seedCatalogue(db);
    seedPatient(db, { id: 'p1', firstName: 'Fixture', lastName: 'Patient', dob: '1990-01-01', sex: 'FEMALE' });
    const order = seedOrder(db, { orderNumber: ORDER_NUMBER, patientId: 'p1', randoxOrderId: 91 });
    order.collectionMethod = 'IN_CLINIC';
  });

  it('stores every identifier the create will need at the moment of the hold', async () => {
    const { holdSlot } = await import('../src/modules/randox/bookingService.js');
    const slots = await booking().availabilityDetails(CRUMLIN, bookingFixtures.FIXTURE_SLOT_DAY);
    const slot = slots[0];

    const { appointment } = await holdSlot({
      orderNumber: ORDER_NUMBER,
      serviceLocationId: CRUMLIN,
      slotReference: slot.slotReference,
      startUtc: slot.startUtc,
      actorUserId: null,
    });

    // The create is a separate request, possibly after a reload. Anything held
    // only in memory between the two is a booking that cannot be completed.
    expect(appointment.slotReference).toBe(slot.slotReference);
    expect(appointment.holdBookingId).toBeTypeOf('number');
    expect(appointment.holdAppointmentId).toBeTypeOf('number');
    expect(appointment.serviceId).toBe(787);
  });

  it('confirms the booking with the order number as GPExternalNumber, and keeps the cancel id', async () => {
    const { holdSlot, confirmBooking } = await import('../src/modules/randox/bookingService.js');
    const slots = await booking().availabilityDetails(CRUMLIN, bookingFixtures.FIXTURE_SLOT_DAY);

    await holdSlot({
      orderNumber: ORDER_NUMBER,
      serviceLocationId: CRUMLIN,
      slotReference: slots[1].slotReference,
      startUtc: slots[1].startUtc,
      actorUserId: null,
    });
    const result = await confirmBooking(ORDER_NUMBER, null);

    expect(result.ok).toBe(true);
    const bookCall = bookingServer.requests.filter((r) => r.path.endsWith('CreateRandoxBooking')).at(-1)!;
    expect((bookCall.body as Record<string, unknown>).GPExternalNumber).toBe(ORDER_NUMBER);

    const appointment = db.randoxAppointment.rows.at(-1)!;
    expect(appointment.status).toBe('BOOKED');
    expect(appointment.randoxBookingOrderId).toBeTypeOf('number');
  });

  it('refuses to book a patient with no address rather than sending an empty one', async () => {
    const { holdSlot, confirmBooking } = await import('../src/modules/randox/bookingService.js');
    // The one clinic that has to find this person is the one being told where
    // they live, so a blank is worse than a refusal.
    const profile = db.patientProfile.rows[0];
    profile.addressEncrypted = null;
    profile.postcode = null;

    const slots = await booking().availabilityDetails(CRUMLIN, bookingFixtures.FIXTURE_SLOT_DAY);
    await holdSlot({
      orderNumber: ORDER_NUMBER,
      serviceLocationId: CRUMLIN,
      slotReference: slots[2].slotReference,
      startUtc: slots[2].startUtc,
      actorUserId: null,
    });

    await expect(confirmBooking(ORDER_NUMBER, null)).rejects.toThrow(/address, postcode/);
  });
});
