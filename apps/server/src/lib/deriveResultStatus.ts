import type { MarkerStatus } from '@aspire-bloods/shared';
import { computeMarkerStatus } from './markerStatus.js';

/**
 * Working out a marker's status at parse time, so an admin doesn't type it in
 * forty times per report.
 *
 * Two things make this less trivial than "is the number between the two other
 * numbers":
 *
 *  1. WHICH range. The reference range printed on the result by the lab is the
 *     authority — that is what "reference ranges live on the result, not the
 *     marker" means, and it is the range the lab actually applied. Only where
 *     the result carries no range at all does the marker's stored fallback get
 *     used, and that fact travels with the answer so the admin can see which
 *     one they're looking at. Where there is neither, this returns "needs
 *     input" and no range is invented.
 *
 *  2. Values that aren't numbers. Assays report censored values ("< 5.0" when
 *     the analyte is below the detection limit, "> 40" above it) and
 *     qualitative outcomes ("Not detected"). These arrive through the same
 *     field as numbers. A censored value can sometimes be placed against a
 *     range with certainty — "< 5.0" against a range whose ceiling is 5.0 and
 *     whose floor is zero is unambiguously in range — and sometimes cannot.
 *     Where it cannot, this says unevaluable rather than picking a side.
 *     Coercing "< 5.0" to 5.0 is the specific mistake this file exists to make
 *     impossible.
 */

// ---------------------------------------------------------------------------
// Classifying the value
// ---------------------------------------------------------------------------

export type ClassifiedValue =
  /** A plain number. */
  | { kind: 'numeric'; value: number }
  /** A censored/limit value: the true result is on one side of `bound`. */
  | { kind: 'comparator'; operator: '<' | '<=' | '>' | '>='; bound: number; text: string }
  /** A qualitative outcome ("Not detected", "Reactive"). No position on any numeric range. */
  | { kind: 'qualitative'; text: string }
  /** Nothing usable at all. */
  | { kind: 'absent' };

// Accepts the ASCII and the typographic forms of each comparator — labs print
// both, and "≤5.0" failing to parse would silently demote a row that is
// perfectly readable.
const COMPARATOR = /^([<≤>≥]|<=|>=)\s*(-?\d+(?:\.\d+)?)$/;

export function classifyValue(value: number | null, resultText: string | null): ClassifiedValue {
  if (typeof value === 'number' && Number.isFinite(value)) return { kind: 'numeric', value };

  const text = resultText?.trim();
  if (!text) return { kind: 'absent' };

  const plain = Number(text);
  if (text !== '' && Number.isFinite(plain) && /^-?\d+(\.\d+)?$/.test(text)) {
    return { kind: 'numeric', value: plain };
  }

  const m = text.replace(/\s+/g, '').match(COMPARATOR);
  if (m) {
    const raw = m[1];
    const operator = raw === '<' ? '<' : raw === '>' ? '>' : raw === '≤' || raw === '<=' ? '<=' : '>=';
    return { kind: 'comparator', operator, bound: Number(m[2]), text };
  }

  return { kind: 'qualitative', text };
}

// ---------------------------------------------------------------------------
// Which range applies
// ---------------------------------------------------------------------------

export type RangeSource = 'result' | 'marker_fallback';

export type ResolvedResultRange =
  | { status: 'resolved'; source: RangeSource; low: number; high: number; unit: string | null }
  /** No usable range from either place. The marker needs an admin to supply one. */
  | { status: 'missing'; reason: string };

export interface FallbackRange {
  low: number;
  high: number;
  unit: string;
}

/**
 * Strict precedence, in this order and no other:
 *   1. the range the lab printed on this result
 *   2. the marker's stored fallback range for this patient's sex and age
 *   3. nothing — say so
 */
export function resolveResultRange(
  onResult: { low: number | null; high: number | null; unit: string | null },
  fallback: FallbackRange | null,
  fallbackUnavailableReason: string | null,
): ResolvedResultRange {
  if (onResult.low != null && onResult.high != null && onResult.low < onResult.high) {
    return { status: 'resolved', source: 'result', low: onResult.low, high: onResult.high, unit: onResult.unit };
  }
  if (fallback && fallback.low < fallback.high) {
    return { status: 'resolved', source: 'marker_fallback', low: fallback.low, high: fallback.high, unit: fallback.unit };
  }
  return {
    status: 'missing',
    reason:
      fallbackUnavailableReason ??
      'The lab printed no reference range for this result and the marker has no stored fallback range, so there is nothing to judge it against. Enter the range from the report.',
  };
}

// ---------------------------------------------------------------------------
// Deriving the status
// ---------------------------------------------------------------------------

