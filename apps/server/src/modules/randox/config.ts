import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { assertWithinDocumentedLimit } from './http/rateLimiter.js';
import type { RandoxBookingRegion } from './types.js';

/**
 * Everything the Randox integration needs that we do not yet have. Access
 * to the sandbox is pending, so subscription keys, the clinic id, the
 * agreed panel/test ids, the void/caveat code list and the contractually
 * permitted collection methods are all unresolved.
 *
 * The rule applied throughout: unknowns are configuration, never code, and
 * a missing required unknown fails at BOOT with a message naming the
 * variable — not on the first API call, halfway through a patient's
 * booking. See assertRandoxConfigured(), called from index.ts.
 *
 * Client ids and sandbox base URLs ARE known (they're in the brief and are
 * not secrets), so they carry defaults — but every one of them is still an
 * env var, so the sandbox→production switch is a config change with no
 * deploy of new code.
 */

// ---------------------------------------------------------------------------
// Code map (void / caveat) — file-backed, hot-reloadable
// ---------------------------------------------------------------------------

const codeEntrySchema = z.object({
  /** VOID hides the result entirely. CAVEAT annotates a reportable one. */
  kind: z.enum(['VOID', 'CAVEAT']),
  /** Admin-facing meaning of the code. Always shown in the admin area. */
  description: z.string().min(1),
  /**
   * Patient-facing wording for a CAVEAT. Deliberately optional and empty
   * by default: a caveat is only ever shown to a patient once we know what
   * it means. Ignored for VOID — a voided marker shows the neutral
   * "could not be reported" note and nothing else, whatever is written here.
   */
  patientSafeNote: z.string().optional(),
});

const codeMapFileSchema = z.object({
  /**
   * Free text describing where the list came from and when — so a future
   * reader can tell a real Randox-supplied list from the empty placeholder.
   */
  source: z.string().optional(),
  codes: z.record(z.string(), codeEntrySchema).default({}),
});

export type RandoxCodeEntry = z.infer<typeof codeEntrySchema>;
export type RandoxCodeMap = Record<string, RandoxCodeEntry>;

// ---------------------------------------------------------------------------
// Panel / test id map — our catalogue keys ↔ Randox's identifiers
// ---------------------------------------------------------------------------

const idMapFileSchema = z.object({
  source: z.string().optional(),
  /** Panel.key in our catalogue → Randox's panel/profile id. */
  panels: z.record(z.string(), z.string()).default({}),
  /** Marker.key in our catalogue → Randox's individual test id. */
  tests: z.record(z.string(), z.string()).default({}),
  /**
   * Randox marker name (as it appears on a result) → our Marker.key.
   * Only needed where fuzzy name matching (reports/matchMarker.ts) gets it
   * wrong; anything absent here still falls through to name matching, and
   * anything that then fails is flagged for an admin, never dropped.
   */
  markerNameOverrides: z.record(z.string(), z.string()).default({}),
});

export interface RandoxIdMap {
  panels: Record<string, string>;
  tests: Record<string, string>;
  markerNameOverrides: Record<string, string>;
  /** Randox panel id → our Panel.key. Derived, for the inbound direction. */
  panelsByRandoxId: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export class RandoxConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RandoxConfigError';
  }
}

function readJsonFile(filePath: string, label: string): unknown {
  const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    throw new RandoxConfigError(
      `Randox ${label} file not found at "${resolved}". Copy the .example.json alongside it and fill it in, or point the env var at the real file.`,
    );
  }
  try {
    return JSON.parse(fs.readFileSync(resolved, 'utf-8'));
  } catch (e) {
    throw new RandoxConfigError(
      `Randox ${label} file at "${resolved}" is not valid JSON: ${e instanceof Error ? e.message : 'parse error'}`,
    );
  }
}

let codeMapCache: { map: RandoxCodeMap; source: string | null } | null = null;
let idMapCache: RandoxIdMap | null = null;

