/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import {
  RANDOX_DOCUMENTED,
  RANDOX_DOCUMENTED_BOOKING_BIOLOGICAL_SEX,
  RANDOX_TRANSPORT_DEFAULTS,
  bookingBiologicalSexId,
} from '../src/modules/randox/documentedDefaults.js';
import type { RandoxApiConnection } from '../src/modules/randox/connection.js';
import { RandoxHttpClient } from '../src/modules/randox/http/RandoxHttpClient.js';
import { assertWithinDocumentedLimit } from '../src/modules/randox/http/rateLimiter.js';
import { CLINIC_BOOKING_ENDPOINTS, NEXUS_ENDPOINTS } from '../src/modules/randox/endpoints.js';
import {
  pickArray,
  pickNumber,
  pickString,
  slotDateDayFirst,
  slotDateIsoMidnightZ,
  slotInstantFromWireParts,
  slotTimeOfDay,
} from '../src/modules/randox/clients/parse.js';

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
 * ── IT IS STANDALONE, AND THAT IS A REQUIREMENT RATHER THAN A TIDINESS ─────
 *
 * It used to import `src/config/env.ts`, which parses the SERVER's whole
 * configuration at module scope — so running it demanded APP_BASE_URL,
 * API_BASE_URL, DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET,
 * CSRF_SECRET, ENCRYPTION_KEY and FILE_SIGNING_SECRET. It failed before it made
 * a single call, and it failed listing eight things that have nothing to do
 * with calling an external API: this script has no database, issues no
 * sessions, signs no files and serves no requests. It reads credentials, makes
 * HTTP calls and writes files.
 *
 * So it reads `process.env` directly, for the Randox settings only, and
 * REFUSES BY NAME when a credential is missing. Everything documented and
 * non-secret — both base URLs, both client ids, both scopes, the token
 * endpoint, the service ids, the sandbox location — comes from
 * `modules/randox/documentedDefaults.ts`, which is the same file the server's
 * env schema defaults from. One source, so the scope this script sends and the
 * scope production sends cannot drift apart.
 *
 * What it does NOT do is re-implement the transport. It builds a
 * `RandoxApiConnection` and hands it to the real `RandoxHttpClient` — real B2C
 * ROPC auth, real headers, real pacing, real retry, real 401 handling — because
 * a capture taken through a second implementation is a record of the second
 * implementation.
 *
 * ── THE CLINIC BOOKING HALF IS OPTIONAL ────────────────────────────────────
 *
 * Booking is not in this portal's scope (see the feature flag note in
 * CLAUDE.md) and the Clinic Booking subscription key is a separate credential
 * from a separate developer portal. Without it the Nexus flow runs ALONE and
 * `ANSWERS.md` records, in as many words, that questions 4 to 11 went unasked
 * and why. It does not fail: a Nexus capture is worth having on its own, and
 * refusing to take one for want of an unrelated key would be the script
 * choosing all-or-nothing on the user's behalf.
 *
 * ── WHAT IT WRITES ─────────────────────────────────────────────────────────
 *
 * One file per call, in order, under
 * `src/modules/randox/specs/sandbox-responses/`, each carrying the REQUEST
 * that produced it beside the response. Verbatim: the raw body text is kept
 * as well as the parsed object, because "we read it through tolerant helpers
 * and this is what came out" is not a record of what they sent.
 *
 * Then `ANSWERS.md`, which answers the eleven open questions FROM THE CAPTURE
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

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * `.env.sandbox` first, then `.env`, and anything already in the real
 * environment beats both — dotenv does not overwrite what is already set.
 *
 * Two files rather than one because they hold different things. `.env` is what
 * the SERVER needs to boot on this machine; `.env.sandbox` is the credentials
 * for somebody else's API. Keeping the Randox pair in their own file is what
 * lets this script need nothing else, which is the whole point of the change:
 * a file with two keys and a password in it, and no database URL anywhere near
 * it. Both are gitignored.
 */
loadDotenv({ path: path.join(SERVER_ROOT, '.env.sandbox') });
loadDotenv({ path: path.join(SERVER_ROOT, '.env') });

const OUT_DIR = path.join(SERVER_ROOT, 'src/modules/randox/specs/sandbox-responses');

// ---------------------------------------------------------------------------
// The fixture. INVENTED, and deliberately obvious about it.
// ---------------------------------------------------------------------------

const FIXTURE = {
  firstName: 'Testpatient',
  lastName: 'Sandbox',
  dateOfBirth: '1990-01-01',
  email: 'sandbox.fixture@example.invalid',
  contactNumber: '07000000000',
  addressLine1: '1 Example Street',
  addressLine2: 'Testing',
  townCity: 'Testville',
  postalCode: 'BS2 9RX',
  countryId: 1,
} as const;

// ---------------------------------------------------------------------------
// Configuration — process.env only, Randox only, and it says what is missing
// ---------------------------------------------------------------------------

function read(name: string): string {
  return (process.env[name] ?? '').trim();
}

/** The first of several spellings that is set. Shared pair, per-API override. */
function readFirst(...names: string[]): string {
  for (const name of names) {
    const value = read(name);
    if (value !== '') return value;
  }
  return '';
}

