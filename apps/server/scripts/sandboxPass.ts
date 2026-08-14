/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../src/config/env.js';
import { bookingConnection, bookingServiceId, nexusConnection, randoxClinicId, setDiscoveredClinicId } from '../src/modules/randox/config.js';
import { RandoxHttpClient } from '../src/modules/randox/http/RandoxHttpClient.js';
import { CLINIC_BOOKING_ENDPOINTS, NEXUS_ENDPOINTS } from '../src/modules/randox/endpoints.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE SANDBOX PASS — one command, the whole documented flow, every response
 *  written down verbatim.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   npm run sandbox:pass --workspace=apps/server
 *
 * WHY THIS IS A SCRIPT AND NOT A TEST. It calls a third party, it creates a
 * real order in their sandbox, and it is the only record that will ever exist
 * of what the Clinic Booking API's responses look like — that collection has
 * no response examples at all. A test that did this would run on every `npm
 * test` and place an order each time.
 *
 * ── WHAT IT WRITES ─────────────────────────────────────────────────────────
 *
 * One file per call, in order, under
 * `src/modules/randox/specs/sandbox-responses/`, each carrying the REQUEST
 * that produced it beside the response. Verbatim: the raw body text is kept
 * as well as the parsed object, because "we read it through tolerant helpers
 * and this is what came out" is not a record of what they sent.
 *
 * Then `ANSWERS.md`, which answers the seven open questions FROM THE CAPTURE
 * and says plainly where the sandbox did not settle one. A question the run
 * could not answer is written down as unanswered — a blank is a result.
 *
 * ── WHAT IT REFUSES TO DO ──────────────────────────────────────────────────
 *
 *  · Run against anything but the `stes-` sandbox hosts. Checked on the
 *    resolved base URLs, not on a flag somebody could forget to set.
 *  · Run with NODE_ENV=production, at all.
 *  · Send one byte of real patient data. The fixture below is invented and is
 *    obviously invented; nothing reads a database.
 *  · Record a credential. Request headers are never captured, and the two
 *    that matter (the bearer and the subscription key) are added by the
 *    transport rather than by this file.
 */

// ---------------------------------------------------------------------------
// The fixture. INVENTED, and deliberately obvious about it.
// ---------------------------------------------------------------------------

const FIXTURE = {
  firstName: 'Testpatient',
  lastName: 'Sandbox',
  dateOfBirth: '1990-01-01',
  biologicalSexId: 1,
  email: 'sandbox.fixture@example.invalid',
  contactNumber: '07000000000',
  addressLine1: '1 Example Street',
  addressLine2: 'Testing',
  townCity: 'Testville',
  postalCode: 'BS2 9RX',
  countryId: 1,
} as const;

/**
 * LocationId 30, "Clinic Location Crumlin", which Randox confirm has real
 * availability — NOT the collection's 15, which may have an empty diary. An
 * empty diary and a broken integration look identical from the outside, so the
 * first run has to be against a location known to have slots.
 */
const DEFAULT_LOCATION_ID = process.env.SANDBOX_LOCATION_ID ?? '30';

const OUT_DIR = path.resolve('src/modules/randox/specs/sandbox-responses');

interface Capture {
  step: number;
  api: 'Nexus' | 'Clinic Booking';
  name: string;
  method: string;
  path: string;
  request: unknown;
  status: number;
  ok: boolean;
  /** Parsed, where it parsed. */
  body: unknown;
  /** Exactly what came back on the wire, before anything read it. */
  raw: string;
  note?: string;
}

const captures: Capture[] = [];
let step = 0;