export type DerivedStatus =
  | { status: 'derived'; value: MarkerStatus }
  /** A real, expected answer — not a failure. A qualitative result has no position on a range. */
  | { status: 'unevaluable'; reason: string };

export interface SeverityConfig {
  severityMultiplier: number;
  severityAbsoluteDelta: number | null;
}

export function deriveStatus(
  value: ClassifiedValue,
  low: number,
  high: number,
  severity: SeverityConfig,
): DerivedStatus {
  if (value.kind === 'numeric') {
    return {
      status: 'derived',
      value: computeMarkerStatus(value.value, low, high, severity.severityMultiplier, severity.severityAbsoluteDelta),
    };
  }

  if (value.kind === 'comparator') {
    const { operator, bound, text } = value;
    const below = operator === '<' || operator === '<=';
    // "< X" where X is at or below the range floor: every value the result
    // could possibly be is below the floor. Certain, so it's stated.
    if (below && (operator === '<' ? bound <= low : bound < low)) {
      return { status: 'derived', value: computeMarkerStatus(low - 1, low, high, severity.severityMultiplier, severity.severityAbsoluteDelta) };
    }
    // "< X" where X is at or below the ceiling AND the floor is at or below
    // zero (i.e. the marker has no meaningful lower bound — the overwhelmingly
    // common shape for a detection-limit result). Everything below X is then
    // inside the range.
    if (below && bound <= high && low <= 0) {
      return { status: 'derived', value: 'IN_RANGE' };
    }
    // "> X" where X is at or above the ceiling: certainly above.
    if (!below && (operator === '>' ? bound >= high : bound > high)) {
      return { status: 'derived', value: computeMarkerStatus(high + 1, low, high, severity.severityMultiplier, severity.severityAbsoluteDelta) };
    }
    // Anything else straddles the range: "< 5.0" against a 2.0–8.0 range could
    // be in range or below it, and there is no honest way to choose.
    return {
      status: 'unevaluable',
      reason: `The result is a limit, not a measurement (“${text}”), and it straddles the reference range ${low}–${high}, so its position can’t be determined. Recorded as reported.`,
    };
  }

  if (value.kind === 'qualitative') {
    return {
      status: 'unevaluable',
      reason: `“${value.text}” is a qualitative result with no position on a numeric range. Recorded as reported.`,
    };
  }

  return { status: 'unevaluable', reason: 'No value was extracted for this row.' };
}

/**
 * The status to STORE for a derivation result — and the only sanctioned way to
 * get from a DerivedStatus to a column value.
 *
 * It exists because of the specific bug it makes unwriteable. The verify path
 * used to finish with:
 *
 *     const status = derived.status === 'derived' ? derived.value : 'IN_RANGE';
 *
 * which is the sentence "if we could not work out where this result sits, say
 * it is fine". Every unevaluable row — a qualitative outcome, a straddling
 * detection limit, and above all a row with no value in it at all — was
 * persisted as IN_RANGE and then presented to the patient as "In range",
 * complete with the green wash. A marker nobody had measured told somebody
 * their health was fine.
 *
 * Unevaluable is not a failure and it is not a pass. It is the absence of a
 * comparison, and the column is nullable so it can be stored as exactly that.
 * There is no default here and there must never be one: any future caller
 * reaching for a fallback has to write `?? 'IN_RANGE'` in plain sight, where a
 * reviewer can see it.
 */
export function statusForStorage(derived: DerivedStatus): MarkerStatus | null {
  return derived.status === 'derived' ? derived.value : null;
}

/**
 * Whether our derived status contradicts the lab's own high/low indicator.
 *
 * Neither is silently preferred. A disagreement almost always means the range
 * we read is not the range the lab applied, which is precisely the kind of
 * thing a human should look at rather than a rule should resolve.
 */
export function disagreesWithLabIndicator(indicator: string | null | undefined, derived: MarkerStatus): boolean {
  if (!indicator) return false;
  const normalised = indicator.trim().toUpperCase();
  if (normalised === '' || normalised === 'N' || normalised === 'NORMAL' || normalised === 'IN RANGE') {
    return derived !== 'IN_RANGE';
  }
  if (normalised === 'H' || normalised === 'HIGH') {
    return derived !== 'HIGH' && derived !== 'SIGNIFICANT_HIGH';
  }
  if (normalised === 'L' || normalised === 'LOW') {
    return derived !== 'LOW' && derived !== 'SIGNIFICANT_LOW';
  }
  // An indicator we don't recognise is not evidence of agreement OR
  // disagreement — treat it as neither rather than manufacturing a flag.
  return false;
}