function readInt(name: string, fallback: number): number {
  const raw = read(name);
  if (raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} is "${raw}", which is not an integer.`);
  }
  return parsed;
}

function readBool(name: string, fallback: boolean): boolean {
  const raw = read(name).toLowerCase();
  if (raw === '') return fallback;
  if (raw !== 'true' && raw !== 'false') {
    throw new Error(`${name} is "${raw}", which is neither "true" nor "false".`);
  }
  return raw === 'true';
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * A credential this run cannot proceed without, and the several variable names
 * it may arrive under. Reported by NAME, all at once — finding out about three
 * missing credentials one run at a time is its own kind of waste.
 */
interface CredentialNeed {
  names: string[];
  why: string;
}

function missingOf(needs: CredentialNeed[]): CredentialNeed[] {
  return needs.filter((need) => readFirst(...need.names) === '');
}

function describe(needs: CredentialNeed[]): string {
  return needs.map((n) => `  - ${n.names.join(' (or ')}${n.names.length > 1 ? ')' : ''} — ${n.why}`).join('\n');
}

const ROPC_WHY = 'ROPC is a password grant, so it needs the service account created in the developer portal';

function transportSettings() {
  const maxRequestsPerMinute = readInt('RANDOX_MAX_REQUESTS_PER_MINUTE', RANDOX_TRANSPORT_DEFAULTS.maxRequestsPerMinute);
  // The same guard the server boots with. A pace above Randox's documented
  // ceiling is a mistake wherever it is set, and this script is the one place
  // that would discover it against the real gateway.
  assertWithinDocumentedLimit(maxRequestsPerMinute);
  return {
    maxRequestsPerMinute,
    retryMaxAttempts: readInt('RANDOX_RETRY_MAX_ATTEMPTS', RANDOX_TRANSPORT_DEFAULTS.retryMaxAttempts),
    retryBaseDelayMs: readInt('RANDOX_RETRY_BASE_DELAY_MS', RANDOX_TRANSPORT_DEFAULTS.retryBaseDelayMs),
    bearerTokenEnabled: readBool('RANDOX_BEARER_TOKEN_ENABLED', RANDOX_TRANSPORT_DEFAULTS.bearerTokenEnabled),
  };
}

const NEXUS_NEEDS: CredentialNeed[] = [
  { names: ['RANDOX_NEXUS_SUBSCRIPTION_KEY'], why: 'Ocp-Apim-Subscription-Key on every Nexus request, from the Nexus developer portal' },
  { names: ['RANDOX_NEXUS_USERNAME', 'RANDOX_USERNAME'], why: ROPC_WHY },
  { names: ['RANDOX_NEXUS_PASSWORD', 'RANDOX_PASSWORD'], why: ROPC_WHY },
];

const BOOKING_NEEDS: CredentialNeed[] = [
  { names: ['RANDOX_BOOKING_SUBSCRIPTION_KEY'], why: 'a SEPARATE key from a separate developer portal — not the Nexus one' },
  { names: ['RANDOX_BOOKING_USERNAME', 'RANDOX_USERNAME'], why: ROPC_WHY },
  { names: ['RANDOX_BOOKING_PASSWORD', 'RANDOX_PASSWORD'], why: ROPC_WHY },
];

function nexusConnection(): RandoxApiConnection {
  return {
    label: 'Nexus Lab',
    baseUrl: trimTrailingSlash(readFirst('RANDOX_NEXUS_BASE_URL') || RANDOX_DOCUMENTED.nexusBaseUrl),
    clientId: readFirst('RANDOX_NEXUS_CLIENT_ID') || RANDOX_DOCUMENTED.nexusClientId,
    scope: readFirst('RANDOX_NEXUS_SCOPE') || RANDOX_DOCUMENTED.nexusScope,
    subscriptionKey: read('RANDOX_NEXUS_SUBSCRIPTION_KEY'),
    tokenUrl: readFirst('RANDOX_NEXUS_TOKEN_URL', 'RANDOX_B2C_TOKEN_URL') || RANDOX_DOCUMENTED.b2cTokenUrl,
    username: readFirst('RANDOX_NEXUS_USERNAME', 'RANDOX_USERNAME'),
    password: readFirst('RANDOX_NEXUS_PASSWORD', 'RANDOX_PASSWORD'),
    transport: transportSettings(),
  };
}

function bookingConnection(): RandoxApiConnection {
  return {
    label: 'Clinic Booking',
    baseUrl: trimTrailingSlash(readFirst('RANDOX_BOOKING_BASE_URL') || RANDOX_DOCUMENTED.bookingBaseUrl),
    clientId: readFirst('RANDOX_BOOKING_CLIENT_ID') || RANDOX_DOCUMENTED.bookingClientId,
    scope: readFirst('RANDOX_BOOKING_SCOPE') || RANDOX_DOCUMENTED.bookingScope,
    subscriptionKey: read('RANDOX_BOOKING_SUBSCRIPTION_KEY'),
    tokenUrl: readFirst('RANDOX_BOOKING_TOKEN_URL', 'RANDOX_B2C_TOKEN_URL') || RANDOX_DOCUMENTED.b2cTokenUrl,
    username: readFirst('RANDOX_BOOKING_USERNAME', 'RANDOX_USERNAME'),
    password: readFirst('RANDOX_BOOKING_PASSWORD', 'RANDOX_PASSWORD'),
    transport: transportSettings(),
  };
}

interface SandboxPlan {
  nexus: RandoxApiConnection;
  /** null when the booking credentials are absent — the Nexus flow runs alone. */
  booking: RandoxApiConnection | null;
  /** Why the booking half is not running, in words, for ANSWERS.md. */
  bookingSkipped: string | null;
  bookingServiceId: number;
  region: 'UK' | 'ROI';
  locationId: number;
  clinicIdOverride: number | null;
  testClinicLocationIdOverride: number | null;
  healthCheckPanelReport: boolean;
  cvScoreRequired: boolean;
  statusWindowMs: number;
}

/**
 * Builds the plan, or exits naming exactly what is missing.
 *
 * THE ONLY REQUIRED THINGS ARE RANDOX CREDENTIALS. No database, no signing
 * secrets, no app URLs — none of which this script has any use for. The old
 * failure listed eight of them and mentioned none of the three that matter.
 */
function planOrExit(): SandboxPlan {
  const region = read('RANDOX_BOOKING_REGION') === 'ROI' ? 'ROI' : 'UK';
  const nexus = nexusConnection();

  const missingNexus = missingOf(NEXUS_NEEDS);
  if (missingNexus.length > 0) {
    console.error(
      `Refusing to run the sandbox pass: ${missingNexus.length} Randox credential(s) are missing.\n` +
        describe(missingNexus) +
        '\n\nThose are the ONLY things this script needs. It does not touch the database, issue sessions or sign\n' +
        'files, so it does not want DATABASE_URL, the JWT secrets, ENCRYPTION_KEY, FILE_SIGNING_SECRET or the app\n' +
        `URLs. Put them in ${path.join(SERVER_ROOT, '.env.sandbox')} (gitignored) or in the shell.\n` +
        'See src/modules/randox/specs/sandbox-responses/README.md.',
    );
    process.exit(1);
  }

  const missingBooking = missingOf(BOOKING_NEEDS);
  const booking = missingBooking.length === 0 ? bookingConnection() : null;
  const bookingSkipped =
    booking === null
      ? `the Clinic Booking credentials are not set (${missingBooking.map((n) => n.names[0]).join(', ')})`
      : null;

  // The sandbox check runs on the URLs that will actually be called — the
  // booking one only if the booking half is running at all.
  const problems: string[] = [];
  if (process.env.NODE_ENV === 'production') problems.push('NODE_ENV is production.');
  const hosts: [string, string][] = [['Nexus', nexus.baseUrl]];
  if (booking) hosts.push(['Clinic Booking', booking.baseUrl]);
  for (const [label, url] of hosts) {
    if (!/(^|\/\/)stes-/.test(url)) problems.push(`${label} base URL "${url}" is not a stes- sandbox host.`);
  }
  if (problems.length > 0) {
    console.error(
      'Refusing to run the sandbox pass:\n' +
        problems.map((p) => `  - ${p}`).join('\n') +
        '\n\nThis script talks to a third party and creates an order. It runs only against the stes- sandbox hosts,\n' +
        'which are the defaults, and never under NODE_ENV=production.',
    );
    process.exit(1);
  }

  // A pending order that is never booked does not progress, so polling it for
  // twenty minutes learns nothing after the first call. One GetOrderStatus is
  // all question 1 needs.
  const defaultStatusMinutes = booking ? 20 : 2;

  return {
    nexus,
    booking,
    bookingSkipped,
    region,
    bookingServiceId:
      region === 'ROI'
        ? readInt('RANDOX_BOOKING_SERVICE_ID_ROI', RANDOX_DOCUMENTED.bookingServiceIdRoi)
        : readInt('RANDOX_BOOKING_SERVICE_ID_UK', RANDOX_DOCUMENTED.bookingServiceIdUk),
    locationId: readInt('SANDBOX_LOCATION_ID', RANDOX_DOCUMENTED.sandboxTestLocationId),
    clinicIdOverride: read('RANDOX_CLINIC_ID') === '' ? null : readInt('RANDOX_CLINIC_ID', 0),
    testClinicLocationIdOverride:
      read('RANDOX_TEST_CLINIC_LOCATION_ID') === '' ? null : readInt('RANDOX_TEST_CLINIC_LOCATION_ID', 0),
    healthCheckPanelReport: readBool('RANDOX_HEALTH_CHECK_PANEL_REPORT', true),
    cvScoreRequired: readBool('RANDOX_CV_SCORE_REQUIRED', false),
    statusWindowMs: readInt('SANDBOX_STATUS_TIMEOUT_MINUTES', defaultStatusMinutes) * 60_000,
  };
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

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

/**
 * Every scalar this API produces should be treated as a string and coerced at
 * the boundary — ids come back as strings on some endpoints and integers on
 * others (see the note in endpoints.ts). Returns null rather than NaN.
 */
function asInt(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

// ---------------------------------------------------------------------------
// EVERY ID THE ORDER SENDS COMES OUT OF THE REFERENCE CAPTURES
// ---------------------------------------------------------------------------
//
// THE POINT OF THE REFERENCE STEP IS THAT EVERYTHING AFTER IT USES REAL IDS,
// and the first run proved why by doing the opposite. It sent
// `TestReasons: [{Id: firstReasonId ?? 1}]`, the pick failed, the `?? 1` fired
// — and id 1 happens to be a real testing reason in this sandbox, so the
// request passed validation on a value nobody had read off anything. It was
// right by luck. The call still 400'd, on the other field that had silently
// fallen back:
//
//   {"errors":{"Request":["No panels or test items provided"]}}
//
// WHY BOTH PICKS FAILED, WHICH IS ONE FACT AND NOT TWO: **the eight reference
// endpoints return BARE TOP-LEVEL ARRAYS**, not an object with the list under
// a key. `GetPanels` is `[{id, name, code, panelType, …}]` and not
// `{panels: [...]}`. The script was reading `body.panels ?? body.items`, which
// on an array is undefined, so both lists came back empty.
//
// The production client was never wrong about this — `pickArray` in
// clients/parse.ts handles a bare array as its FIRST case. The script had
// reinvented a helper that already existed and got it wrong, so it uses the
// real one now, along with `pickNumber` and `pickString`.
//
// THERE ARE NO FALLBACK IDS ANY MORE. A value that cannot be resolved from a
// capture is REFUSED BY NAME, and the run stops before the create rather than
// sending a plausible number. A default that is accidentally valid is worse
// than one that is obviously invalid: it produces an order nobody chose the
// contents of, and a green run that proves nothing.

/** What was chosen, and where it was read from. Printed, so a reader can check. */
interface Chosen<T> {
  value: T;
  from: string;
}

function referenceBody(name: string): unknown {
  return captures.find((c) => c.name === name)?.body;
}

/** The list an endpoint returned, bare array or wrapped, via the real helper. */
function referenceList(name: string, ...wrapperNames: string[]): unknown[] {
  return pickArray(referenceBody(name), ...wrapperNames);
}

interface PanelChoice {
  id: number;
  name: string;
  code: string;
  items: number;
}

/**
 * Which panel to order.
 *
 * DEFAULT: THE ONE WITH THE MOST TEST ITEMS, tie broken by the lowest id so a
 * rerun orders the same thing. Two reasons, and the second is the load-bearing
 * one:
 *
 *  · The richer the panel, the more analyte spellings come back on
 *    GetOrderResultDetail — which is question 3, and is the only thing that can
 *    ever move `confirmedAgainstRealPayload` off its hardcoded zero.
 *  · **25 of this sandbox's 616 panels have NO test items at all**, and
 *    ordering one reproduces the exact 400 above. "First in the array" is a
 *    coin toss on that; "most items" cannot land on one.
 *
 * SANDBOX_PANEL_CODE (e.g. `HSC6` for Standard Screen) or SANDBOX_PANEL_ID
 * overrides it. An override is honoured even if the panel is empty — it was
 * asked for by name — but says so first.
 */
function choosePanel(): Chosen<PanelChoice> | null {
  const raw = referenceList('getPanels', 'panels', 'testPanels');
  const panels: PanelChoice[] = raw
    .map((p) => ({
      id: asInt(pickNumber(p, 'id')) ?? -1,
      name: pickString(p, 'name') ?? '',
      code: pickString(p, 'code') ?? '',
      items: pickArray(p, 'testItems').length,
    }))
    .filter((p) => p.id >= 0);
  if (panels.length === 0) return null;

  const wantedId = read('SANDBOX_PANEL_ID');
  const wantedCode = read('SANDBOX_PANEL_CODE');
  if (wantedId !== '') {
    const match = panels.find((p) => String(p.id) === wantedId);
    return match ? { value: match, from: `SANDBOX_PANEL_ID=${wantedId}` } : null;
  }
  if (wantedCode !== '') {
    const match = panels.find((p) => p.code.toLowerCase() === wantedCode.toLowerCase());
    return match ? { value: match, from: `SANDBOX_PANEL_CODE=${wantedCode}` } : null;
  }

  const withItems = panels.filter((p) => p.items > 0);
  if (withItems.length === 0) return null;
  const best = withItems.sort((a, b) => b.items - a.items || a.id - b.id)[0];
  return { value: best, from: `GetPanels — the largest of ${panels.length} panels, by test items` };
}

/** A single test item, for the case where no panel has any contents. */
function chooseTestItem(): Chosen<{ id: number; name: string }> | null {
  const items = referenceList('getTests', 'tests', 'testItems')
    .map((t) => ({ id: asInt(pickNumber(t, 'id')) ?? -1, name: pickString(t, 'name') ?? '' }))
    .filter((t) => t.id >= 0);
  if (items.length === 0) return null;
  const wanted = read('SANDBOX_TEST_ID');
  if (wanted !== '') {
    const match = items.find((t) => String(t.id) === wanted);
    return match ? { value: match, from: `SANDBOX_TEST_ID=${wanted}` } : null;
  }
  return { value: items[0], from: `GetTests — the first of ${items.length}` };
}

/**
 * The testing reason. REQUIRED and required non-empty by the spec's own schema.
 *
 * Preferred by NAME from a short list, because this product is private health
 * screening and "Wellness screening / health check" is the honest description
 * of why the sample was taken — the reason is a real clinical field and not a
 * form to be filled with whatever sorts first. Falls back to the first the
 * endpoint returned, which is still a real id; a rename at Randox degrades to
 * that rather than to a guess. SANDBOX_TEST_REASON_ID pins it.
 */
const PREFERRED_TEST_REASONS = ['wellness screening / health check', "at the patient's request"];

function chooseTestReason(): Chosen<{ id: number; name: string }> | null {
  const reasons = referenceList('getTestingReasons', 'testReasons')
    .map((r) => ({ id: asInt(pickNumber(r, 'id')) ?? -1, name: pickString(r, 'name') ?? '' }))
    .filter((r) => r.id >= 0);
  if (reasons.length === 0) return null;

  const wanted = read('SANDBOX_TEST_REASON_ID');
  if (wanted !== '') {
    const match = reasons.find((r) => String(r.id) === wanted);
    return match ? { value: match, from: `SANDBOX_TEST_REASON_ID=${wanted}` } : null;
  }
  for (const preferred of PREFERRED_TEST_REASONS) {
    const match = reasons.find((r) => r.name.trim().toLowerCase() === preferred);
    if (match) return { value: match, from: 'GetTestingReasons — matched by name' };
  }
  return { value: reasons[0], from: `GetTestingReasons — the first of ${reasons.length}` };
}

/**
 * Which biological sex the fixture is recorded as, resolved to an id FROM THE
 * LIST THE API RETURNED rather than assumed to be 1.
 *
 * A wrong BiologicalSexId changes which reference ranges the laboratory
 * applies, so it is not a field to hardcode even for an invented patient.
 *
 * The NAME is taken from the panel where the panel names one — ordering
 * "Signature woman" for a patient recorded as male is a contradiction the
 * sandbox may or may not reject, and there is no reason to find out. Female
 * first in the test, because "female" contains "male".
 */
function biologicalSexNameFor(panelName: string): string {
  const configured = read('SANDBOX_BIOLOGICAL_SEX');
  if (configured !== '') return configured;
  if (/\b(female|woman|women)\b/i.test(panelName)) return 'Female';
  if (/\b(male|man|men)\b/i.test(panelName)) return 'Male';
  // The panel does not say. Arbitrary, and overridable.
  return 'Female';
}

/**
 * The Nexus BiologicalSexId, resolved BY NAME from the Nexus capture.
 *
 * Nexus has an endpoint for this and Clinic Booking does not, which is why the
 * two are resolved by different functions rather than by one with a parameter.
 * See `chooseBookingBiologicalSexId` below.
 */
function chooseBiologicalSexId(captureName: string, wantedName: string): Chosen<number> | null {
  const list = referenceList(captureName, 'biologicalSex', 'biologicalSexes')
    .map((s) => ({ id: asInt(pickNumber(s, 'id')) ?? -1, name: pickString(s, 'name') ?? '' }))
    .filter((s) => s.id >= 0);
  if (list.length === 0) return null;
  const match = list.find((s) => s.name.trim().toLowerCase() === wantedName.trim().toLowerCase());
  if (!match) return null;
  return { value: match.id, from: `${captureName} — "${match.name}"` };
}

/**
 * ---------------------------------------------------------------------------
 * THE BOOKING'S BiologicalSexId, WHICH IS AN ASSUMPTION AND IS LABELLED ONE.
 * ---------------------------------------------------------------------------
 *
 * Clinic Booking publishes no endpoint for it. `BiologicalSex/GetBiologicalSex`
 * was this script's probe and Randox answered 404; it is not in the portal's
 * operation list. So there is nothing to resolve against and the id comes from
 * the CreateRandoxBooking operation's own DESCRIPTION in the OpenAPI file:
 * "Note - Biological Sex Id: Male = 1, Female = 2".
 *
 * WHY THAT IS BETTER THAN BORROWING THE NEXUS ID, which was the obvious
 * fallback: it is a Clinic Booking statement about Clinic Booking, rather than
 * an assumption that two APIs behind two gateways with two subscription keys
 * share an id space. Nexus's own list is used as a CROSS-CHECK — it returns the
 * same pair — and agreement between an independent source and the documented
 * one is corroboration. It is not the source, and the ANSWERS.md entry says so.
 *
 * WHAT REMAINS ASSUMED, and is reported as an assumption rather than as an
 * answer: a prose note is not an enumeration. The spec still declares an
 * orphaned `BiologicalSexResponse` schema that no path references — an endpoint
 * WITHDRAWN rather than one that never existed — so the real list is probably
 * longer than two and nothing here can see it.
 *
 * A name the note does not cover is REFUSED. BiologicalSexId decides which
 * reference ranges a laboratory applies, so a guessed one is a wrong clinical
 * answer rather than a failed request.
 */
interface BookingSexChoice {
  id: number;
  name: string;
  /** What the Nexus capture said for the same name, for the cross-check. */
  nexusId: number | null;
}

function chooseBookingBiologicalSexId(wantedName: string): Chosen<BookingSexChoice> | null {
  const id = bookingBiologicalSexId(wantedName);
  if (id === null) return null;
  return {
    value: { id, name: wantedName, nexusId: chooseBiologicalSexId('getBiologicalSex', wantedName)?.value ?? null },
    from: 'clinic-booking-openapi3.json — the CreateRandoxBooking description, "Male = 1, Female = 2"',
  };
}

/**
 * TestClinicLocationId, from `clinicTestLocations` on GetMyClinicDetails.
 *
 * The list is the authority, not the clinic id: they are equal for a
 * single-site clinic (this sandbox returns 1298 for both) and differ the moment
 * a clinic has a second site, at which point "use the clinic id" would be
 * silently ordering against the wrong place. RANDOX_TEST_CLINIC_LOCATION_ID
 * still wins, because choosing between several sites is a deployment decision.
 */
function chooseTestClinicLocationId(override: number | null): Chosen<number> | null {
  if (override !== null) return { value: override, from: 'RANDOX_TEST_CLINIC_LOCATION_ID' };
  const details = referenceBody('getMyClinicDetails');
  const locations = pickArray(details, 'clinicTestLocations');
  const first = asInt(pickNumber(locations[0], 'id'));
  if (first !== null) {
    return {
      value: first,
      from: `GetMyClinicDetails.clinicTestLocations[0]${locations.length > 1 ? ` (of ${locations.length} — set RANDOX_TEST_CLINIC_LOCATION_ID to choose)` : ''}`,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// The pass
// ---------------------------------------------------------------------------

interface Outcome {
  orderId: unknown;
  externalNumber: string;
  clinicId: number | null;
  holdAt: number | null;
  slotCount: { total: number; dates: string[] };
  statusOrderNumbers: string[];
  bookingSkipped: string | null;
  /** Set when the booking half ran but stopped early, e.g. no slots. */
  bookingStoppedAt: string | null;
  /** Whether the credential probe answered 2xx. Null when it was not reached. */
  serviceRegionsOk: boolean | null;
  /**
   * The booking's BiologicalSexId and where it came from. An ASSUMPTION, and
   * ANSWERS.md files it as one — Clinic Booking has no endpoint for this.
   */
  bookingSex: BookingSexChoice | null;
  /** Why the reschedule was not attempted, where it was not. */
  rescheduleSkipped: string | null;
  /**
   * What the order actually carried, every field of it read out of a reference
   * capture. In ANSWERS.md because "which panel produced these analytes" is the
   * first thing anybody reading a result capture needs to know.
   */
  ordered: {
    panel: string | null;
    testId: number | null;
    reason: string;
    biologicalSexId: number;
    biologicalSexName: string;
    testClinicLocationId: number;
  } | null;
}

/**
 * THE DIRECTORY HOLDS ONE RUN, AND CLEARING IT IS PART OF THAT.
 *
 * Files are numbered by step, so a shorter run leaves the tail of a longer
 * earlier one behind — the first run stopped at 10 calls, and a run that
 * stopped at 9 would leave `10-…json` sitting there from a different order,
 * a different day and a different request, with nothing in the filename to
 * say so. An evidence directory that silently interleaves two runs is worse
 * than an empty one.
 */
function clearPreviousRun(): void {
  if (!fs.existsSync(OUT_DIR)) return;
  const stale = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.json') || f === 'ANSWERS.md');
  for (const file of stale) fs.rmSync(path.join(OUT_DIR, file));
  if (stale.length > 0) console.log(`Cleared ${stale.length} file(s) from the previous run. README.md is kept.`);
}

async function main(): Promise<void> {
  const plan = planOrExit();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  clearPreviousRun();

  console.log(`\nNexus            ${plan.nexus.baseUrl}`);
  console.log(
    `Clinic Booking   ${plan.booking ? plan.booking.baseUrl : `NOT RUNNING — ${plan.bookingSkipped ?? 'skipped'}`}`,
  );
  console.log(`Bearer           ${plan.nexus.transport.bearerTokenEnabled ? 'on' : 'OFF (diagnostic)'}`);

  const outcome: Outcome = {
    orderId: undefined,
    externalNumber: '',
    clinicId: null,
    holdAt: null,
    slotCount: { total: 0, dates: [] },
    statusOrderNumbers: [],
    bookingSkipped: plan.bookingSkipped,
    bookingStoppedAt: null,
    serviceRegionsOk: null,
    bookingSex: null,
    rescheduleSkipped: null,
    ordered: null,
  };

  const nexus = new RandoxHttpClient(plan.nexus);
  const booking = plan.booking ? new RandoxHttpClient(plan.booking) : null;

  console.log('\n── Reference data ─────────────────────────────────────────────');
  // Q2: GET or POST on the live gateway. Every one of the eight is called with
  // the verb the spec declares; a 404/405 here is the answer, recorded as one.
  for (const [name, ep] of Object.entries(NEXUS_ENDPOINTS)) {
    if (ep.verb !== 'GET') continue;
    await call(nexus, 'Nexus', name, ep, undefined, 'Reference data. The spec declares GET; earlier guidance said POST.');
  }

  outcome.clinicId = plan.clinicIdOverride ?? asInt(pickNumber(referenceBody('getMyClinicDetails'), 'id', 'clinicId'));
  console.log(`  clinic id: ${outcome.clinicId ?? 'UNKNOWN'}`);

  // ── Everything the order sends, resolved from the captures above ──────────
  console.log('\n── What the order will carry, and where each id came from ─────');
  const problems: string[] = [];

  const location = chooseTestClinicLocationId(plan.testClinicLocationIdOverride);
  const panel = choosePanel();
  const testItem = panel === null || panel.value.items === 0 ? chooseTestItem() : null;
  const reason = chooseTestReason();
  const sexName = biologicalSexNameFor(panel?.value.name ?? '');
  const sex = chooseBiologicalSexId('getBiologicalSex', sexName);

  function report<T>(label: string, chosen: Chosen<T> | null, show: (v: T) => string, missing: string): void {
    if (chosen === null) {
      if (missing !== '') problems.push(missing);
      console.log(`  ${label.padEnd(22)} MISSING`);
      return;
    }
    console.log(`  ${label.padEnd(22)} ${show(chosen.value)}   ← ${chosen.from}`);
  }

  report('TestClinicLocationId', location, (v) => String(v),
    'No TestClinicLocationId. GetMyClinicDetails returned no clinicTestLocations and RANDOX_TEST_CLINIC_LOCATION_ID is unset.');
  report('BiologicalSexId', sex, (v) => String(v),
    `No BiologicalSexId. GetBiologicalSex returned nothing named "${sexName}" — set SANDBOX_BIOLOGICAL_SEX to a name it does return.`);
  report('TestReasons[0].Id', reason, (v) => `${v.id} — ${v.name}`,
    'No testing reason. GetTestingReasons returned an empty list, and TestReasons is required non-empty by the spec.');
  if (panel !== null) {
    report('PanelIds', panel, (v) => `${v.id} — ${v.name} (${v.code}), ${v.items} test items`, '');
    if (panel.value.items === 0) {
      console.log('    ⚠ that panel has NO test items. Randox answer "No panels or test items provided" to an order of one.');
    }
  }
  if (testItem !== null) report('TestIds', testItem, (v) => `${v.id} — ${v.name}`, '');
  if (panel === null && testItem === null) {
    problems.push(
      'Neither a panel nor a test item could be resolved. This is the exact 400 the first run got — ' +
        '"No panels or test items provided" — and it is refused here rather than sent.',
    );
  }

  if (problems.length > 0) {
    // Refused rather than defaulted. The reference captures above are the point
    // of the run so far and are already written; ANSWERS.md records question 2,
    // which this run DID settle, and marks the rest unanswered.
    console.error(
      `\n  Refusing to create the order: ${problems.length} required value(s) could not be read from the reference data.\n` +
        problems.map((p) => `    - ${p}`).join('\n') +
        '\n  Nothing is defaulted here on purpose — an id that is accidentally valid produces an order nobody chose.',
    );
    writeAnswers(outcome);
    return;
  }

  outcome.ordered = {
    panel: panel === null ? null : `${panel.value.id} (${panel.value.code}, ${panel.value.name}, ${panel.value.items} items)`,
    testId: testItem?.value.id ?? null,
    reason: `${reason!.value.id} — ${reason!.value.name}`,
    biologicalSexId: sex!.value,
    biologicalSexName: sexName,
    testClinicLocationId: location!.value,
  };

  console.log('\n── Nexus: create a pending order ──────────────────────────────');
  // PascalCase, exactly as the spec's own CreatePendingOrder example is
  // written — this API is not consistent with itself between endpoints, so
  // each request carries the casing ITS example uses.
  const created = await call(nexus, 'Nexus', 'CreatePendingOrder', NEXUS_ENDPOINTS.createPendingOrder, {
    FirstName: FIXTURE.firstName,
    LastName: FIXTURE.lastName,
    DateOfBirth: FIXTURE.dateOfBirth,
    BiologicalSexId: sex!.value,
    TestClinicLocationId: location!.value,
    // One or the other, never neither — that is the 400 this run exists past.
    PanelIds: panel === null ? [] : [panel.value.id],
    TestIds: testItem === null ? [] : [testItem.value.id],
    IsHealthCheckPanelReport: plan.healthCheckPanelReport,
    IsCvScoreRequired: plan.cvScoreRequired,
    // Required, and required NON-EMPTY by the spec's own schema.
    TestReasons: [{ Id: reason!.value.id, Details: 'Sandbox integration test.' }],
  });

  // BOTH identifiers, kept apart. The creation response carries orderId and
  // externalNumber; everything afterwards answers with orderNumber, and whether
  // those two are the same string is question 1.
  outcome.orderId = pick(created.body, 'orderId');
  outcome.externalNumber = String(pick(created.body, 'externalNumber') ?? '');
  console.log(`  orderId ${String(outcome.orderId)} · externalNumber ${outcome.externalNumber}`);

  if (booking) {
    await runBookingHalf(booking, plan, outcome);
  } else {
    console.log(`\n── Clinic Booking ─── NOT RUNNING: ${plan.bookingSkipped ?? 'skipped'}`);
  }

  console.log('\n── Nexus: order status ────────────────────────────────────────');
  const seen = new Map<number, Capture>();
  const startedAt = Date.now();
  let attempt = 0;
  while (Date.now() - startedAt < plan.statusWindowMs) {
    attempt += 1;
    const status = await call(nexus, 'Nexus', `GetOrderStatus-attempt-${attempt}`, NEXUS_ENDPOINTS.getOrderStatus, {
      // PascalCase here and camelCase on the two result endpoints, because
      // that is how each endpoint's OWN example is written. ClinicId is sent
      // on the strength of the flow diagram against two silent examples.
      OrderNumber: outcome.externalNumber,
      OrderId: outcome.orderId,
      ClinicId: outcome.clinicId,
    });
    outcome.statusOrderNumbers.push(String(pick(status.body, 'orderNumber') ?? ''));
    const code = asInt(pick(status.body, 'statusId'));
    if (code !== null && !seen.has(code)) seen.set(code, status);
    if (code === 4 || code === 5) break;
    if (Date.now() - startedAt + 60_000 >= plan.statusWindowMs) break;
    await new Promise((r) => setTimeout(r, 60_000));
  }

  if (seen.has(4)) {
    console.log('\n── Nexus: results ─────────────────────────────────────────────');
    await call(nexus, 'Nexus', 'GetOrderResultReports', NEXUS_ENDPOINTS.getOrderResultReports, {
      clinicId: outcome.clinicId,
      orderNumber: outcome.externalNumber,
    });
    await call(nexus, 'Nexus', 'GetOrderResultDetail', NEXUS_ENDPOINTS.getOrderResultDetail, {
      clinicId: outcome.clinicId,
      orderNumber: outcome.externalNumber,
    });
  } else {
    console.log(`\n  order never reached status 4 within the window. Statuses seen: ${[...seen.keys()].join(', ') || 'none'}.`);
  }

  writeAnswers(outcome);
}

/**
 * Regions → locations → availability → hold → book → reschedule → (a second
 * book) → cancel.
 *
 * Everything here is skipped whole when the Clinic Booking credentials are
 * absent. It stops rather than throws where the sandbox has nothing to offer:
 * a location with an empty diary is a fact about the diary, and recording it
 * is more use than a stack trace.
 */
async function runBookingHalf(booking: RandoxHttpClient, plan: SandboxPlan, outcome: Outcome): Promise<void> {
  console.log('\n── Clinic Booking ─────────────────────────────────────────────');

  // ── THE PROBE, AND WHY IT IS THIS ONE NOW ───────────────────────────────
  //
  // The first run probed `BiologicalSex/GetBiologicalSex`, on the strength of
  // the CB auth document's worked example, and Randox answered
  //
  //   404 {"statusCode": 404, "message": "Resource not found"}
  //
  // The portal's operation list does not contain it and neither does the
  // OpenAPI definition. So the probe was testing an endpoint that does not
  // exist, which is the one thing a credential probe must not do: a 404 is
  // indistinguishable from a key that works, and a bad key would have looked
  // exactly the same as that run did.
  //
  // GetServiceRegions is the replacement. No body, no order, no side effect,
  // and it fails for precisely the reasons a bad key or a bad scope fails.
  const regions = await call(
    booking,
    'Clinic Booking',
    'GetServiceRegions',
    CLINIC_BOOKING_ENDPOINTS.getServiceRegions,
    undefined,
    'Q8: the cheap credential probe, replacing GetBiologicalSex — which 404s. Also: what does a region look like?',
  );
  outcome.serviceRegionsOk = regions.ok;
  if (!regions.ok) {
    console.error(
      `  GetServiceRegions answered ${regions.status}. That is the booking key or the booking scope, not the flow —\n` +
        '  nothing further would tell us anything. Stopping the booking half here.',
    );
    outcome.bookingStoppedAt = `GetServiceRegions answered ${regions.status}, so the credentials are not usable`;
    return;
  }

  // The booking body's BiologicalSexId is DOCUMENTED rather than fetched, and
  // is recorded as an assumption. See chooseBookingBiologicalSexId.
  const wantedSex = outcome.ordered?.biologicalSexName ?? 'Female';
  const bookingSex = chooseBookingBiologicalSexId(wantedSex);
  if (bookingSex === null) {
    console.error(
      `  No documented Clinic Booking BiologicalSexId for "${wantedSex}" — the spec's note covers only ` +
        `${Object.keys(RANDOX_DOCUMENTED_BOOKING_BIOLOGICAL_SEX).join(' and ')}.\n` +
        '  Refused rather than guessed: this field decides which ranges a laboratory applies.',
    );
    outcome.bookingStoppedAt = `No documented Clinic Booking BiologicalSexId for "${wantedSex}"`;
    return;
  }
  outcome.bookingSex = bookingSex.value;
  console.log(`  BiologicalSexId ${bookingSex.value.id}   ← ${bookingSex.from}`);
  console.log(
    `    cross-check: Nexus GetBiologicalSex says ${bookingSex.value.nexusId ?? 'nothing'} for "${wantedSex}" — ` +
      `${bookingSex.value.nexusId === bookingSex.value.id ? 'agrees' : 'DOES NOT AGREE'}`,
  );

  await call(booking, 'Clinic Booking', 'GetServiceLocations', CLINIC_BOOKING_ENDPOINTS.getServiceLocations, {
    ServiceId: plan.bookingServiceId,
  });

  const searchFrom = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const availability = await call(
    booking,
    'Clinic Booking',
    'AvailabilityDetails',
    CLINIC_BOOKING_ENDPOINTS.availabilityDetails,
    // No SearchTo. The collection shows a single SearchFrom, and a request
    // field the API has never been shown to accept is silently ignored.
    { ServiceId: String(plan.bookingServiceId), LocationId: plan.locationId, SearchFrom: `${searchFrom}T00:00:00.000Z` },
    'Q6: how many dates come back, and are they consecutive. Randox document "usually 7", and "may not be consecutive".',
  );

  // OBSERVED (Aug 2026): a BARE TOP-LEVEL ARRAY of
  // `{Id, Date, Time, AvailableQuantity}` — a day-first date and a bare HH:mm
  // in two fields, with no combined datetime anywhere and no epoch in the id.
  // The first run read `appointmentSlotDateTime` and four other invented names
  // and turned 114 slots into "no slots at location 30".
  const slots = Array.isArray(availability.body)
    ? availability.body
    : ((pick(availability.body, 'availability', 'availabilityDetails', 'slots') ?? []) as unknown[]);
  outcome.slotCount = countDates(slots);
  const first = Array.isArray(slots) ? slots[0] : undefined;
  const slotId = String(pick(first, 'appointmentSlotId', 'slotId', 'id') ?? '');
  // The one derivation, shared with the production client, so this script
  // cannot agree with itself about a slot's instant while the client disagrees.
  const slotStart =
    slotInstantFromWireParts(
      String(pick(first, 'date', 'appointmentSlotDate') ?? '') || null,
      String(pick(first, 'time', 'appointmentSlotTime') ?? '') || null,
    ) ?? String(pick(first, 'appointmentSlotDateTime', 'startUtc', 'start') ?? '');
  if (!slotId || !slotStart) {
    console.error(
      `  no usable slot at location ${plan.locationId} — ${Array.isArray(slots) ? slots.length : 0} row(s) came back and ` +
        `none carried both an id and a readable date/time. Keys on the first row: ` +
        `${first && typeof first === 'object' ? Object.keys(first).join(', ') : 'none'}.\n` +
        '  Everything up to here is captured; the booking half is not.',
    );
    outcome.bookingStoppedAt = `AvailabilityDetails returned no usable slot at LocationId ${plan.locationId}`;
    return;
  }
  console.log(`  ${Array.isArray(slots) ? slots.length : 0} slots · first ${slotStart} · id ${slotId}`);

  outcome.holdAt = Date.now();
  const hold = await call(
    booking,
    'Clinic Booking',
    'HoldAvailabilityBooking',
    CLINIC_BOOKING_ENDPOINTS.holdAvailabilityBooking,
    {
      ServiceId: plan.bookingServiceId,
      LocationId: String(plan.locationId),
      AppointmentSlotId: slotId,
      // Day-first here, ISO midnight on the create, two requests apart — each
      // endpoint gets what its OWN example uses. AppointmentSlotTIme keeps the
      // collection's capital I: correcting it sends no slot time at all.
      AppointmentSlotDate: slotDateDayFirst(slotStart),
      AppointmentSlotTIme: slotTimeOfDay(slotStart),
    },
    'Q4: do BookingId and AppointmentId come back from here. Q5: what expiry, if any, is stated.',
  );

  // ONE ID COMES BACK AND TWO GO OUT. The hold answers `{"BookingId": 87819,
  // "SuccessFailCode": "Success", ...}` with no AppointmentId anywhere, and the
  // first run sent the create without one — which Randox refused with
  // `400 "Randox Booking failure, invalid appointment id."`, naming the field.
  // The collection's own example sends the same number for both (1144015), and
  // the hold is the only prior call that could produce either.
  const holdBookingId = pick(hold.body, 'bookingId');
  const bookingBody = {
    BookingId: holdBookingId,
    ServiceId: String(plan.bookingServiceId),
    LocationId: String(plan.locationId),
    AppointmentId: pick(hold.body, 'appointmentId') ?? holdBookingId,
    AppointmentSlotId: slotId,
    AppointmentSlotDate: slotDateIsoMidnightZ(slotStart),
    AppointmentSlotTIme: slotTimeOfDay(slotStart),
    FirstName: FIXTURE.firstName,
    LastName: FIXTURE.lastName,
    DateOfBirth: `${FIXTURE.dateOfBirth}T00:00:00`,
    BiologicalSexId: bookingSex.value.id,
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
    GPExternalNumber: outcome.externalNumber,
  };
  const booked = await call(booking, 'Clinic Booking', 'CreateRandoxBooking', CLINIC_BOOKING_ENDPOINTS.createRandoxBooking, bookingBody);

  // ── Q9: RescheduleAppointment, called for the first time ────────────────
  //
  // Specified at last, in specs/clinic-booking-openapi3.json: four required
  // fields and a response SCHEMA, which no other Clinic Booking operation has.
  // It has been uncallable for two sessions — first because it was believed
  // fictional, then because it was named with no request shape — and this is
  // what it is for.
  //
  // THE ONE THING WORTH LEARNING HERE IS WHAT A FAILURE LOOKS LIKE.
  // `SuccessFailCode` reports a refusal INSIDE a 200, which nothing else on
  // either API does, and reading it wrong means telling a patient their
  // appointment moved when it did not. So a non-2xx is captured rather than
  // thrown, and the BODY of a 200 is what the answer is read from.
  //
  // It needs a SECOND slot. Where availability returned only one there is
  // nothing to move to, and that is written down rather than worked around.
  const secondSlot = Array.isArray(slots) ? slots[1] : undefined;
  const secondSlotId = String(pick(secondSlot, 'appointmentSlotId', 'slotId', 'id') ?? '');
  const appointmentId = asInt(
    pick(hold.body, 'appointmentId') ?? pick(booked.body, 'appointmentId') ?? pick(booked.body, 'bookingId') ?? holdBookingId,
  );
  if (secondSlotId && appointmentId !== null) {
    await call(
      booking,
      'Clinic Booking',
      'RescheduleAppointment',
      CLINIC_BOOKING_ENDPOINTS.rescheduleAppointment,
      {
        // camelCase and all four, exactly as the spec's schema declares them.
        appointmentId,
        serviceId: plan.bookingServiceId,
        locationId: plan.locationId,
        newAppointmentSlotId: secondSlotId,
      },
      'Q9: the first ever call to RescheduleAppointment. What does SuccessFailCode carry, and is a refusal a 200?',
    ).catch((e: unknown) => {
      console.log(`  (reschedule threw: ${e instanceof Error ? e.message : 'unknown'})`);
      return undefined;
    });
  } else {
    outcome.rescheduleSkipped =
      appointmentId === null
        ? 'the hold and create responses carried no appointmentId, which RescheduleAppointment requires'
        : 'AvailabilityDetails returned only one slot, so there was nowhere to move the appointment to';
    console.log(`  reschedule not attempted: ${outcome.rescheduleSkipped}`);
  }

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

  console.log('\n── Clinic Booking: cancel ─────────────────────────────────────');
  const randoxBookingOrderId = pick(booked.body, 'randoxBookingOrderId', 'bookingOrderId', 'orderId');
  if (randoxBookingOrderId !== undefined) {
    await call(booking, 'Clinic Booking', 'CancelRandoxBooking', CLINIC_BOOKING_ENDPOINTS.cancelRandoxBooking, {
      RandoxBookingOrderId: randoxBookingOrderId,
    });
  } else {
    console.log('  the create response carried no RandoxBookingOrderId, so the cancel cannot be sent. Recorded as unanswered.');
  }
}

