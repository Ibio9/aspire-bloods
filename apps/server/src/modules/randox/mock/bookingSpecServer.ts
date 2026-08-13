import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUBSCRIPTION_KEY_HEADER, type RandoxVerb } from '../endpoints.js';
import * as bookingScenarios from './bookingScenarios.js';

/**
 * ---------------------------------------------------------------------------
 * A MOCK CLINIC BOOKING, GENERATED FROM THE POSTMAN COLLECTION.
 * ---------------------------------------------------------------------------
 *
 * Same principle as specServer.ts and the same reason: a hand-written mock
 * agrees with whatever the client believes, and this client's beliefs were
 * wrong in every single request body. Every route, verb and REQUEST SHAPE
 * below is read out of specs/"Clinic Booking Platform Testing APIs.postman_
 * collection.json" at startup. Nothing is transcribed.
 *
 * WHAT IT ENFORCES, so a wrong client is a test failure rather than a silent
 * pass — and the third one is the interesting one:
 *
 *  · THE VERB. All five booking calls are POST, GetBiologicalSex is GET, and a
 *    mismatch answers 405.
 *  · THE SUBSCRIPTION KEY, and now THE BEARER TOO. Missing either → 401. The
 *    Nexus mock deliberately does not require a bearer, because the OpenAPI
 *    document declares no bearer scheme; this one does, because the CB auth
 *    document says in as many words that both are required. The two mocks
 *    differ exactly where the two documents differ.
 *  · THE REQUEST BODY, FIELD BY FIELD, against the collection's own example:
 *      – every field in the example must be present (so `AppointmentSlotTIme`
 *        spelled correctly is a 400, which is the whole point of it);
 *      – no field the example does not have (so an invented `SearchTo` cannot
 *        be quietly ignored);
 *      – the same JSON TYPE as the example (so ServiceId as 787 where their
 *        example says "787" fails, and vice versa on the next endpoint);
 *      – and for strings, the same SHAPE — a day-first date where the example
 *        is day-first, an ISO instant where it is ISO, HH:mm where it is HH:mm.
 *        That last check is what catches the two date formats being swapped
 *        between the hold and the create, which is otherwise two valid-looking
 *        strings in the right field.
 *
 * WHAT IT CANNOT ENFORCE: responses. The collection's `response` array is empty
 * on every item, so what comes back is a fixture and is marked as one — see
 * bookingScenarios.ts. Nothing in this file pretends otherwise.
 *
 * NOTHING REAL GOES NEAR IT. Invented names, invented dates of birth, invented
 * order numbers.
 */

const COLLECTION_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'specs',
  'Clinic Booking Platform Testing APIs.postman_collection.json',
);

interface PostmanItem {
  name: string;
  request: {
    method: string;
    url: { raw: string; path?: string[] };
    body?: { mode: string; raw?: string };
  };
}

export interface BookingRoute {
  name: string;
  /** Relative to the booking-platform-api root, no leading slash. */
  path: string;
  verb: RandoxVerb;
  /** The collection's own request body, or null for a GET. */
  example: Record<string, unknown> | null;
}

let routeCache: BookingRoute[] | null = null;

/** Every booking route in the collection, straight out of the document. */
export function loadBookingRoutes(): BookingRoute[] {
  if (routeCache) return routeCache;
  const collection = JSON.parse(fs.readFileSync(COLLECTION_PATH, 'utf-8')) as { item: PostmanItem[] };

  routeCache = collection.item
    // The token request is a B2C call on a different host, not an API route.
    .filter((item) => !/b2clogin\.com/.test(item.request.url.raw))
    .map((item) => {
      const relative = item.request.url.raw.split('/booking-platform-api/')[1] ?? '';
      const raw = item.request.body?.raw;
      return {
        name: item.name,
        path: relative.replace(/^\/+/, ''),
        verb: item.request.method.toUpperCase() as RandoxVerb,
        example: raw ? (JSON.parse(raw) as Record<string, unknown>) : null,
      };
    })
    .filter((route) => route.path !== '');

  return routeCache;
}

export function bookingRouteFor(pathName: string): BookingRoute | null {
  const key = pathName.replace(/^\/+/, '');
  return loadBookingRoutes().find((r) => r.path.toLowerCase() === key.toLowerCase()) ?? null;
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

/** Every way a body can fail the collection's own example. Empty means it passed. */
export function bodyMismatches(example: Record<string, unknown>, actual: unknown): string[] {
  if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) {
    return ['the request body is not a JSON object'];
  }
  const body = actual as Record<string, unknown>;
  const problems: string[] = [];

  for (const [field, expected] of Object.entries(example)) {
    if (!(field in body)) {
      problems.push(`"${field}" is missing (the collection's example has it)`);
      continue;
    }
    const got = body[field];
    if (typeof got !== typeof expected) {
      problems.push(`"${field}" is a ${typeof got}; this endpoint's example sends a ${typeof expected}`);
      continue;
    }
    if (typeof expected === 'string' && typeof got === 'string') {
      const wanted = shapeOf(expected);
      const found = shapeOf(got);
      if (wanted !== 'text' && found !== wanted) {
        problems.push(`"${field}" is ${found} ("${got}"); this endpoint's example sends ${wanted} ("${expected}")`);
      }
    }
  }

  for (const field of Object.keys(body)) {
    if (!(field in example)) {
      problems.push(`"${field}" is not a field on this endpoint (the collection's example does not have it)`);
    }
  }

  return problems;
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
        const problems = bodyMismatches(route.example, body);
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
