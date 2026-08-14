/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { RANDOX_DOCUMENTED, RANDOX_TRANSPORT_DEFAULTS } from '../src/modules/randox/documentedDefaults.js';
import type { RandoxApiConnection } from '../src/modules/randox/connection.js';
import type { RandoxHttpClient } from '../src/modules/randox/http/RandoxHttpClient.js';
import { assertWithinDocumentedLimit } from '../src/modules/randox/http/rateLimiter.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  WHAT THE SANDBOX SCRIPTS SHARE: THE GUARDS, THE CREDENTIALS AND THE CAPTURE
 *  FORMAT. NOT THE FLOW.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * There are two commands now — `sandbox:pass`, which walks the whole documented
 * flow and creates an order, and `sandbox:poll`, which asks after one that
 * already exists — and the second exists so that an order can be left overnight
 * and checked in the morning WITHOUT creating another one.
 *
 * THIS FILE IS WHY "SAME SAFETY CHECKS, SAME CAPTURE FORMAT" IS A FACT RATHER
 * THAN A CLAIM. Everything a second script could quietly get wrong is here and
 * is imported rather than re-typed:
 *
 *   · WHICH HOST. stes- only, never under NODE_ENV=production, checked on the
 *     URLs that will actually be called.
 *   · WHICH CREDENTIALS, reported BY NAME and all at once. Finding out about
 *     three missing ones a run at a time is its own kind of waste.
 *   · THE CONNECTION, handed to the real `RandoxHttpClient` — real B2C ROPC
 *     auth, real headers, real pacing, real retry, real 401 handling. A capture
 *     taken through a second implementation is a record of the second
 *     implementation.
 *   · THE CAPTURE SHAPE: the request that produced it, the HTTP status, the
 *     parsed body and the RAW response text, because "this is what our helpers
 *     made of it" is not a record of what Randox sent.
 *
 * What is NOT here is any flow. The pass's order-building and the poll's status
 * loop are each their own file's business.
 */

export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * `.env.sandbox` first, then `.env`, and anything already in the real
 * environment beats both — dotenv does not overwrite what is already set.
 *
 * Two files rather than one because they hold different things. `.env` is what
 * the SERVER needs to boot on this machine; `.env.sandbox` is the credentials
 * for somebody else's API. Keeping the Randox pair in their own file is what
 * lets these scripts need nothing else: a file with two keys and a password in
 * it, and no database URL anywhere near it. Both are gitignored.
 */
loadDotenv({ path: path.join(SERVER_ROOT, '.env.sandbox') });
loadDotenv({ path: path.join(SERVER_ROOT, '.env') });

export const OUT_DIR = path.join(SERVER_ROOT, 'src/modules/randox/specs/sandbox-responses');

// ---------------------------------------------------------------------------
// Configuration — process.env only, Randox only, and it says what is missing
// ---------------------------------------------------------------------------

export function read(name: string): string {
  return (process.env[name] ?? '').trim();
}

/** The first of several spellings that is set. Shared pair, per-API override. */
export function readFirst(...names: string[]): string {
  for (const name of names) {
    const value = read(name);
    if (value !== '') return value;
  }
  return '';
}

