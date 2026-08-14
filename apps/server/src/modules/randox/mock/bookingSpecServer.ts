import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUBSCRIPTION_KEY_HEADER, type RandoxVerb } from '../endpoints.js';
import * as bookingScenarios from './bookingScenarios.js';

/**
 * ---------------------------------------------------------------------------
 * A MOCK CLINIC BOOKING, GENERATED FROM BOTH RANDOX DOCUMENTS AT ONCE.
 * ---------------------------------------------------------------------------
 *
 * Same principle as specServer.ts and the same reason: a hand-written mock
 * agrees with whatever the client believes, and this client's beliefs were
 * wrong in every single request body. Every route, verb and REQUEST SHAPE below
 * is read out of a Randox document at startup. Nothing is transcribed.
 *
 * ── WHY TWO DOCUMENTS AND NOT THE NEWER ONE ───────────────────────────────
 *
 *   specs/clinic-booking-openapi3.json          the SURFACE — all seven
 *                                               operations and their verbs.
 *   specs/"…Testing APIs.postman_collection"    the BODIES of the five it
 *                                               covers.
 *
 * The definition arrived second and is authoritative about what EXISTS: it is
 * the only document naming GetServiceRegions, the only one giving
 * RescheduleAppointment a body, and the one that proved GetBiologicalSex is
 * gone. Its request EXAMPLES are older than the collection's and demonstrably
 * stale — a ServiceId of 488 where only 787 and 788 exist, a date in the time
 * field, no GPExternalNumber on the create — so they do not displace the
 * collection's. See ../endpoints.ts.
 *
 * ── ENFORCE WHERE THEY AGREE, ACCEPT WHERE THEY DIFFER ────────────────────
 *
 * This is the whole design of the body checker, and it is what a mock built on
 * two disagreeing documents has to do. Enforcing one side of a genuine
 * disagreement is enforcing a coin toss: it would turn a request Randox may
 * well accept into a red test, and it would do it with the authority of a
 * document. So per field:
 *
 *   PRESENCE  required if the governing example has it (collection where it
 *             covers the endpoint, otherwise the spec). Unknown fields are
 *             rejected against the UNION, so an invented `SearchTo` is still a
 *             400 and nothing a real Randox document mentions ever is.
 *   CASE      IGNORED. The two documents differ in case on every field of every
 *             shared endpoint — `AppointmentSlotTIme` against
 *             `appointmentSlotTime` is one character's case and nothing else —
 *             which is what ASP.NET Core's default case-insensitive binding
 *             looks like from outside. A mock that 400s on a case variant is
 *             asserting a fact neither document supports.
 *   TYPE      enforced where both agree, and they agree everywhere except the
 *             hold's ServiceId (number in the collection, `"488"` in the spec).
 *   SHAPE     of a string, likewise: day-first stays day-first and an ISO
 *             instant stays an ISO instant where both examples say so. That is
 *             what catches the hold's and the create's date formats being
 *             swapped, which is otherwise two valid-looking strings in the
 *             right field.
 *
 * ── WHAT IT ENFORCES BESIDES THE BODY ─────────────────────────────────────
 *
 *  · THE VERB. Six POSTs, one GET, and a mismatch answers 405.
 *  · THE SUBSCRIPTION KEY, and THE BEARER TOO. Missing either → 401. The Nexus
 *    mock deliberately does not require a bearer, because that OpenAPI document
 *    declares no bearer scheme; this one does, because the CB auth document
 *    says in as many words that both are required. The two mocks differ exactly
 *    where the two documents differ.
 *  · A ROUTE THAT IS IN NEITHER DOCUMENT IS A 404 — which is what the real
 *    sandbox answered to `BiologicalSex/GetBiologicalSex`.
 *
 * WHAT IT CANNOT ENFORCE: responses, for six of the seven. The collection's
 * `response` array is empty on every item and the spec's responses are
 * `{statusCode, message}` envelopes rather than payloads, so what comes back
 * here is a fixture and is marked as one — see bookingScenarios.ts.
 * RescheduleAppointment is the exception and the fixture follows its schema.
 *
 * NOTHING REAL GOES NEAR IT. Invented names, invented dates of birth, invented
 * order numbers.
 */

