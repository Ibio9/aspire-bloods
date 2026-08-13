/**
 * Tolerant readers for Randox's response bodies.
 *
 * The exact property casing Randox use is not documented in anything we
 * have — .NET/Azure APIs commonly return PascalCase, but their APIM layer
 * may well serialise camelCase. Rather than pick one and have every field
 * silently read as undefined if the guess is wrong, each reader accepts
 * several plausible spellings.
 *
 * This is a deliberate temporary tolerance, not a permanent design. Once
 * the real response shapes are confirmed against the sandbox, replace
 * these with direct property access — the call sites are all in
 * NexusLabClient/ClinicBookingClient and nothing above them changes.
 */

import { z } from 'zod';

type Json = Record<string, unknown>;

export function asObject(value: unknown): Json {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {};
}

/** Reads the first present spelling of a property. Case-insensitive. */
export function pick(source: unknown, ...names: string[]): unknown {
  const obj = asObject(source);
  const lowered = new Map(Object.keys(obj).map((k) => [k.toLowerCase(), k]));
  for (const name of names) {
    const actual = lowered.get(name.toLowerCase());
    if (actual !== undefined && obj[actual] !== undefined && obj[actual] !== null) return obj[actual];
  }
  return undefined;
}

export function pickString(source: unknown, ...names: string[]): string | null {
  const value = pick(source, ...names);
  if (value === undefined) return null;
  if (typeof value === 'string') return value.trim() === '' ? null : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

export function requireString(source: unknown, label: string, ...names: string[]): string {
  const value = pickString(source, ...names);
  if (value === null) {
    throw new Error(
      `Randox response is missing ${label} (looked for: ${names.join(', ')}). The response shape has changed or was never what we assumed — see modules/randox/types.ts.`,
    );
  }
  return value;
}

export function requireNumber(source: unknown, label: string, ...names: string[]): number {
  const value = pickNumber(source, ...names);
  if (value === null) {
    throw new Error(
      `Randox response is missing ${label} (looked for: ${names.join(', ')}). The response shape has changed — see modules/randox/types.ts.`,
    );
  }
  return value;
}

export function pickNumber(source: unknown, ...names: string[]): number | null {
  const value = pick(source, ...names);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function pickBoolean(source: unknown, ...names: string[]): boolean {
  const value = pick(source, ...names);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return /^(true|yes|y|1)$/i.test(value.trim());
  if (typeof value === 'number') return value === 1;
  return false;
}

/**
 * Reads a list of codes. Accepts an array of strings, an array of objects
 * with a code property, or a delimited string — labs report code lists in
 * all three shapes and getting this wrong would silently drop a void code,
 * which is the one failure mode this integration must not have.
 */
export function pickCodeList(source: unknown, ...names: string[]): string[] {
  const value = pick(source, ...names);
  if (value === undefined) return [];

  if (typeof value === 'string') {
    return value
      .split(/[,;|]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === 'string') return entry.trim();
        if (typeof entry === 'number') return String(entry);
        return pickString(entry, 'code', 'Code', 'value', 'id') ?? '';
      })
      .filter(Boolean);
  }

  return [];
}

/**
 * Unwraps whatever envelope a list came back in. Handles a bare array, and
 * the common `{ data: [...] }` / `{ items: [...] }` / `{ results: [...] }`
 * wrappers. Anything else yields an empty list rather than throwing —
 * callers treat "no items" as a legitimate answer.
 */
export function pickArray(source: unknown, ...names: string[]): unknown[] {
  if (Array.isArray(source)) return source;
  const direct = pick(source, ...names);
  if (Array.isArray(direct)) return direct;
  for (const wrapper of ['data', 'items', 'results', 'value', 'payload']) {
    const nested = pick(source, wrapper);
    if (Array.isArray(nested)) return nested;
    if (nested && typeof nested === 'object') {
      const inner = pick(nested, ...names);
      if (Array.isArray(inner)) return inner;
    }
  }
  return [];
}

/**
 * ---------------------------------------------------------------------------
 * RANDOX TIMESTAMPS HAVE SEVEN FRACTIONAL DIGITS AND AN EXPLICIT OFFSET.
 * ---------------------------------------------------------------------------
 *
 *   2024-08-01T08:45:10.0000000+00:00
 *
 * That is a .NET round-trip format and it is what every date example in the
 * spec uses. Two things follow, one harmless and one not:
 *
 *  · `new Date()` and therefore `toUtcIso` below handle it correctly. Seven
 *    digits of fraction and a written-out "+00:00" are both valid ISO 8601 and
 *    the JavaScript parser accepts them. Nothing to do.
 *
 *  · `z.string().datetime()` REJECTS IT. Zod's default requires the zone to be
 *    literal "Z"; an explicit numeric offset needs `{ offset: true }`. So a
 *    Randox timestamp validated by a bare `.datetime()` fails with "invalid
 *    datetime" on a value that is perfectly well-formed — which reads as a
 *    Randox fault and is ours.
 *
 * `randoxDateTime` is the schema for anywhere a Randox timestamp is validated:
 * it accepts the offset form, accepts any number of fractional digits, and
 * normalises to the UTC ISO string the rest of the system uses, so nothing
 * downstream has to know the wire format existed. Pinned, with that exact
 * literal, by tests/randoxSpecContract.test.ts.
 */
