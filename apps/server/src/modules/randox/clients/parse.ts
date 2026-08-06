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
 * Normalises a Randox timestamp to a real ISO-8601 UTC string.
 *
 * Randox document availability as UTC but do not guarantee the string
 * carries a zone designator. A bare "2026-08-07T09:30:00" parsed by
 * `new Date()` is interpreted as LOCAL time, which on a UK-hosted server
 * silently shifts every summer appointment by an hour. So: if there's no
 * explicit offset, append Z rather than letting the runtime guess.
 */
export function toUtcIso(raw: string | null): string | null {
  if (!raw) return null;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw.trim());
  const candidate = hasZone ? raw.trim() : `${raw.trim()}Z`;
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