function slug(name: string): string {
  return name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function call(
  client: RandoxHttpClient,
  api: Capture['api'],
  name: string,
  endpoint: { path: string; verb: 'GET' | 'POST' },
  body?: unknown,
  note?: string,
): Promise<Capture> {
  step += 1;
  const { res, text } = await client.requestRaw(endpoint.path, {
    method: endpoint.verb,
    body,
    // A create is never retried, here as everywhere else: a 502 says nothing
    // about whether it landed, and this script places real sandbox orders.
    retryable: !/Create/i.test(name),
  });
  let parsed: unknown = null;
  try {
    parsed = text.trim() === '' ? null : JSON.parse(text);
  } catch {
    parsed = null;
  }
  const capture: Capture = {
    step,
    api,
    name,
    method: endpoint.verb,
    path: endpoint.path,
    request: body ?? null,
    status: res.status,
    ok: res.ok,
    body: parsed,
    raw: text,
    ...(note ? { note } : {}),
  };
  captures.push(capture);
  fs.writeFileSync(
    path.join(OUT_DIR, `${String(step).padStart(2, '0')}-${slug(name)}.json`),
    `${JSON.stringify(capture, null, 2)}\n`,
  );
  console.log(`  ${String(step).padStart(2, '0')}  ${res.status}  ${endpoint.verb} ${endpoint.path}  (${name})`);
  return capture;
}

/** Reads a field under any of the spellings this API has been seen to use. */
function pick(body: unknown, ...names: string[]): unknown {
  if (body === null || typeof body !== 'object') return undefined;
  const record = body as Record<string, unknown>;
  for (const n of names) {
    if (record[n] !== undefined && record[n] !== null) return record[n];
    const lower = n.charAt(0).toLowerCase() + n.slice(1);
    if (record[lower] !== undefined && record[lower] !== null) return record[lower];
    const upper = n.charAt(0).toUpperCase() + n.slice(1);
    if (record[upper] !== undefined && record[upper] !== null) return record[upper];
  }
  return undefined;
}

function assertSandbox(): void {
  const nexus = nexusConnection();
  const booking = bookingConnection();
  const problems: string[] = [];
  if (env.NODE_ENV === 'production') problems.push('NODE_ENV is production.');
  if (env.RANDOX_TRANSPORT !== 'live') problems.push('RANDOX_TRANSPORT is not "live", so there is nothing to call.');
  for (const [label, url] of [['Nexus', nexus.baseUrl], ['Clinic Booking', booking.baseUrl]] as const) {
    if (!/(^|\/\/)stes-/.test(url)) problems.push(`${label} base URL "${url}" is not a stes- sandbox host.`);
  }
  for (const [label, c] of [['Nexus', nexus], ['Clinic Booking', booking]] as const) {
    if (!c.subscriptionKey.trim()) problems.push(`${label}: no subscription key (Ocp-Apim-Subscription-Key).`);
    if (!c.username.trim() || !c.password.trim()) problems.push(`${label}: no ROPC username/password.`);
  }
  if (problems.length > 0) {
    console.error('Refusing to run the sandbox pass:\n' + problems.map((p) => `  - ${p}`).join('\n'));
    console.error(
      '\nThis script talks to a third party and creates an order. It runs only against the stes- sandbox, only with\n' +
        'RANDOX_TRANSPORT=live, and only with both credentials present. See .env.example → Randox API integration.',
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  assertSandbox();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const nexus = new RandoxHttpClient(nexusConnection());
  const booking = new RandoxHttpClient(bookingConnection());

  console.log('\n── Reference data ─────────────────────────────────────────────');
  // Q2: GET or POST on the live gateway. Every one of the eight is called with
  // the verb the spec declares; a 404/405 here is the answer, recorded as one.
  for (const [name, ep] of Object.entries(NEXUS_ENDPOINTS)) {
    if (ep.verb !== 'GET') continue;
    await call(nexus, 'Nexus', name, ep, undefined, 'Reference data. The spec declares GET; earlier guidance said POST.');
  }

  const clinicCapture = captures.find((c) => c.name === 'getMyClinicDetails');
  const clinicId = Number(pick(clinicCapture?.body, 'id', 'clinicId') ?? NaN);
  if (Number.isInteger(clinicId)) setDiscoveredClinicId(clinicId);
  console.log(`  clinic id: ${randoxClinicId() ?? 'UNKNOWN'}`);

  const testReasons = pick(captures.find((c) => c.name === 'getTestingReasons')?.body, 'testReasons', 'items');
  const firstReasonId = Array.isArray(testReasons) ? pick(testReasons[0], 'id') : undefined;
  const panels = pick(captures.find((c) => c.name === 'getPanels')?.body, 'panels', 'testPanels', 'items');
  const firstPanelId = Array.isArray(panels) ? pick(panels[0], 'id') : undefined;

  console.log('\n── Nexus: create a pending order ──────────────────────────────');
  const created = await call(nexus, 'Nexus', 'CreatePendingOrder', NEXUS_ENDPOINTS.createPendingOrder, {
    firstName: FIXTURE.firstName,
    lastName: FIXTURE.lastName,
    dateOfBirth: FIXTURE.dateOfBirth,
    biologicalSexId: FIXTURE.biologicalSexId,
    testClinicLocationId: randoxClinicId(),
    isHealthCheckPanelReport: env.RANDOX_HEALTH_CHECK_PANEL_REPORT,
    panelIds: firstPanelId === undefined ? [] : [firstPanelId],
    testIds: [],
    testReasons: [{ id: firstReasonId ?? 1, details: 'Sandbox integration test.' }],
  });

  // BOTH identifiers, kept apart. The creation response carries orderId and
  // externalNumber; everything afterwards answers with orderNumber, and whether
  // those two are the same string is question 1.
  const orderId = pick(created.body, 'orderId');
  const externalNumber = String(pick(created.body, 'externalNumber') ?? '');
  console.log(`  orderId ${String(orderId)} · externalNumber ${externalNumber}`);

  console.log('\n── Clinic Booking ─────────────────────────────────────────────');
  await call(booking, 'Clinic Booking', 'GetServiceLocations', CLINIC_BOOKING_ENDPOINTS.getServiceLocations, {
    ServiceId: bookingServiceId(),
  });

  const searchFrom = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const availability = await call(
    booking,
    'Clinic Booking',
    'AvailabilityDetails',
    CLINIC_BOOKING_ENDPOINTS.availabilityDetails,
    { ServiceId: String(bookingServiceId()), LocationId: Number(DEFAULT_LOCATION_ID), SearchFrom: `${searchFrom}T00:00:00.000Z` },
    'Q6: how many dates come back, and are they consecutive. Randox document "usually 7", and "may not be consecutive".',
  );

  const slots = (pick(availability.body, 'availability', 'availabilityDetails', 'slots') ?? []) as unknown[];
  const first = Array.isArray(slots) ? slots[0] : undefined;
  const slotId = String(pick(first, 'appointmentSlotId', 'slotId', 'id') ?? '');
  const slotStart = String(pick(first, 'appointmentSlotDateTime', 'startUtc', 'start') ?? '');
  if (!slotId || !slotStart) {
    console.error(`  no slots at location ${DEFAULT_LOCATION_ID}. Everything up to here is captured; the booking half is not.`);
    writeAnswers({ orderId, externalNumber, clinicId: randoxClinicId(), holdAt: null, slotCount: countDates(slots) });
    return;
  }

  const holdAt = Date.now();
  const hold = await call(
    booking,
    'Clinic Booking',
    'HoldAvailabilityBooking',
    CLINIC_BOOKING_ENDPOINTS.holdAvailabilityBooking,
    {
      ServiceId: bookingServiceId(),
      LocationId: String(DEFAULT_LOCATION_ID),
      AppointmentSlotId: slotId,
      AppointmentSlotDate: dayFirst(slotStart),
      AppointmentSlotTIme: timeOfDay(slotStart),
    },
    'Q4: do BookingId and AppointmentId come back from here. Q5: what expiry, if any, is stated.',
  );

  const bookingId = pick(hold.body, 'bookingId');
  const appointmentId = pick(hold.body, 'appointmentId');

  const bookingBody = {
    BookingId: bookingId,
    ServiceId: String(bookingServiceId()),
    LocationId: String(DEFAULT_LOCATION_ID),
    AppointmentId: appointmentId,
    AppointmentSlotId: slotId,
    AppointmentSlotDate: `${slotStart.slice(0, 10)}T00:00:00Z`,
    AppointmentSlotTIme: timeOfDay(slotStart),
    FirstName: FIXTURE.firstName,
    LastName: FIXTURE.lastName,
    DateOfBirth: `${FIXTURE.dateOfBirth}T00:00:00`,
    BiologicalSexId: FIXTURE.biologicalSexId,
    EmailAddress: FIXTURE.email,
    ConfirmEmailAddress: FIXTURE.email,
    ContactNumber: FIXTURE.contactNumber,
    AddressLine1: FIXTURE.addressLine1,
    AddressLine2: FIXTURE.addressLine2,
    TownCity: FIXTURE.townCity,
    PostalCode: FIXTURE.postalCode,
    CountryId: FIXTURE.countryId,
    CommunicationPreferenceEmail: false,
    CommunicationPreferenceSMS: false,
    CommunicationPreferenceTelephone: false,
    GPExternalNumber: externalNumber,
  };
  const booked = await call(booking, 'Clinic Booking', 'CreateRandoxBooking', CLINIC_BOOKING_ENDPOINTS.createRandoxBooking, bookingBody);

  // Q7: a SECOND booking against the same GPExternalNumber. Asked here rather
  // than left to a support ticket, because the answer decides whether the
  // composed reschedule can ever leave two live appointments behind. Whatever
  // comes back — accepted or refused — is the answer, so a non-2xx is captured
  // rather than thrown.
  await call(
    booking,
    'Clinic Booking',
    'CreateRandoxBooking-second-against-same-GPExternalNumber',
    CLINIC_BOOKING_ENDPOINTS.createRandoxBooking,
    bookingBody,
    'Q7: does a second booking against one GPExternalNumber succeed or fail.',
  ).catch((e: unknown) => {
    console.log(`  (second create rejected: ${e instanceof Error ? e.message : 'unknown'})`);
    return undefined;
  });

  console.log('\n── Nexus: order status, 1 → 4 ─────────────────────────────────');
  const seen = new Map<number, Capture>();
  const deadlineMs = Number(process.env.SANDBOX_STATUS_TIMEOUT_MINUTES ?? 20) * 60_000;
  const startedAt = Date.now();
  while (Date.now() - startedAt < deadlineMs) {
    const status = await call(nexus, 'Nexus', `GetOrderStatus-${seen.size + 1}`, NEXUS_ENDPOINTS.getOrderStatus, {
      OrderNumber: externalNumber,
      OrderId: orderId,
      ClinicId: randoxClinicId(),
    });
    const code = Number(pick(status.body, 'statusId') ?? NaN);
    if (Number.isInteger(code) && !seen.has(code)) seen.set(code, status);
    if (code === 4 || code === 5) break;
    await new Promise((r) => setTimeout(r, 60_000));
  }

  if (seen.has(4)) {
    console.log('\n── Nexus: results ─────────────────────────────────────────────');
    await call(nexus, 'Nexus', 'GetOrderResultReports', NEXUS_ENDPOINTS.getOrderResultReports, {
      clinicId: randoxClinicId(),
      orderNumber: externalNumber,
    });
    await call(nexus, 'Nexus', 'GetOrderResultDetail', NEXUS_ENDPOINTS.getOrderResultDetail, {
      clinicId: randoxClinicId(),
      orderNumber: externalNumber,
    });
  } else {
    console.log(`\n  order never reached status 4 within the window. Statuses seen: ${[...seen.keys()].join(', ') || 'none'}.`);
  }

  console.log('\n── Clinic Booking: cancel ─────────────────────────────────────');
  const randoxBookingOrderId = pick(booked.body, 'randoxBookingOrderId', 'bookingOrderId', 'orderId');
  if (randoxBookingOrderId !== undefined) {
    await call(booking, 'Clinic Booking', 'CancelRandoxBooking', CLINIC_BOOKING_ENDPOINTS.cancelRandoxBooking, {
      RandoxBookingOrderId: randoxBookingOrderId,
    });
  } else {
    console.log('  the create response carried no RandoxBookingOrderId, so the cancel cannot be sent. Recorded as unanswered.');
  }

  writeAnswers({
    orderId,
    externalNumber,
    clinicId: randoxClinicId(),
    holdAt,
    slotCount: countDates(slots),
    statusOrderNumbers: [...seen.values()].map((c) => String(pick(c.body, 'orderNumber') ?? '')),
  });
}

function dayFirst(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}
function timeOfDay(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
function countDates(slots: unknown): { total: number; dates: string[] } {
  if (!Array.isArray(slots)) return { total: 0, dates: [] };
  const dates = [
    ...new Set(
      slots
        .map((s) => String(pick(s, 'appointmentSlotDateTime', 'startUtc', 'start') ?? '').slice(0, 10))
        .filter(Boolean),
    ),
  ].sort();
  return { total: slots.length, dates };
}

/**
 * The seven questions, answered from the capture — and left UNANSWERED in as
 * many words where the run did not settle one. A question with a blank beside
 * it is a result and is written as one; the failure this guards against is a
 * summary that reads as complete because every row has something in it.
 */
function writeAnswers(ctx: {
  orderId: unknown;
  externalNumber: string;
  clinicId: number | null;
  holdAt: number | null;
  slotCount: { total: number; dates: string[] };
  statusOrderNumbers?: string[];
}): void {
  const referenceGets = captures.filter((c) => c.method === 'GET');
  const lines: string[] = [];
  const q = (n: number, question: string, answer: string) => lines.push(`## ${n}. ${question}\n\n${answer}\n`);

  lines.push('# The sandbox pass\n');
  lines.push(`Captured ${captures.length} calls. Every response body is beside this file, one per call, with the request that produced it.\n`);
  lines.push(`Order: orderId \`${String(ctx.orderId)}\`, externalNumber \`${ctx.externalNumber}\`. Clinic id \`${ctx.clinicId ?? 'unknown'}\`.\n`);

  const returned = (ctx.statusOrderNumbers ?? []).filter(Boolean);
  q(
    1,
    'Does the orderNumber returned by GetOrderStatus equal the externalNumber from CreatePendingOrder, byte for byte?',
    returned.length === 0
      ? 'UNANSWERED — GetOrderStatus returned no orderNumber in this run.'
      : returned.every((n) => n === ctx.externalNumber)
        ? `YES. Every GetOrderStatus response returned \`${ctx.externalNumber}\`, identical to the creation response's externalNumber. reconcileOrderNumber() can be simplified once a second order agrees.`
        : `NO. externalNumber was \`${ctx.externalNumber}\`; GetOrderStatus returned ${returned.map((n) => `\`${n}\``).join(', ')}. The three-column model is required, and automatic linking must keep joining on randoxOrderId.`,
  );

  q(
    2,
    'Do the eight reference endpoints take GET or POST on the live gateway?',
    referenceGets.length === 0
      ? 'UNANSWERED — no reference call was made.'
      : referenceGets.every((c) => c.ok)
        ? `GET. All ${referenceGets.length} answered 2xx to GET: ${referenceGets.map((c) => `${c.name} ${c.status}`).join(', ')}. The spec is right and RANDOX_REFERENCE_DATA_METHOD=get is correct.`
        : `MIXED — ${referenceGets.filter((c) => !c.ok).map((c) => `${c.name} ${c.status}`).join(', ')} did not accept GET. See the capture files.`,
  );

  const detail = captures.find((c) => c.name === 'GetOrderResultDetail');
  const rows = (pick(detail?.body, 'reportResults') ?? []) as unknown[];
  const firstRow = Array.isArray(rows) ? rows[0] : undefined;
  const rowKeys = firstRow && typeof firstRow === 'object' ? Object.keys(firstRow as object) : [];
  q(
    3,
    'Is there a stable analyte code on a result, or is the name the only identifier?',
    rowKeys.length === 0
      ? 'UNANSWERED — no result detail was returned in this run (the order did not reach status 4).'
      : `The keys on a result row are: ${rowKeys.map((k) => `\`${k}\``).join(', ')}.\n\n` +
        (rowKeys.some((k) => /code|id/i.test(k) && !/order/i.test(k))
          ? 'A code-shaped field IS present — see the capture and decide whether it is stable before analyteMap.ts is changed to use it.'
          : 'NO CODE. The analyte string is the only identifier, exactly as modules/randox/analyteMap.ts assumes.'),
  );

  const hold = captures.find((c) => c.name === 'HoldAvailabilityBooking');
  const hasBookingId = pick(hold?.body, 'bookingId') !== undefined;
  const hasAppointmentId = pick(hold?.body, 'appointmentId') !== undefined;
  q(
    4,
    'Do BookingId and AppointmentId come from the HoldAvailabilityBooking response?',
    hold === undefined
      ? 'UNANSWERED — no hold was placed.'
      : `BookingId ${hasBookingId ? 'PRESENT' : 'ABSENT'}, AppointmentId ${hasAppointmentId ? 'PRESENT' : 'ABSENT'}` +
        (hasBookingId && hasAppointmentId
          ? `. Equal to each other: ${String(pick(hold.body, 'bookingId')) === String(pick(hold.body, 'appointmentId'))} (the collection sends 1144015 for both).`
          : '. The inference in LiveClinicBookingClient.holdAvailabilityBooking is not confirmed; see the capture for what the hold actually returns.'),
  );

  const expiry = pick(hold?.body, 'expiresAtUtc', 'expiresAt', 'holdExpiry', 'expiryDateTime');
  q(
    5,
    'What is the hold TTL in practice? (documented 30 minutes)',
    hold === undefined
      ? 'UNANSWERED — no hold was placed.'
      : expiry === undefined
        ? 'The hold response states NO expiry. The 30 minutes stays a client-side deadline (HOLD_DURATION_MS), which is what confirmBooking now enforces before calling Randox.'
        : `The hold response states an expiry of \`${String(expiry)}\`, which is ${ctx.holdAt ? Math.round((Date.parse(String(expiry)) - ctx.holdAt) / 60000) : '?'} minutes from the request.`,
  );

  const consecutive = ctx.slotCount.dates.every(
    (d, i, all) => i === 0 || Date.parse(d) - Date.parse(all[i - 1]) === 86_400_000,
  );
  q(
    6,
    'How many dates does AvailabilityDetails return, and are they consecutive?',
    ctx.slotCount.dates.length === 0
      ? 'UNANSWERED — no slots came back.'
      : `${ctx.slotCount.dates.length} distinct dates across ${ctx.slotCount.total} slots: ${ctx.slotCount.dates.join(', ')}. ` +
        `${consecutive ? 'Consecutive.' : 'NOT consecutive'} — which matches the flow document: "The objective is to present 7 dates of available appointments, which depending on availability, may not be consecutive dates."`,
  );

  const second = captures.find((c) => c.name.startsWith('CreateRandoxBooking-second'));
  q(
    7,
    'Does a second CreateRandoxBooking against one GPExternalNumber succeed or fail?',
    second === undefined
      ? 'UNANSWERED — the second create was not sent.'
      : second.ok
        ? `IT SUCCEEDS (${second.status}). Two live bookings can exist against one order number, so the composed reschedule MUST cancel the old one and a failure there must be audited — which it is.`
        : `IT IS REFUSED (${second.status}). The composed reschedule cannot leave two live appointments behind; the "book before cancel" ordering still stands, since a refusal leaves the original intact.`,
  );

  fs.writeFileSync(path.join(OUT_DIR, 'ANSWERS.md'), `${lines.join('\n')}\n`);
  console.log(`\nWrote ${captures.length} captures and ANSWERS.md to ${OUT_DIR}\n`);
}

main().catch((e: unknown) => {
  console.error(`\nThe sandbox pass stopped: ${e instanceof Error ? e.message : String(e)}`);
  console.error(`${captures.length} call(s) were captured before it stopped; they are in ${OUT_DIR}.`);
  process.exit(1);
});