export const RANDOX_DATETIME_EXAMPLE = '2024-08-01T08:45:10.0000000+00:00';

export const randoxDateTime = z
  .string()
  .refine((v) => toUtcIso(v) !== null, {
    message:
      'Expected an ISO 8601 timestamp. Randox send the .NET round-trip form ' +
      `(e.g. ${RANDOX_DATETIME_EXAMPLE}) — seven fractional digits and an explicit offset.`,
  })
  .transform((v) => toUtcIso(v)!);

/**
 * ---------------------------------------------------------------------------
 * EVERY SCALAR IN THIS API IS EFFECTIVELY A STRING, INCLUDING THE INTEGERS.
 * ---------------------------------------------------------------------------
 *
 * The spec is internally inconsistent about id types and it is not close:
 *
 *   TestReasons[].Id     integer in the CreatePendingOrder example,
 *                        STRING in the CreateOrder example — the same field,
 *                        two endpoints, two types.
 *   BiologicalSex ids    strings   ({"id": "1", "name": "Male"})
 *   Ethnicity ids        integers  ({"id": 1,   "name": "White"})
 *   CancellationReasonId string    ("3")
 *   statusCode           documented as an integer, returned as a string in
 *                        every single example in the document.
 *
 * The rule that survives all of that: ACCEPT BOTH ON THE WAY IN, and SEND
 * WHATEVER THAT ENDPOINT'S OWN EXAMPLE USES on the way out. `asRandoxInt` and
 * `asRandoxIdString` are the two halves of it, so a call site states which
 * form the endpoint wants rather than hoping the value already had it.
 */

/** A Randox id as an integer, from either a number or a numeric string. */
export function asRandoxInt(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isInteger(parsed) ? parsed : null;
}