const SPECS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'specs');
const COLLECTION_PATH = path.join(SPECS_DIR, 'Clinic Booking Platform Testing APIs.postman_collection.json');
const OPENAPI_PATH = path.join(SPECS_DIR, 'clinic-booking-openapi3.json');

interface PostmanItem {
  name: string;
  request: {
    method: string;
    url: { raw: string; path?: string[] };
    body?: { mode: string; raw?: string };
  };
}

interface OpenApiOperation {
  summary?: string;
  operationId?: string;
  requestBody?: { content: Record<string, { example?: unknown }> };
}

export interface BookingRoute {
  name: string;
  /** Relative to the booking-platform-api root, no leading slash. */
  path: string;
  verb: RandoxVerb;
  /**
   * The body this route is CHECKED against: the collection's where it has one,
   * otherwise the spec's. Null for a GET.
   */
  example: Record<string, unknown> | null;
  /** The OpenAPI definition's own example, where it has one. */
  specExample: Record<string, unknown> | null;
  /** The Postman collection's, where it covers this route. */
  collectionExample: Record<string, unknown> | null;
}

let routeCache: BookingRoute[] | null = null;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Path, verb and example for every operation the collection carries. */
function collectionRoutes(): Map<string, { name: string; verb: RandoxVerb; example: Record<string, unknown> | null }> {
  const collection = JSON.parse(fs.readFileSync(COLLECTION_PATH, 'utf-8')) as { item: PostmanItem[] };
  const routes = new Map<string, { name: string; verb: RandoxVerb; example: Record<string, unknown> | null }>();

  for (const item of collection.item) {
    // The token request is a B2C call on a different host, not an API route.
    if (/b2clogin\.com/.test(item.request.url.raw)) continue;
    const relative = (item.request.url.raw.split('/booking-platform-api/')[1] ?? '').replace(/^\/+/, '');
    if (relative === '') continue;
    const raw = item.request.body?.raw;
    routes.set(relative.toLowerCase(), {
      name: item.name,
      verb: item.request.method.toUpperCase() as RandoxVerb,
      example: raw ? asRecord(JSON.parse(raw)) : null,
    });
  }
  return routes;
}

/**
 * Every route in the OpenAPI definition — which is the authoritative list.
 *
 * The request body's media type is read positionally rather than by name: the
 * portal exports RescheduleAppointment's body under `ISO/IEC
 * 19757-2:2003/FDAM-1` rather than `application/json`, which is an export
 * artefact and not a content negotiation anybody has to honour. Looking for
 * "application/json" would silently drop the one operation whose body is
 * documented best.
 */
export function loadBookingRoutes(): BookingRoute[] {
  if (routeCache) return routeCache;

  const spec = JSON.parse(fs.readFileSync(OPENAPI_PATH, 'utf-8')) as {
    paths: Record<string, Record<string, OpenApiOperation>>;
  };
  const fromCollection = collectionRoutes();

  routeCache = Object.entries(spec.paths).flatMap(([rawPath, operations]) =>
    Object.entries(operations).map(([verb, operation]) => {
      const relative = (rawPath.split('/booking-platform-api/')[1] ?? rawPath).replace(/^\/+/, '');
      const content = operation.requestBody?.content ?? {};
      const specExample = asRecord(Object.values(content)[0]?.example);
      const collectionEntry = fromCollection.get(relative.toLowerCase());
      const collectionExample = collectionEntry?.example ?? null;
      return {
        name: operation.summary ?? operation.operationId ?? relative,
        path: relative,
        verb: verb.toUpperCase() as RandoxVerb,
        // The collection governs where it covers the route; the spec elsewhere.
        example: collectionExample ?? specExample,
        specExample,
        collectionExample,
      };
    }),
  );

  return routeCache;
}

