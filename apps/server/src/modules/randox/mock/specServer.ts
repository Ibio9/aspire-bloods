import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NEXUS_ENDPOINTS, SUBSCRIPTION_KEY_HEADER, type RandoxVerb } from '../endpoints.js';

/**
 * ---------------------------------------------------------------------------
 * A MOCK NEXUS, GENERATED FROM THE SPEC RATHER THAN WRITTEN BY HAND.
 * ---------------------------------------------------------------------------
 *
 * Every route, every verb and every 200 body below is READ OUT OF
 * specs/nexus-openapi3.json at startup. Nothing here is transcribed, which is
 * the whole point: a hand-written mock encodes what we BELIEVE the API does,
 * and what we believed is precisely what turned out to be wrong (eight GETs
 * called as POSTs, prices assumed absent, one order identifier assumed to be
 * two names for the same string). A mock built from the document cannot
 * inherit our beliefs, only Randox's mistakes — which is the correct set to
 * inherit, because those are the ones production will have.
 *
 * WHAT IT ENFORCES, so a wrong client is a test failure rather than a silent
 * pass:
 *
 *  · THE VERB. A GET endpoint called with POST answers 405, exactly as an
 *    HTTP API would. That single behaviour is what makes "every endpoint is
 *    POST" fail loudly here instead of in the sandbox.
 *  · THE SUBSCRIPTION KEY. Missing → 401, with the spec's own 401 body,
 *    which uses `status` and not `statusCode`.
 *  · THE BODY. A POST endpoint with no JSON body answers 400 with the spec's
 *    400 shape.
 *
 * WHAT IT DELIBERATELY DOES NOT ENFORCE: the bearer. The spec declares no
 * bearer scheme at all, so a mock that REQUIRED one would be asserting the
 * thing we are least sure of. It does SERVE one — /token answers the B2C ROPC
 * form with a fixture token — so the tests exercise the default combination
 * (subscription key AND bearer) and the recorded requests say which of the two
 * actually went out.
 *
 * IT SERVES PRICES. GetPanels and GetTests come back with `cost` and
 * `currency` on them, because the spec's examples have them. Stripping them
 * here would make the pricing test prove nothing — the strip has to happen in
 * the client, which is what tests/randoxPricing.test.ts checks by pointing the
 * real client at this server and looking at what comes out.
 *
 * NOTHING REAL GOES NEAR IT. Every value is the spec's own example or a
 * fixture; there are no real patient names and no real dates of birth here or
 * in scenarios.ts.
 */

const SPEC_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'specs', 'nexus-openapi3.json');

interface SpecOperation {
  requestBody?: { content?: Record<string, { example?: unknown }> };
  responses?: Record<string, { content?: Record<string, { example?: unknown }> }>;
}
interface Spec {
  info: { title: string; version: string };
  servers: { url: string }[];
  paths: Record<string, Record<string, SpecOperation>>;
  components?: { securitySchemes?: Record<string, unknown> };
}

let specCache: Spec | null = null;

export function loadNexusSpec(): Spec {
  specCache ??= JSON.parse(fs.readFileSync(SPEC_PATH, 'utf-8')) as Spec;
  return specCache;
}

/** The 200 example the spec gives for a path, or undefined if it gives none. */
export function specExampleFor(pathName: string, status = '200'): unknown {
  const spec = loadNexusSpec();
  const key = `/${pathName.replace(/^\/+/, '')}`;
  const operations = spec.paths[key];
  if (!operations) return undefined;
  const operation = Object.values(operations)[0];
  return operation?.responses?.[status]?.content?.['application/json']?.example;
}

/** The declared verb for a path, straight out of the document. */
export function specVerbFor(pathName: string): RandoxVerb | null {
  const spec = loadNexusSpec();
  const key = `/${pathName.replace(/^\/+/, '')}`;
  const operations = spec.paths[key];
  if (!operations) return null;
  const verb = Object.keys(operations)[0];
  return verb.toUpperCase() as RandoxVerb;
}

/**
 * An override for one path, so a test can serve a payload the spec does not
 * provide. Returning `undefined` falls through to the spec's own example.
 */