export function loadCodeMap(): { map: RandoxCodeMap; source: string | null } {
  if (codeMapCache) return codeMapCache;
  const raw = readJsonFile(env.RANDOX_CODE_MAP_FILE, 'void/caveat code map');
  const parsed = codeMapFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new RandoxConfigError(
      `Randox code map at "${env.RANDOX_CODE_MAP_FILE}" is malformed: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
    );
  }
  // Codes are compared case-insensitively — a lab feed that starts sending
  // "hb01" where the map says "HB01" must not silently reclassify every
  // caveat as an unknown (and therefore as void).
  const map: RandoxCodeMap = {};
  for (const [code, entry] of Object.entries(parsed.data.codes)) {
    map[code.trim().toUpperCase()] = entry;
  }
  codeMapCache = { map, source: parsed.data.source ?? null };
  return codeMapCache;
}

export function loadIdMap(): RandoxIdMap {
  if (idMapCache) return idMapCache;
  const raw = readJsonFile(env.RANDOX_ID_MAP_FILE, 'panel/test id map');
  const parsed = idMapFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new RandoxConfigError(
      `Randox id map at "${env.RANDOX_ID_MAP_FILE}" is malformed: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
    );
  }
  const panelsByRandoxId: Record<string, string> = {};
  for (const [ourKey, randoxId] of Object.entries(parsed.data.panels)) {
    panelsByRandoxId[randoxId] = ourKey;
  }
  const markerNameOverrides: Record<string, string> = {};
  for (const [randoxName, ourKey] of Object.entries(parsed.data.markerNameOverrides)) {
    markerNameOverrides[randoxName.trim().toLowerCase()] = ourKey;
  }
  idMapCache = {
    panels: parsed.data.panels,
    tests: parsed.data.tests,
    markerNameOverrides,
    panelsByRandoxId,
  };
  return idMapCache;
}

/** Tests only — lets a suite load a fixture map without touching disk. */
export function __setConfigCachesForTest(
  codeMap: RandoxCodeMap | null,
  idMap: RandoxIdMap | null,
): void {
  codeMapCache = codeMap ? { map: codeMap, source: 'test' } : null;
  idMapCache = idMap;
}

// ---------------------------------------------------------------------------
// Per-API connection config
// ---------------------------------------------------------------------------