/**
 * Distinct dates, as ISO yyyy-mm-dd so they sort and so "are they consecutive"
 * is arithmetic rather than string comparison.
 *
 * Randox send `Date` day-first ("17/08/2026"), which sorts by DAY OF MONTH —
 * so a naive sort puts the 1st of next month before the 17th of this one and
 * the consecutiveness check answers the wrong question.
 */
function countDates(slots: unknown): { total: number; dates: string[] } {
  if (!Array.isArray(slots)) return { total: 0, dates: [] };
  const dates = [
    ...new Set(
      slots
        .map((s) => {
          const instant =
            slotInstantFromWireParts(
              String(pick(s, 'date', 'appointmentSlotDate') ?? '') || null,
              String(pick(s, 'time', 'appointmentSlotTime') ?? '') || null,
            ) ?? String(pick(s, 'appointmentSlotDateTime', 'startUtc', 'start') ?? '');
          return instant.slice(0, 10);
        })
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
    ),
  ].sort();
  return { total: slots.length, dates };
}

/**
 * The eleven questions, answered from the capture — and left UNANSWERED in as
 * many words where the run did not settle one. A question with a blank beside
 * it is a result and is written as one; the failure this guards against is a
 * summary that reads as complete because every row has something in it.
 *
 * A SKIPPED BOOKING HALF IS RECORDED AS SEVEN UNANSWERED QUESTIONS AND A REASON,
 * never as an absence. "We did not ask" and "we asked and learned nothing" are
 * different states, and only one of them is worth rerunning for a key.
 */