export function readInt(name: string, fallback: number): number {
  const raw = read(name);
  if (raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} is "${raw}", which is not an integer.`);
  }
  return parsed;
}

export function readBool(name: string, fallback: boolean): boolean {
  const raw = read(name).toLowerCase();
  if (raw === '') return fallback;
  if (raw !== 'true' && raw !== 'false') {
    throw new Error(`${name} is "${raw}", which is neither "true" nor "false".`);
  }
  return raw === 'true';
}

export function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * A credential a run cannot proceed without, and the several variable names it
 * may arrive under. Reported by NAME, all at once.
 */
export interface CredentialNeed {
  names: string[];
  why: string;
}

export function missingOf(needs: CredentialNeed[]): CredentialNeed[] {
  return needs.filter((need) => readFirst(...need.names) === '');
}

export function describe(needs: CredentialNeed[]): string {
  return needs.map((n) => `  - ${n.names.join(' (or ')}${n.names.length > 1 ? ')' : ''} — ${n.why}`).join('\n');
}

const ROPC_WHY = 'ROPC is a password grant, so it needs the service account created in the developer portal';

export function transportSettings() {
  const maxRequestsPerMinute = readInt('RANDOX_MAX_REQUESTS_PER_MINUTE', RANDOX_TRANSPORT_DEFAULTS.maxRequestsPerMinute);
  // The same guard the server boots with. A pace above Randox's documented
  // ceiling is a mistake wherever it is set, and these scripts are the place
  // that would discover it against the real gateway.
  assertWithinDocumentedLimit(maxRequestsPerMinute);
  return {
    maxRequestsPerMinute,
    retryMaxAttempts: readInt('RANDOX_RETRY_MAX_ATTEMPTS', RANDOX_TRANSPORT_DEFAULTS.retryMaxAttempts),
    retryBaseDelayMs: readInt('RANDOX_RETRY_BASE_DELAY_MS', RANDOX_TRANSPORT_DEFAULTS.retryBaseDelayMs),
    bearerTokenEnabled: readBool('RANDOX_BEARER_TOKEN_ENABLED', RANDOX_TRANSPORT_DEFAULTS.bearerTokenEnabled),
  };
}

export const NEXUS_NEEDS: CredentialNeed[] = [
  {
    names: ['RANDOX_NEXUS_SUBSCRIPTION_KEY'],
    why: 'Ocp-Apim-Subscription-Key on every Nexus request, from the Nexus developer portal',
  },
  { names: ['RANDOX_NEXUS_USERNAME', 'RANDOX_USERNAME'], why: ROPC_WHY },
  { names: ['RANDOX_NEXUS_PASSWORD', 'RANDOX_PASSWORD'], why: ROPC_WHY },
];

export const BOOKING_NEEDS: CredentialNeed[] = [
  {
    names: ['RANDOX_BOOKING_SUBSCRIPTION_KEY'],
    why: 'a SEPARATE key from a separate developer portal — not the Nexus one',
  },
  { names: ['RANDOX_BOOKING_USERNAME', 'RANDOX_USERNAME'], why: ROPC_WHY },
  { names: ['RANDOX_BOOKING_PASSWORD', 'RANDOX_PASSWORD'], why: ROPC_WHY },
];

export function nexusConnection(): RandoxApiConnection {
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

export function bookingConnection(): RandoxApiConnection {
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

/**
 * stes- only, and never under NODE_ENV=production. Checked on the URLs that
 * will ACTUALLY be called, which is why it takes the hosts rather than reading
 * them itself — the pass calls two APIs and the poll calls one.
 *
 * `command` is in the message because the refusal is the same shape from both
 * scripts and the reader needs to know which one refused.
 */
export function assertSandboxOnlyOrExit(command: string, hosts: [string, string][]): void {
  const problems: string[] = [];
  if (process.env.NODE_ENV === 'production') problems.push('NODE_ENV is production.');
  for (const [label, url] of hosts) {
    if (!/(^|\/\/)stes-/.test(url)) problems.push(`${label} base URL "${url}" is not a stes- sandbox host.`);
  }
  if (problems.length > 0) {
    console.error(
      `Refusing to run ${command}:\n` +
        problems.map((p) => `  - ${p}`).join('\n') +
        '\n\nThese scripts talk to a third party. They run only against the stes- sandbox hosts, which are the\n' +
        'defaults, and never under NODE_ENV=production.',
    );
    process.exit(1);
  }
}

export function requireCredentialsOrExit(command: string, needs: CredentialNeed[]): void {
  const missing = missingOf(needs);
  if (missing.length === 0) return;
  console.error(
    `Refusing to run ${command}: ${missing.length} Randox credential(s) are missing.\n` +
      describe(missing) +
      '\n\nThose are the ONLY things this script needs. It does not touch the database, issue sessions or sign\n' +
      'files, so it does not want DATABASE_URL, the JWT secrets, ENCRYPTION_KEY, FILE_SIGNING_SECRET or the app\n' +
      `URLs. Put them in ${path.join(SERVER_ROOT, '.env.sandbox')} (gitignored) or in the shell.\n` +
      'See src/modules/randox/specs/sandbox-responses/README.md.',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

export interface Capture {
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

export const captures: Capture[] = [];
let step = 0;

/**
 * What goes in front of the step number in a filename.
 *
 * The pass owns the bare `NN-` sequence and clears it on every run. The POLL
 * writes into the same directory and must not join that sequence: it runs at a
 * different time, against an order the pass created hours earlier, and a
 * `03-GetOrderStatus.json` from a poll sitting beside `03-CreatePendingOrder`
 * from the pass is two runs in one numbering with nothing in the filenames to
 * say so. It prefixes with `poll-<orderNumber>-` instead, so a second poll of
 * the same order replaces its own captures and never anybody else's.
 */
let capturePrefix = '';

export function setCapturePrefix(prefix: string): void {
  capturePrefix = prefix;
}

export function slug(name: string): string {
  return name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function call(
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
    // about whether it landed, and the pass places real sandbox orders.
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
    path.join(OUT_DIR, `${capturePrefix}${String(step).padStart(2, '0')}-${slug(name)}.json`),
    `${JSON.stringify(capture, null, 2)}\n`,
  );
  console.log(`  ${String(step).padStart(2, '0')}  ${res.status}  ${endpoint.verb} ${endpoint.path}  (${name})`);
  return capture;
}

/** Reads a field under any of the spellings this API has been seen to use. */
export function pick(body: unknown, ...names: string[]): unknown {
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
export function asInt(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}