export interface RandoxApiConnection {
  /** Human name used in errors and logs. */
  label: string;
  baseUrl: string;
  clientId: string;
  scope: string;
  subscriptionKey: string;
  tokenUrl: string;
  username: string;
  password: string;
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function nexusConnection(): RandoxApiConnection {
  return {
    label: 'Nexus Lab',
    baseUrl: trimTrailingSlash(env.RANDOX_NEXUS_BASE_URL),
    clientId: env.RANDOX_NEXUS_CLIENT_ID,
    scope: env.RANDOX_NEXUS_SCOPE,
    subscriptionKey: env.RANDOX_NEXUS_SUBSCRIPTION_KEY,
    tokenUrl: env.RANDOX_NEXUS_TOKEN_URL || env.RANDOX_B2C_TOKEN_URL,
    username: env.RANDOX_NEXUS_USERNAME || env.RANDOX_USERNAME,
    password: env.RANDOX_NEXUS_PASSWORD || env.RANDOX_PASSWORD,
  };
}

export function bookingConnection(): RandoxApiConnection {
  return {
    label: 'Clinic Booking',
    baseUrl: trimTrailingSlash(env.RANDOX_BOOKING_BASE_URL),
    clientId: env.RANDOX_BOOKING_CLIENT_ID,
    scope: env.RANDOX_BOOKING_SCOPE,
    subscriptionKey: env.RANDOX_BOOKING_SUBSCRIPTION_KEY,
    tokenUrl: env.RANDOX_BOOKING_TOKEN_URL || env.RANDOX_B2C_TOKEN_URL,
    username: env.RANDOX_BOOKING_USERNAME || env.RANDOX_USERNAME,
    password: env.RANDOX_BOOKING_PASSWORD || env.RANDOX_PASSWORD,
  };
}

export type CollectionMethod = 'IN_CLINIC' | 'HOME_KIT' | 'MOBILE_PHLEBOTOMY';

const ALL_COLLECTION_METHODS: CollectionMethod[] = ['IN_CLINIC', 'HOME_KIT', 'MOBILE_PHLEBOTOMY'];

/**
 * Which collection routes we're allowed to offer. Empty by default and
 * empty is legal at boot — but ordering with a method that isn't on this
 * list is refused at the service layer. We don't yet have confirmation of
 * what we're contractually entitled to, and creating an order Randox will
 * not fulfil is worse than refusing to create one.
 */
export function enabledCollectionMethods(): CollectionMethod[] {
  const raw = env.RANDOX_COLLECTION_METHODS.split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const invalid = raw.filter((m) => !ALL_COLLECTION_METHODS.includes(m as CollectionMethod));
  if (invalid.length > 0) {
    throw new RandoxConfigError(
      `RANDOX_COLLECTION_METHODS contains unrecognised value(s): ${invalid.join(', ')}. Allowed: ${ALL_COLLECTION_METHODS.join(', ')}.`,
    );
  }
  return raw as CollectionMethod[];
}

export function isCollectionMethodEnabled(method: string): method is CollectionMethod {
  return enabledCollectionMethods().includes(method as CollectionMethod);
}

/**
 * ---------------------------------------------------------------------------
 * THE CLINIC ID IS FETCHED, NOT CONFIGURED (Aug 2026).
 * ---------------------------------------------------------------------------
 *
 * Three endpoints require it — GetOrderStatus, GetOrderResultReports and
 * GetOrderResultDetail — and every one of them is documented the same way, in
 * the same four words: "Clinic Id must be your current Clinic Id
 * (/Clinic/GetMyClinicDetails)". The API Overview flow diagram says it three
 * times, once per endpoint.
 *
 * It was an environment variable, and the diagram is the argument against that.
 * `/Clinic/GetMyClinicDetails` is not a hint about where a human might look the
 * number up; it is the authority for what the number IS, on the credentials
 * this deployment is actually holding. A typed-in id is a second source for a
 * fact with one source, and the two can disagree in a way nothing detects: a
 * wrong clinic id on GetOrderResultDetail is a request for somebody else's
 * order, and the failure is a 4xx at best and a silence at worst.
 *
 * So it is LEARNED — the reference-data sync records it, and it survives a
 * restart because it is read back out of the catalogue rather than held only in
 * memory (the boot sync is skipped inside its TTL, so a process that learned
 * nothing this boot must still know it). `RANDOX_CLINIC_ID` survives as an
 * OVERRIDE and nothing else: it exists so a support session can pin the value
 * without a redeploy, and it is not part of the ordinary configuration.
 *
 * Returns null when neither is known, so callers refuse rather than sending 0 —
 * clinic 0 is not our clinic.
 */
let discoveredClinicId: number | null = null;

/** Recorded from GetMyClinicDetails (live) or read back from the catalogue (restart). */
export function setDiscoveredClinicId(id: number | null): void {
  discoveredClinicId = Number.isInteger(id) ? id : null;
}

export function randoxClinicId(): number | null {
  const raw = env.RANDOX_CLINIC_ID.trim();
  if (raw !== '') {
    const parsed = Number(raw);
    if (Number.isInteger(parsed)) return parsed;
  }
  return discoveredClinicId;
}

/** Which of the two answered, for the admin summary and for boot logging. */
export function randoxClinicIdSource(): 'override' | 'GetMyClinicDetails' | 'unknown' {
  if (env.RANDOX_CLINIC_ID.trim() !== '' && Number.isInteger(Number(env.RANDOX_CLINIC_ID.trim()))) return 'override';
  return discoveredClinicId === null ? 'unknown' : 'GetMyClinicDetails';
}

/**
 * TestClinicLocationId for CreatePendingOrder. A clinic with one site has
 * the same value as the clinic id; a clinic with several has a distinct id
 * per test location (see GetMyClinicDetails clinicTestLocations), so it is
 * separately configurable and falls back to the clinic id.
 *
 * THIS ONE STAYS A SETTING, and the asymmetry with the clinic id above is the
 * point: GetMyClinicDetails answers "which clinic are you" with exactly one
 * value, and answers "which of your sites should this order be drawn at" with a
 * LIST. A list is a question, not an answer, and choosing from it is a decision
 * about this deployment. Left unset it takes the clinic id, which is correct
 * for a single-site clinic and is the only case where the list has one entry.
 */
export function randoxTestClinicLocationId(): number | null {
  const raw = env.RANDOX_TEST_CLINIC_LOCATION_ID.trim();
  if (raw === '') return randoxClinicId();
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : null;
}

/**
 * The Clinic Booking ServiceId for third-party in-clinic bookings.
 *
 * TWO VALUES EXIST AND THERE IS NO THIRD: 787 (UK) and 788 (Republic of
 * Ireland). Not in any document — from Chris Caulfield's email, Aug 2026.
 *
 * Read from the configured region rather than passed per call. Which country a
 * booking is made in is a fact about the deployment, and an argument that
 * could be either is an argument that will eventually be the wrong one: a UK
 * patient sent to service 788 gets Irish clinics offered, with nothing in the
 * response to say the wrong service was asked for.
 */
export function bookingServiceId(region: RandoxBookingRegion = env.RANDOX_BOOKING_REGION): number {
  return region === 'ROI' ? env.RANDOX_BOOKING_SERVICE_ID_ROI : env.RANDOX_BOOKING_SERVICE_ID_UK;
}

export function bookingRegion(): RandoxBookingRegion {
  return env.RANDOX_BOOKING_REGION;
}

/** The testing reason sent on every order. Required non-empty by the spec. */
export function defaultTestReason(): { Id: number; Details: string } | null {
  const raw = env.RANDOX_DEFAULT_TEST_REASON_ID.trim();
  if (raw === '') return null;
  const id = Number(raw);
  if (!Number.isInteger(id)) return null;
  return { Id: id, Details: env.RANDOX_DEFAULT_TEST_REASON_DETAILS };
}

/** CancelOrder takes a reason id from GetCancellationReasons, not free text. */
export function defaultCancellationReasonId(): string | null {
  const raw = env.RANDOX_DEFAULT_CANCELLATION_REASON_ID.trim();
  return raw === '' ? null : raw;
}

/** 'mock' runs the whole flow against fixtures; 'live' hits Randox. */
export function randoxTransport(): 'mock' | 'live' {
  return env.RANDOX_TRANSPORT;
}

export function isRandoxEnabled(): boolean {
  return env.RANDOX_ENABLED;
}

// ---------------------------------------------------------------------------
// Boot-time validation
// ---------------------------------------------------------------------------

interface RequiredVar {
  name: string;
  value: string;
  why: string;
}

/**
 * Fails the boot, loudly and completely, if RANDOX_ENABLED=true without
 * everything a real call needs. Reports EVERY missing variable at once —
 * discovering six missing credentials one redeploy at a time is its own
 * kind of outage.
 *
 * Skipped entirely under RANDOX_TRANSPORT=mock: the mock needs no
 * credentials, which is what makes the whole flow testable before the
 * subscription keys arrive.
 */
export function assertRandoxConfigured(): void {
  if (!isRandoxEnabled()) return;

  // Always valid, mock or live — these are our own decisions, not Randox's.
  enabledCollectionMethods();
  loadCodeMap();
  loadIdMap();
  // Randox's documented ceiling is 600/min per API. Checked in mock as well as
  // live: a pace set above the ceiling is a mistake wherever it is set, and
  // finding it out on the deploy that flips to live is the worst moment for it.
  assertWithinDocumentedLimit(env.RANDOX_MAX_REQUESTS_PER_MINUTE);

  if (randoxTransport() === 'mock') {
    if (env.NODE_ENV === 'production') {
      throw new RandoxConfigError(
        'Refusing to boot in production: RANDOX_ENABLED=true with RANDOX_TRANSPORT=mock. The mock returns fixture results — they would be ingested as if they were real patient results. Set RANDOX_TRANSPORT=live, or RANDOX_ENABLED=false.',
      );
    }
    return;
  }

  const nexus = nexusConnection();
  const booking = bookingConnection();

  // RANDOX_CLINIC_ID IS NOT IN THIS LIST ANY MORE (Aug 2026). It is fetched
  // from GET /Clinic/GetMyClinicDetails on the boot sync and read back out of
  // the catalogue on a restart — see randoxClinicId(). Requiring it here would
  // have made a deployment refuse to start over a value it is about to be told,
  // by the only party entitled to state it. What guards the real failure — the
  // sync never having succeeded, so nothing knows the id — is
  // assertReferenceDataUsable(), on the order path, where an unknown clinic id
  // is a refusal to place an order rather than a refusal to run the portal.
  const required: RequiredVar[] = [
    { name: 'RANDOX_DEFAULT_TEST_REASON_ID', value: env.RANDOX_DEFAULT_TEST_REASON_ID, why: 'CreatePendingOrder requires a non-empty TestReasons array; ids come from GET /TestReason/GetTestingReasons' },
    { name: 'RANDOX_DEFAULT_CANCELLATION_REASON_ID', value: env.RANDOX_DEFAULT_CANCELLATION_REASON_ID, why: 'CancelOrder takes a CancellationReasonId, not free text; ids come from GET /CancellationReason/GetCancellationReasons' },
    { name: 'RANDOX_NEXUS_BASE_URL', value: nexus.baseUrl, why: 'Nexus Lab API root' },
    { name: 'RANDOX_NEXUS_CLIENT_ID', value: nexus.clientId, why: 'Azure B2C client id for Nexus Lab' },
    { name: 'RANDOX_NEXUS_SCOPE', value: nexus.scope, why: 'ROPC token request needs the Nexus scope' },
    { name: 'RANDOX_NEXUS_SUBSCRIPTION_KEY', value: nexus.subscriptionKey, why: 'Ocp-Apim-Subscription-Key on every Nexus request' },
    { name: 'RANDOX_NEXUS_TOKEN_URL (or RANDOX_B2C_TOKEN_URL)', value: nexus.tokenUrl, why: 'B2C ROPC token endpoint' },
    { name: 'RANDOX_NEXUS_USERNAME (or RANDOX_USERNAME)', value: nexus.username, why: 'ROPC is a password grant — it needs a service account' },
    { name: 'RANDOX_NEXUS_PASSWORD (or RANDOX_PASSWORD)', value: nexus.password, why: 'ROPC is a password grant — it needs a service account' },
    { name: 'RANDOX_BOOKING_BASE_URL', value: booking.baseUrl, why: 'Clinic Booking API root' },
    { name: 'RANDOX_BOOKING_CLIENT_ID', value: booking.clientId, why: 'Azure B2C client id for Clinic Booking' },
    { name: 'RANDOX_BOOKING_SCOPE', value: booking.scope, why: 'ROPC token request needs the Booking scope' },
    { name: 'RANDOX_BOOKING_SUBSCRIPTION_KEY', value: booking.subscriptionKey, why: 'Ocp-Apim-Subscription-Key on every Booking request' },
    { name: 'RANDOX_BOOKING_TOKEN_URL (or RANDOX_B2C_TOKEN_URL)', value: booking.tokenUrl, why: 'B2C ROPC token endpoint' },
    { name: 'RANDOX_BOOKING_USERNAME (or RANDOX_USERNAME)', value: booking.username, why: 'ROPC is a password grant — it needs a service account' },
    { name: 'RANDOX_BOOKING_PASSWORD (or RANDOX_PASSWORD)', value: booking.password, why: 'ROPC is a password grant — it needs a service account' },
  ];

  if (env.RANDOX_CLINIC_ID.trim() !== '' && randoxClinicId() === null) {
    throw new RandoxConfigError(
      `Refusing to boot: RANDOX_CLINIC_ID is "${env.RANDOX_CLINIC_ID}", which is not an integer. Randox issue clinic ids as integers (GetMyClinicDetails returns e.g. 146).`,
    );
  }

  const missing = required.filter((v) => !v.value || v.value.trim() === '');
  if (missing.length > 0) {
    throw new RandoxConfigError(
      `Refusing to boot: RANDOX_ENABLED=true and RANDOX_TRANSPORT=live, but ${missing.length} required setting(s) are missing:\n` +
        missing.map((v) => `  - ${v.name} — ${v.why}`).join('\n') +
        '\nSee .env.example. Set RANDOX_ENABLED=false to run without the Randox integration, or RANDOX_TRANSPORT=mock to run it against fixtures.',
    );
  }

  // A live integration with no panel or test ids can never place an order.
  // Catch it now rather than at the first booking attempt.
  const idMap = loadIdMap();
  if (Object.keys(idMap.panels).length === 0 && Object.keys(idMap.tests).length === 0) {
    throw new RandoxConfigError(
      `Refusing to boot: RANDOX_TRANSPORT=live but the id map at "${env.RANDOX_ID_MAP_FILE}" defines no panels and no tests. CreatePendingOrder requires at least one panel or test id, so no order could ever be placed. Fill in the agreed Randox panel/test ids.`,
    );
  }

  if (enabledCollectionMethods().length === 0) {
    throw new RandoxConfigError(
      'Refusing to boot: RANDOX_TRANSPORT=live but RANDOX_COLLECTION_METHODS is empty, so no order could be placed by any route. Set it to the methods Randox have contractually agreed we may offer.',
    );
  }

  // The checked-in .example files are placeholders with invented codes and
  // no real ids. Running live against them would silently classify every
  // genuine Randox code as unrecognised — and therefore void — which
  // presents as "no results ever arrive" rather than as a config error.
  // Same principle as the placeholder-secret check in productionBootChecks.
  for (const [name, value] of [
    ['RANDOX_CODE_MAP_FILE', env.RANDOX_CODE_MAP_FILE],
    ['RANDOX_ID_MAP_FILE', env.RANDOX_ID_MAP_FILE],
  ] as const) {
    if (value.includes('.example.json')) {
      throw new RandoxConfigError(
        `Refusing to boot: RANDOX_TRANSPORT=live but ${name} still points at the checked-in placeholder ("${value}"). Its contents are invented. Copy it, fill it in with the real Randox values, and point ${name} at the copy.`,
      );
    }
  }
}

/** Admin-facing snapshot of what is and isn't configured. No secrets. */
export function randoxConfigSummary() {
  const codeMap = loadCodeMap();
  const idMap = loadIdMap();
  const nexus = nexusConnection();
  const booking = bookingConnection();
  const voidCount = Object.values(codeMap.map).filter((e) => e.kind === 'VOID').length;
  const caveatCount = Object.values(codeMap.map).filter((e) => e.kind === 'CAVEAT').length;

  return {
    enabled: isRandoxEnabled(),
    transport: randoxTransport(),
    clinicId: randoxClinicId(),
    clinicIdSource: randoxClinicIdSource(),
    testClinicLocationId: randoxTestClinicLocationId(),
    clinicIdConfigured: randoxClinicId() !== null,
    testReasonConfigured: defaultTestReason() !== null,
    cancellationReasonConfigured: defaultCancellationReasonId() !== null,
    healthCheckPanelReport: env.RANDOX_HEALTH_CHECK_PANEL_REPORT,
    cvScoreRequired: env.RANDOX_CV_SCORE_REQUIRED,
    collectionMethods: enabledCollectionMethods(),
    nexus: {
      baseUrl: nexus.baseUrl,
      subscriptionKeyConfigured: nexus.subscriptionKey.trim() !== '',
      credentialsConfigured: nexus.username.trim() !== '' && nexus.password.trim() !== '',
    },
    booking: {
      baseUrl: booking.baseUrl,
      subscriptionKeyConfigured: booking.subscriptionKey.trim() !== '',
      credentialsConfigured: booking.username.trim() !== '' && booking.password.trim() !== '',
    },
    codeMap: { source: codeMap.source, voidCount, caveatCount, total: Object.keys(codeMap.map).length },
    idMap: {
      panelCount: Object.keys(idMap.panels).length,
      testCount: Object.keys(idMap.tests).length,
      markerNameOverrideCount: Object.keys(idMap.markerNameOverrides).length,
    },
  };
}
