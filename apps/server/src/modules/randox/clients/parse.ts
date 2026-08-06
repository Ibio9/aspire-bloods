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