export type SpecOverride = (request: { path: string; body: unknown }) => unknown | undefined;

export interface MockNexusServer {
  url: string;
  /** Every request the client made, in order, for contract assertions. */
  requests: { method: string; path: string; body: unknown; hadSubscriptionKey: boolean; hadBearer: boolean }[];
  setOverride(pathName: string, override: SpecOverride | null): void;
  close(): Promise<void>;
}

/**
 * Starts the mock and returns its base URL, in the form
 * RANDOX_NEXUS_BASE_URL takes.
 *
 * `port` exists because config/env.ts parses process.env once at import time:
 * a server on an ephemeral port cannot tell the env its address before the env
 * has been read, so the contract test agrees an address in advance
 * (vitest.config.ts). Omit it and an ephemeral port is used.
 */
export async function startMockNexusServer(
  options: { requireSubscriptionKey?: boolean; port?: number } = {},
): Promise<MockNexusServer> {
  const requireKey = options.requireSubscriptionKey !== false;
  const overrides = new Map<string, SpecOverride>();
  const requests: MockNexusServer['requests'] = [];

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    // The client is configured with `<base>/api`, so strip that prefix the way
    // the real gateway does.
    const pathName = url.pathname.replace(/^\/api\/?/, '').replace(/^\/+/, '');

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

      // A stand-in B2C token endpoint, so the DEFAULT credential combination
      // (subscription key AND bearer) is what the contract tests exercise
      // rather than the one we are least sure of. It answers the five-field
      // ROPC form the auth PDFs document and nothing more.
      if (pathName === 'token' || url.pathname === '/token') {
        const text = JSON.stringify({ access_token: 'fixture-access-token', token_type: 'Bearer', expires_in: 3600 });
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
        return res.end(text);
      }

      const hadSubscriptionKey = Boolean(req.headers[SUBSCRIPTION_KEY_HEADER.toLowerCase()]);
      const hadBearer = typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bearer ');
      requests.push({ method: req.method ?? 'GET', path: pathName, body, hadSubscriptionKey, hadBearer });

      const send = (status: number, payload: unknown) => {
        const text = JSON.stringify(payload);
        res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
        res.end(text);
      };

      // 401 FIRST, and with the spec's own 401 body — which uses `status`,
      // not `statusCode`. That difference is the reason this branch exists at
      // all rather than reusing the 400 shape.
      if (requireKey && !hadSubscriptionKey) {
        return send(401, {
          status: '401',
          message: 'Unauthorized: You are not authorized to make this call, contact Randox support if you think this is incorrect.',
        });
      }

      const declaredVerb = specVerbFor(pathName);
      if (!declaredVerb) {
        return send(404, { statusCode: '404', message: `No such endpoint: ${pathName}` });
      }
      if ((req.method ?? 'GET').toUpperCase() !== declaredVerb) {
        // The behaviour that makes a wrong verb a test failure. 405 is what an
        // HTTP API says when the route exists and the method does not.
        return send(405, {
          statusCode: '405',
          message: `Method ${req.method} is not allowed on ${pathName}. The spec declares this endpoint ${declaredVerb}.`,
        });
      }
      if (declaredVerb === 'POST' && body === undefined) {
        return send(400, {
          statusCode: '400',
          message: 'Bad Request: The submitted request is not a valid JSON or the order id is invalid or missing.',
        });
      }

      const override = overrides.get(pathName);
      if (override) {
        const result = override({ path: pathName, body });
        if (result !== undefined) return send(200, result);
      }

      const example = specExampleFor(pathName);
      if (example === undefined) {
        return send(500, { statusCode: '500', message: `The spec gives no 200 example for ${pathName}.` });
      }
      return send(200, example);
    });
  });

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    url: `http://127.0.0.1:${port}/api`,
    requests,
    setOverride(pathName, override) {
      const key = pathName.replace(/^\/+/, '');
      if (override) overrides.set(key, override);
      else overrides.delete(key);
    },
    close: () =>
      new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

/** The 17 paths, for a test that wants to walk all of them. */
export const ALL_NEXUS_PATHS = Object.values(NEXUS_ENDPOINTS).map((e) => e.path);
