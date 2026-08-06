/**
 * Parsing Randox's string-typed result fields.
 *
 * `result`, `refLow` and `refHigh` are all declared `string` in the Nexus
 * spec, and genuinely carry three different kinds of content:
 *
 *   a plain number      "5.85"
 *   a comparator        "< 5.0"   "≥60"   "> 40"
 *   qualitative text    "Not detected"   "Reactive"   "See comment"
 *
 * The single rule this module exists to enforce: a value that is not a
 * plain number NEVER becomes one. "< 5.0" is not 5.0 and is not 0. A
 * comparator result means the true value lies somewhere beyond a detection
 * limit; substituting the limit for the value would put a specific number
 * on a patient's record that the laboratory did not measure, and would then
 * be plotted on a trend line as though it had been.
 *
 * So a comparator or qualitative result yields value: null and keeps the
 * original text. It is still a real, reportable result — it renders, with
 * its text — it simply has no position on a range bar and no trend point.
 */

/** A comparator prefix and what it means, in the order they must be tested. */
const COMPARATORS: { pattern: RegExp; operator: string }[] = [
  { pattern: /^(<=|≤|=<)\s*/, operator: '≤' },
  { pattern: /^(>=|≥|=>)\s*/, operator: '≥' },
  { pattern: /^</, operator: '<' },
  { pattern: /^>/, operator: '>' },
];

export type ResultKind = 'numeric' | 'comparator' | 'qualitative' | 'absent';

export interface ParsedResultValue {
  kind: ResultKind;
  /** Non-null ONLY for kind 'numeric'. Never inferred from a comparator. */
  value: number | null;
  /** The comparator, for kind 'comparator'. */
  operator: string | null;
  /** The number the comparator bounds. Not the result — a limit. */
  bound: number | null;
  /** The original text, trimmed. What gets displayed for a non-numeric result. */
  text: string | null;
}

/**
 * Parses one of Randox's string result/range fields.
 *
 * Deliberately strict about what counts as numeric: the whole string, after
 * trimming, must be a number. "5.85 mmol/l" is not numeric here — a unit
 * smuggled into the value field is a data problem an admin should see, not
 * something to silently strip and hope the units column agreed.
 */
export function parseRandoxValue(raw: string | null | undefined): ParsedResultValue {
  if (raw === null || raw === undefined) return { kind: 'absent', value: null, operator: null, bound: null, text: null };

  const text = String(raw).trim();
  if (text === '') return { kind: 'absent', value: null, operator: null, bound: null, text: null };

  // Plain number. Number('') is 0 and Number(' ') is 0, both already
  // excluded above; Number('5e3') is 5000, which is a legitimate way for a
  // lab to write a count.
  const asNumber = Number(text);
  if (Number.isFinite(asNumber)) {
    return { kind: 'numeric', value: asNumber, operator: null, bound: null, text };
  }

  for (const { pattern, operator } of COMPARATORS) {
    if (!pattern.test(text)) continue;
    const remainder = text.replace(pattern, '').trim();
    const bound = Number(remainder);
    if (remainder !== '' && Number.isFinite(bound)) {
      // value stays null. This is the entire point of the module.
      return { kind: 'comparator', value: null, operator, bound, text };
    }
    // "<" followed by something that isn't a number — treat as qualitative
    // rather than pretending we understood it.
    break;
  }

  return { kind: 'qualitative', value: null, operator: null, bound: null, text };
}

export interface ParsedReferenceRange {
  /** Both non-null only when the range is genuinely two-sided and numeric. */
  low: number | null;
  high: number | null;
  /** True when the lab gave a range but only one side of it. */
  oneSided: boolean;
  /** Originals, for display and for an admin deciding what the range should be. */
  lowRaw: string | null;
  highRaw: string | null;
}

/**
 * Parses the refLow/refHigh pair.
 *
 * One-sided ranges are real and common — the example report in specs/ has
 * "<5.0 Desirable / ≥5.0 High" for Total Cholesterol and "≥60 Satisfactory"
 * for eGFR. A comparator on a bound is folded into that bound (refLow "≥60"
 * means the low bound is 60), because unlike a *result*, a bound with a
 * comparator is stating exactly the number we want.
 *
 * A one-sided range does not become a two-sided one by inventing the
 * missing end. Our marker status is computed against a low AND a high, so a
 * one-sided range is reported as such and left for an admin: substituting 0
 * or Infinity would make every result on that marker land IN_RANGE at one
 * end, which reads as reassurance we haven't earned.
 */
export function parseReferenceRange(
  refLow: string | null | undefined,
  refHigh: string | null | undefined,
): ParsedReferenceRange {
  const low = parseRandoxValue(refLow);
  const high = parseRandoxValue(refHigh);

  const lowValue = boundOf(low);
  const highValue = boundOf(high);

  return {
    low: lowValue,
    high: highValue,
    oneSided: (lowValue === null) !== (highValue === null),
    lowRaw: low.text,
    highRaw: high.text,
  };
}

/** A bound may be plain or comparator-prefixed; both give a usable number. */
function boundOf(parsed: ParsedResultValue): number | null {
  if (parsed.kind === 'numeric') return parsed.value;
  if (parsed.kind === 'comparator') return parsed.bound;
  return null;
}

/**
 * Randox's own out-of-range indicator (`lowHigh`), normalised. Their
 * vocabulary isn't documented, so this reads the shapes labs actually use
 * and returns null for anything it doesn't recognise rather than guessing —
 * an unrecognised indicator must not be turned into "normal".
 */
export type LabIndicator = 'HIGH' | 'LOW' | 'NORMAL' | null;

export function normaliseLabIndicator(raw: string | null | undefined): LabIndicator {
  if (!raw) return null;
  const text = raw.trim().toUpperCase();
  if (text === '') return null;
  if (['H', 'HI', 'HIGH', 'ABOVE', 'A'].includes(text)) return 'HIGH';
  if (['L', 'LO', 'LOW', 'BELOW', 'B'].includes(text)) return 'LOW';
  if (['N', 'NORM', 'NORMAL', 'OK', 'IN RANGE', 'INRANGE', ''].includes(text)) return 'NORMAL';
  return null;
}

/**
 * Whether the lab's indicator contradicts the status we computed from the
 * value against the range.
 *
 * Neither side wins. We keep our own computed status (it is derived from
 * the value and range we actually stored, so it is the one that will agree
 * with what a patient sees on the range bar), we keep the lab's indicator
 * verbatim, and we raise the disagreement for an admin.
 *
 * A disagreement almost always means the range we parsed is not the range
 * the laboratory applied — a one-sided range, a sex- or age-specific range
 * they used and didn't send, or a unit mismatch. Silently preferring either
 * answer would bury exactly that.
 *
 * Returns false when the lab said nothing, or said something we don't
 * recognise: absence of an opinion is not disagreement.
 */
export function labStatusDisagrees(
  indicator: LabIndicator,
  ourStatus: 'IN_RANGE' | 'HIGH' | 'LOW' | 'SIGNIFICANT_HIGH' | 'SIGNIFICANT_LOW',
): boolean {
  if (indicator === null) return false;
  const oursHigh = ourStatus === 'HIGH' || ourStatus === 'SIGNIFICANT_HIGH';
  const oursLow = ourStatus === 'LOW' || ourStatus === 'SIGNIFICANT_LOW';

  if (indicator === 'HIGH') return !oursHigh;
  if (indicator === 'LOW') return !oursLow;
  return oursHigh || oursLow; // lab says normal, we say out of range
}