function writeAnswers(ctx: Outcome): void {
  const referenceGets = captures.filter((c) => c.method === 'GET' && c.api === 'Nexus');
  const lines: string[] = [];
  const q = (n: number, question: string, answer: string) => lines.push(`## ${n}. ${question}\n\n${answer}\n`);

  /** The one sentence every booking question falls back to, said once. */
  const bookingUnavailable = ctx.bookingSkipped
    ? `UNANSWERED — the Clinic Booking half of the pass was NOT RUN, because ${ctx.bookingSkipped}. ` +
      'Nothing was asked, so nothing was learned; rerun with the booking key set. The Nexus half above is unaffected.'
    : ctx.bookingStoppedAt
      ? `UNANSWERED — the Clinic Booking half stopped before this call: ${ctx.bookingStoppedAt}.`
      : null;

  lines.push('# The sandbox pass\n');
  lines.push(`Captured ${captures.length} calls. Every response body is beside this file, one per call, with the request that produced it.\n`);
  lines.push(`Order: orderId \`${String(ctx.orderId)}\`, externalNumber \`${ctx.externalNumber}\`. Clinic id \`${ctx.clinicId ?? 'unknown'}\`.\n`);
  lines.push(
    ctx.ordered === null
      ? '**No order was created** — see the console output for which required id could not be read from the reference data. Nothing was defaulted.\n'
      : 'What the order carried, every value read from a reference capture rather than from config:\n\n' +
        `| Field | Value |\n| --- | --- |\n` +
        `| Panel | ${ctx.ordered.panel ?? '—'} |\n` +
        `| Test item | ${ctx.ordered.testId ?? '—'} |\n` +
        `| Testing reason | ${ctx.ordered.reason} |\n` +
        `| Biological sex | ${ctx.ordered.biologicalSexId} (${ctx.ordered.biologicalSexName}) |\n` +
        `| TestClinicLocationId | ${ctx.ordered.testClinicLocationId} |\n`,
  );
  lines.push(
    ctx.bookingSkipped
      ? `**Clinic Booking: NOT RUN** — ${ctx.bookingSkipped}. Questions 4 to 11 are unanswered for that reason and not because the sandbox was silent.\n`
      : '**Clinic Booking: run.**\n',
  );

  const returned = ctx.statusOrderNumbers.filter(Boolean);
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
  const created = captures.find((c) => c.name === 'CreateRandoxBooking');
  const sentAppointmentId = pick(created?.request, 'AppointmentId');
  q(
    4,
    'Do BookingId and AppointmentId come from the HoldAvailabilityBooking response?',
    hold === undefined
      ? (bookingUnavailable ?? 'UNANSWERED — no hold was placed.')
      : `BookingId ${hasBookingId ? 'PRESENT' : 'ABSENT'}, AppointmentId ${hasAppointmentId ? 'PRESENT' : 'ABSENT'}.\n\n` +
        (hasBookingId && hasAppointmentId
          ? `Equal to each other: ${String(pick(hold.body, 'bookingId')) === String(pick(hold.body, 'appointmentId'))} (the collection sends 1144015 for both).`
          : '**THE HOLD RETURNS ONE ID AND THE CREATE NEEDS TWO.** No AppointmentId comes back at all. A create sent ' +
            'without one is refused `400 "Randox Booking failure, invalid appointment id."` — Randox name the field, ' +
            'which is how this was found.\n\n' +
            (created === undefined
              ? 'No create followed in this run, so nothing here confirms what to send instead.'
              : created.ok
                ? `**SO THEY ARE THE SAME NUMBER, AND THAT IS NOW OBSERVED RATHER THAN INFERRED.** This run sent ` +
                  `\`AppointmentId: ${String(sentAppointmentId)}\` — the hold's own BookingId — and the create answered ` +
                  `${created.status}. That agrees with the collection's example, which sends 1144015 for both, and with ` +
                  `the hold being the only call before the create that could have produced either.`
                : `The create still failed (${created.status}) after sending \`AppointmentId: ${String(sentAppointmentId)}\`, ` +
                  `so what the second id should be is STILL OPEN. See the capture.`)),
  );

  const expiry = pick(hold?.body, 'expiresAtUtc', 'expiresAt', 'holdExpiry', 'expiryDateTime');
  q(
    5,
    'What is the hold TTL in practice? (documented 30 minutes)',
    hold === undefined
      ? (bookingUnavailable ?? 'UNANSWERED — no hold was placed.')
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
      ? (bookingUnavailable ?? 'UNANSWERED — no slots came back.')
      : `${ctx.slotCount.dates.length} distinct dates across ${ctx.slotCount.total} slots: ${ctx.slotCount.dates.join(', ')}. ` +
        `${consecutive ? 'Consecutive.' : 'NOT consecutive'} — which matches the flow document: "The objective is to present 7 dates of available appointments, which depending on availability, may not be consecutive dates."`,
  );

  const second = captures.find((c) => c.name.startsWith('CreateRandoxBooking-second'));
  q(
    7,
    'Does a second CreateRandoxBooking against one GPExternalNumber succeed or fail?',
    second === undefined
      ? (bookingUnavailable ?? 'UNANSWERED — the second create was not sent.')
      : second.ok
        ? `**IT SUCCEEDS (${second.status}), AND IT IS A SECOND, DISTINCT BOOKING.** The first create returned ` +
          `RandoxBookingOrderId \`${String(pick(created?.body, 'randoxBookingOrderId') ?? '?')}\` and this one returned ` +
          `\`${String(pick(second.body, 'randoxBookingOrderId') ?? '?')}\` — so two live appointments CAN exist against ` +
          `one order number, and nothing on the Randox side prevents it.\n\nThat settles the open question behind ` +
          `bookingService.rescheduleBooking: the composed path MUST cancel the old booking, and a failure at that step ` +
          `MUST be audited — which it is. It also means a retried create is a real duplicate appointment, which is why ` +
          `a create is never retried.`
        : `IT IS REFUSED (${second.status}). The composed reschedule cannot leave two live appointments behind; the "book before cancel" ordering still stands, since a refusal leaves the original intact.`,
  );

  const regions = captures.find((c) => c.name === 'GetServiceRegions');
  q(
    8,
    'Does GetServiceRegions work as the credential probe, and what is a region?',
    regions === undefined
      ? (bookingUnavailable ?? 'UNANSWERED — the probe was not sent.')
      : regions.ok
        ? `YES (${regions.status}). It answers GET with no body, so the booking subscription key and B2C scope are ` +
          `both working. The previous probe, \`BiologicalSex/GetBiologicalSex\`, 404s — it is in the CB auth ` +
          `document's worked example and in no operation list — so it could not tell a good key from a bad one. ` +
          `The body is beside this file; region ids are NOT service ids and nothing published relates the two.`
        : `NO — ${regions.status}. That is the booking key or the booking scope rather than the flow, which is exactly ` +
          `what a probe is for. See the capture for the body.`,
  );

  const reschedule = captures.find((c) => c.name === 'RescheduleAppointment');
  const rescheduleCode = pick(reschedule?.body, 'successFailCode', 'SuccessFailCode');
  q(
    9,
    'What does RescheduleAppointment return, and does a refusal arrive as a 200?',
    reschedule === undefined
      ? (bookingUnavailable ?? (ctx.rescheduleSkipped ? `UNASKED — ${ctx.rescheduleSkipped}.` : 'UNANSWERED — it was not called.'))
      : `HTTP ${reschedule.status}. SuccessFailCode ${rescheduleCode === undefined ? 'ABSENT' : `\`${String(rescheduleCode)}\``}` +
        `, FailureDescription \`${String(pick(reschedule.body, 'failureDescription', 'FailureDescription') ?? 'null')}\`` +
        `, BookingId \`${String(pick(reschedule.body, 'bookingId', 'BookingId') ?? 'null')}\`.\n\n` +
        (rescheduleCode === undefined
          ? 'NO SuccessFailCode in the response, so the spec schema and the live shape disagree — read the capture before ' +
            'changing `bookingOutcomeSucceeded()` in clients/parse.ts, which currently treats an absent code as a failure.'
          : 'The soft-failure shape is real. `bookingOutcomeSucceeded()` treats anything not recognisably affirmative as ' +
            'a failure, which is the safe direction; check the capture for the exact spelling before relying on it.') +
        '\n\nThis does NOT by itself move production onto the endpoint. bookingService.rescheduleBooking still composes ' +
        'hold → create → cancel, because the documented reschedule takes no hold and so cannot check the new slot is ' +
        'free before giving up the old one.',
  );

  q(
    10,
    'What BiologicalSexId does a booking carry, now that Clinic Booking has no endpoint for it?',
    ctx.bookingSex === null
      ? (bookingUnavailable ?? 'UNANSWERED — the booking half did not reach the point of needing one.')
      : `**AN ASSUMPTION, NOT AN ANSWER.** \`${ctx.bookingSex.id}\` for "${ctx.bookingSex.name}", taken from the ` +
        `CreateRandoxBooking operation's own description in clinic-booking-openapi3.json: "Note - Biological Sex Id: ` +
        `Male = 1, Female = 2".\n\n` +
        `\`BiologicalSex/GetBiologicalSex\` — the CB auth document's worked example — answered **404** and is not an ` +
        `operation on this API, so there is nothing to resolve against and nothing that could confirm this.\n\n` +
        `CROSS-CHECK: Nexus's own GetBiologicalSex returns ` +
        `${ctx.bookingSex.nexusId === null ? 'no such name' : `\`${ctx.bookingSex.nexusId}\``} for "${ctx.bookingSex.name}", which ` +
        `${ctx.bookingSex.nexusId === ctx.bookingSex.id ? 'AGREES' : '**DOES NOT AGREE**'}. That is corroboration from an ` +
        `independent source and it is not confirmation — they are two APIs behind two gateways with two subscription keys.\n\n` +
        `WHAT IS STILL OPEN: the spec declares an orphaned \`BiologicalSexResponse\` schema (Id / Name / DisplayOrder) ` +
        `that no path references, which means an endpoint was WITHDRAWN rather than never existing — so the real list is ` +
        `likely longer than two and nothing here can enumerate it. **For Randox: what is the full list of Clinic Booking ` +
        `BiologicalSexIds, and is there an endpoint for them?**`,
  );

  const mutations = [
    ['HoldAvailabilityBooking', captures.find((c) => c.name === 'HoldAvailabilityBooking')],
    ['CreateRandoxBooking', created],
    ['RescheduleAppointment', reschedule],
    ['CancelRandoxBooking', captures.find((c) => c.name === 'CancelRandoxBooking')],
  ] as const;
  const withEnvelope = mutations.filter(([, c]) => pick(c?.body, 'successFailCode') !== undefined);
  q(
    11,
    'Do the booking mutations share one response envelope, and can they refuse inside a 200?',
    withEnvelope.length === 0
      ? (bookingUnavailable ?? 'UNANSWERED — no mutation returned a readable body in this run.')
      : `**YES, AND THE SPEC DECLARES IT ON ONE OPERATION.** ${withEnvelope.length} of ${mutations.length} mutations ` +
        'answered with a `SuccessFailCode`: ' +
        withEnvelope.map(([name, c]) => `${name} \`${String(pick(c?.body, 'successFailCode'))}\``).join(', ') +
        '.\n\nThe OpenAPI file calls this `RescheduleAppointmentResponse` and attaches it to RescheduleAppointment ' +
        'alone, which is how it was read at first. It is the shared envelope for booking mutations — so **a refusal ' +
        'arrives as an HTTP 200 and the transport does not throw**. A create read as a success writes an appointment ' +
        'the patient does not have and then tells them to come in, which is the worst outcome this API can produce. ' +
        '`assertBookingOutcome` in clients/ClinicBookingClient.ts reads it on all four.\n\n' +
        '**AND THE CODE IS NOT ONE TYPE.** Note the values above: a string on three of them and a NUMBER on the create. ' +
        '`pickString` coerces and "0" is in the success set, so both read — do not "tidy" that set to strings only.',
  );

  fs.writeFileSync(path.join(OUT_DIR, 'ANSWERS.md'), `${lines.join('\n')}\n`);
  console.log(`\nWrote ${captures.length} captures and ANSWERS.md to ${OUT_DIR}\n`);
}

main().catch((e: unknown) => {
  console.error(`\nThe sandbox pass stopped: ${e instanceof Error ? e.message : String(e)}`);
  console.error(
    `${captures.length} call(s) were captured before it stopped; they are in ${OUT_DIR}. ANSWERS.md was NOT written — ` +
      'a summary of a run that crashed halfway would read as a complete one.',
  );
  process.exit(1);
});