/** A Randox id as the string form some endpoints' examples use. */
export function asRandoxIdString(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

/**
 * Normalises a timestamp that is documented as UTC to an ISO-8601 UTC
 * string.
 *
 * Use this for every Randox timestamp EXCEPT dateOfReceipt and
 * dateOfReport — see fromEuropeLondon() for those two.
 *
 * Randox's examples carry an explicit offset
 * ("2024-08-01T08:45:10.0000000+00:00"), but the spec doesn't guarantee it.
 * A bare "2026-08-07T09:30:00" handed to `new Date()` is interpreted as
 * LOCAL time, which on a UK-hosted server silently shifts every summer
 * timestamp by an hour. So when there's no offset, append Z rather than
 * letting the runtime guess.
 */
export function toUtcIso(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  const parsed = new Date(hasZone ? trimmed : `${trimmed}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Converts a timestamp Randox documents as Europe/London wall-clock time
 * into a true UTC instant.
 *
 * GetOrderResultDetail states this explicitly: "Report Results ->
 * DateOfReceipt & DateOfReport will be returned in Europe/London timezone.
 * All other times will be UTC." Those two fields, and only those two, go
 * through here.
 *
 * Why this matters rather than being pedantry: for roughly seven months of
 * the year London is UTC+1. Reading a London wall-clock 00:30 as UTC puts
 * the sample on the wrong calendar day, and a report dated a day out is a
 * report a clinician cannot reconcile against the appointment.
 *
 * If the string already carries an explicit offset, it is trusted as-is —
 * an offset is unambiguous and beats the documentation about it.
 *
 * The offset is derived from the IANA database via Intl rather than
 * hardcoding "BST is late March to late October", so it stays correct if
 * the UK ever changes its DST rules.
 */
export function fromEuropeLondon(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) {
    const explicit = new Date(trimmed);
    return Number.isNaN(explicit.getTime()) ? null : explicit.toISOString();
  }

  // Read the wall-clock components as though they were UTC, then ask what
  // London's offset was at approximately that instant and subtract it.
  const provisional = new Date(`${trimmed}Z`);
  if (Number.isNaN(provisional.getTime())) return null;

  const offsetMs = londonOffsetMs(provisional);
  const corrected = new Date(provisional.getTime() - offsetMs);

  // One refinement pass. Within an hour of a DST boundary the offset at the
  // provisional instant can differ from the offset at the true instant; if
  // recomputing at the corrected instant gives a different answer, that one
  // is right. (Times inside the skipped hour each spring do not exist in
  // London at all; they resolve to the boundary, which is the least-wrong
  // answer available and is not a case a lab timestamp should ever hit.)
  const refinedOffsetMs = londonOffsetMs(corrected);
  const result = refinedOffsetMs === offsetMs ? corrected : new Date(provisional.getTime() - refinedOffsetMs);

  return result.toISOString();
}

/**
 * ---------------------------------------------------------------------------
 * CLINIC BOOKING SLOT TIMES: TWO DATE FORMATS, ONE ZONE, AND A TRAP.
 * ---------------------------------------------------------------------------
 *
 * AvailabilityDetails returns slots in UTC — stated on the flow diagram, "get
 * list of date & times - all UTC". The two calls that then reference a slot
 * spell its date differently, in the SAME flow, in the SAME collection:
 *
 *   HoldAvailabilityBooking   "AppointmentSlotDate": "16/10/2025"
 *   CreateRandoxBooking       "AppointmentSlotDate": "2025-10-16T00:00:00Z"
 *   both                      "AppointmentSlotTIme": "09:30"
 *
 * Each endpoint is sent what its own example uses. That is the same rule the
 * Nexus side already runs on (`asRandoxInt` / `asRandoxIdString`) and it is
 * the only rule that survives a pair of documents that disagree with each
 * other.
 *
 * THE TRAP, AND IT IS PROVABLE FROM THE COLLECTION ITSELF. The example's
 * AppointmentSlotId is "72164:72164::1760607000:", and 1760607000 as a Unix
 * epoch is 2025-10-16T09:30:00Z — the same 09:30 the example sends. In London
 * that instant is 10:30, because 16 October is inside BST. So the date and
 * time fields carry the slot's UTC WALL CLOCK and not its UK local one, and a
 * formatter using local getters on a UK-hosted server would have sent "10:30"
 * for seven months of the year: a hold placed on a slot an hour away from the
 * one the patient chose, with nothing in any response to say so.
 *
 * Hence `getUTC*` throughout below, and hence these live in one place with
 * that reasoning attached rather than being inlined at three call sites.
 *
 * `londonWallClock` is the other direction and the other rule: a slot is
 * DISPLAYED in UK local time, because a patient attends an appointment in the
 * time zone the clinic is in. Nothing between the API and the render converts
 * anything — the instant stays UTC the whole way — and this is the single
 * function that turns one into the other, at the edge, explicitly.
 */

function utcParts(startUtc: string): { date: Date; yyyy: string; mm: string; dd: string; hh: string; mi: string } {
  const date = new Date(startUtc);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`"${startUtc}" is not a usable slot timestamp. Availability slots are UTC ISO-8601 instants.`);
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date,
    yyyy: String(date.getUTCFullYear()),
    mm: pad(date.getUTCMonth() + 1),
    dd: pad(date.getUTCDate()),
    hh: pad(date.getUTCHours()),
    mi: pad(date.getUTCMinutes()),
  };
}

/** "16/10/2025" — the form HoldAvailabilityBooking's own example uses. */
export function slotDateDayFirst(startUtc: string): string {
  const p = utcParts(startUtc);
  return `${p.dd}/${p.mm}/${p.yyyy}`;
}

/**
 * "2025-10-16T00:00:00Z" — the form CreateRandoxBooking's own example uses.
 *
 * MIDNIGHT, not the slot instant: their example pairs a midnight timestamp
 * with a separate AppointmentSlotTIme of "09:30", so sending the real instant
 * here would put the time in two places and invite them to disagree.
 */
export function slotDateIsoMidnightZ(startUtc: string): string {
  const p = utcParts(startUtc);
  return `${p.yyyy}-${p.mm}-${p.dd}T00:00:00Z`;
}

/** "09:30", from the UTC clock. See the trap above. */
export function slotTimeOfDay(startUtc: string): string {
  const p = utcParts(startUtc);
  return `${p.hh}:${p.mi}`;
}

/**
 * The same instant as UK local wall clock, for anything a patient reads.
 *
 * Europe/London explicitly, never the runtime's own zone: the appointment is
 * at a clinic in the UK whatever zone the reader's device is set to, and a
 * patient booking from abroad must not be shown their own local time for it.
 */
export function londonWallClock(startUtc: string): { date: string; time: string; timeZone: 'Europe/London' } {
  const instant = new Date(startUtc);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`"${startUtc}" is not a usable slot timestamp.`);
  }
  const parts = LONDON_PARTS.formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
    timeZone: 'Europe/London',
  };
}

const LONDON_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** London's UTC offset in milliseconds at a given instant (+3600000 in BST). */
function londonOffsetMs(instant: Date): number {
  const parts = LONDON_PARTS.formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}