export function bookingRouteFor(pathName: string): BookingRoute | null {
  const key = pathName.replace(/^\/+/, '').toLowerCase();
  return loadBookingRoutes().find((r) => r.path.toLowerCase() === key) ?? null;
}

/**
 * The shape of a string value, coarsely, so a request can be checked against
 * the example's FORM rather than only its type.
 *
 * Exists because the two date formats in this API are both strings in the same
 * field name, so `typeof` cannot tell them apart and a swap would sail through
 * every check that only compares types.
 */
export type ValueShape = 'day-first-date' | 'iso-instant' | 'date-time-no-zone' | 'time-of-day' | 'text';

export function shapeOf(value: string): ValueShape {
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return 'day-first-date';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value)) return 'iso-instant';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) return 'date-time-no-zone';
  if (/^\d{2}:\d{2}$/.test(value)) return 'time-of-day';
  return 'text';
}

/** A field of the body, found without regard to case. */
function findField(body: Record<string, unknown>, field: string): { key: string; value: unknown } | null {
  const wanted = field.toLowerCase();
  for (const [key, value] of Object.entries(body)) {
    if (key.toLowerCase() === wanted) return { key, value };
  }
  return null;
}

function hasField(record: Record<string, unknown>, field: string): boolean {
  const wanted = field.toLowerCase();
  return Object.keys(record).some((key) => key.toLowerCase() === wanted);
}

/**
 * Every way a body can fail the documents. Empty means it passed.
 *
 * `alternative` is the OTHER document's example for the same endpoint, where
 * there is one. It is not a second thing to satisfy — it is what makes a
 * DISAGREEMENT between the two visible, so a field the two documents type
 * differently is not enforced against whichever happened to be passed first.
 * See the note at the top of this file.
 */
export function bodyMismatches(
  example: Record<string, unknown>,
  actual: unknown,
  alternative: Record<string, unknown> | null = null,
): string[] {
  if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) {
    return ['the request body is not a JSON object'];
  }
  const body = actual as Record<string, unknown>;
  const problems: string[] = [];

  for (const [field, expected] of Object.entries(example)) {
    const found = findField(body, field);
    if (found === null) {
      problems.push(`"${field}" is missing (this endpoint's example has it)`);
      continue;
    }
    // What the other document says about the same field, if it mentions it.
    const other = alternative === null ? null : findField(alternative, field);
    const got = found.value;

    if (typeof got !== typeof expected) {
      // Accepted only where the two documents genuinely disagree about the
      // type — the hold's ServiceId, and nothing else at the time of writing.
      if (other !== null && typeof got === typeof other.value) continue;
      problems.push(`"${field}" is a ${typeof got}; this endpoint's example sends a ${typeof expected}`);
      continue;
    }

    if (typeof expected === 'string' && typeof got === 'string') {
      const wanted = shapeOf(expected);
      const shape = shapeOf(got);
      if (wanted === 'text' || shape === wanted) continue;
      if (other !== null && typeof other.value === 'string' && shapeOf(other.value) === shape) continue;
      problems.push(`"${field}" is ${shape} ("${got}"); this endpoint's example sends ${wanted} ("${expected}")`);
    }
  }

  // Unknown fields go against the UNION of both documents, so a field only one
  // of them names is accepted — GPExternalNumber is the case that matters, and
  // it is in the collection's create and not in the spec's.
  for (const field of Object.keys(body)) {
    if (hasField(example, field)) continue;
    if (alternative !== null && hasField(alternative, field)) continue;
    problems.push(`"${field}" is not a field on this endpoint (no Randox document for it has one)`);
  }

  return problems;
}

/** The two documents' examples for a route, in the order bodyMismatches wants. */
export function checkAgainstBothDocuments(route: BookingRoute, body: unknown): string[] {
  if (route.example === null) return [];
  const alternative = route.example === route.collectionExample ? route.specExample : route.collectionExample;
  return bodyMismatches(route.example, body, alternative);
}

export type BookingOverride = (request: { path: string; body: unknown }) =>
  | { status: number; payload: unknown }
  | undefined;

export interface MockBookingServer {
  url: string;
  requests: { method: string; path: string; body: unknown; hadSubscriptionKey: boolean; hadBearer: boolean }[];
  setOverride(pathName: string, override: BookingOverride | null): void;
  close(): Promise<void>;
}

/**
 * Starts the mock and returns its base URL in the form
 * RANDOX_BOOKING_BASE_URL takes.
 *
 * `port` exists for the same reason as on the Nexus mock: config/env.ts parses
 * process.env once at import time, so the address has to be agreed in advance.
 */
export async function startMockBookingServer(
  options: { requireSubscriptionKey?: boolean; requireBearer?: boolean; port?: number } = {},
): Promise<MockBookingServer> {
  const requireKey = options.requireSubscriptionKey !== false;
  const requireBearer = options.requireBearer !== false;
  const overrides = new Map<string, BookingOverride>();
  const requests: MockBookingServer['requests'] = [];
  const state = new bookingScenarios.BookingState();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathName = url.pathname.replace(/^\/booking-platform-api\/?/, '').replace(/^\/+/, '');

    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      let body: unknown = undefined;
      if (raw.trim()) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = raw;
        }
      }

      const send = (status: number, payload: unknown) => {
        const text = JSON.stringify(payload);
        res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
        res.end(text);
      };

      // The B2C stand-in. Same five-field ROPC form the auth document shows.
      if (pathName === 'token' || url.pathname === '/token') {
        return send(200, { access_token: 'fixture-booking-token', token_type: 'Bearer', expires_in: 3600 });
      }

      const hadSubscriptionKey = Boolean(req.headers[SUBSCRIPTION_KEY_HEADER.toLowerCase()]);
      const hadBearer = typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ');
      requests.push({ method: req.method ?? 'GET', path: pathName, body, hadSubscriptionKey, hadBearer });

      // BOTH CREDENTIALS. The CB auth document requires the pair, so this mock
      // requires the pair — unlike the Nexus one, whose spec declares no bearer.
      if ((requireKey && !hadSubscriptionKey) || (requireBearer && !hadBearer)) {
        return send(401, {
          status: '401',
          message:
            'Unauthorized: You are not authorized to make this call, contact Randox support if you think this is incorrect.',
        });
      }

      const route = bookingRouteFor(pathName);
      if (!route) {
        return send(404, { statusCode: '404', message: `No such endpoint: ${pathName}` });
      }
      if ((req.method ?? 'GET').toUpperCase() !== route.verb) {
        return send(405, {
          statusCode: '405',
          message: `Method ${req.method} is not allowed on ${pathName}. The collection declares this endpoint ${route.verb}.`,
        });
      }

      if (route.example) {
        if (body === undefined) {
          return send(400, { statusCode: '400', message: 'Bad Request: The submitted request is not a valid JSON.' });
        }
        const problems = checkAgainstBothDocuments(route, body);
        if (problems.length > 0) {
          return send(400, {
            statusCode: '400',
            message: `Bad Request: ${problems.join('; ')}.`,
          });
        }
      }

      const override = overrides.get(route.path.toLowerCase());
      if (override) {
        const result = override({ path: route.path, body });
        if (result !== undefined) return send(result.status, result.payload);
      }

      const answer = state.respond(route.path, body);
      return send(answer.status, answer.payload);
    });
  });

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    url: `http://127.0.0.1:${port}/booking-platform-api`,
    requests,
    setOverride(pathName, override) {
      const key = pathName.replace(/^\/+/, '').toLowerCase();
      if (override) overrides.set(key, override);
      else overrides.delete(key);
    },
    close: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}
