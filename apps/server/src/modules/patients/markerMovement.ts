import type { MarkerStatus } from '@aspire-bloods/shared';

/**
 * How a marker's latest result compares with the one before it — the logic
 * behind Overview's "What's changed" section.
 *
 * Kept pure and separate from portalService.ts because it is the subtlest
 * judgement in the portal: it decides what a patient is told has changed
 * about their own blood results, and it decides it from two numbers and a
 * reference range with no database anywhere near it. That makes it testable,
 * so it is tested (tests/markerMovement.test.ts).
 *
 * Nothing here is clinical. "Meaningful" means worth putting on a screen, not
 * worth acting on, and the copy that renders these values says so.
 */

export type MarkerMovement =
  | 'MOVED_INTO_RANGE'
  | 'MOVED_OUT_OF_RANGE'
  | 'CLOSER_TO_RANGE'
  | 'FURTHER_FROM_RANGE'
  | 'CHANGED_WITHIN_RANGE';

/**
 * A shift of at least this fraction of the marker's own reference band counts
 * as worth mentioning. Scaling to the band is what lets one rule work across
 * ferritin (band ~270 µg/L) and HbA1c (band ~22 mmol/mol) without a
 * per-marker table of thresholds.
 */
export const MEANINGFUL_CHANGE_FRACTION = 0.15;

export interface ComparablePoint {
  value: number;
  status: MarkerStatus;
  referenceLow: number;
  referenceHigh: number;
}

/**
 * The width of a marker's reference band, with fallbacks for the degenerate
 * cases. A band of zero (a range recorded as 5–5) or a missing range would
 * otherwise divide by zero and call every change infinite.
 */
export function referenceBandWidth(point: ComparablePoint): number {
  return point.referenceHigh - point.referenceLow || Math.abs(point.value) || 1;
}

/** How far outside its reference range a value sits — 0 when inside it. */
export function distanceOutsideRange(value: number, low: number, high: number): number {
  if (value < low) return low - value;
  if (value > high) return value - high;
  return 0;
}

/**
 * Worth showing on Overview? Either the status label changed — which the
 * patient will see stated differently and would be confused not to have
 * flagged — or the value moved by at least MEANINGFUL_CHANGE_FRACTION of the
 * band. A status change always qualifies regardless of how small the numeric
 * move was: crossing a reference boundary is the change.
 */
export function isMeaningfulChange(current: ComparablePoint, previous: ComparablePoint): boolean {
  if (current.status !== previous.status) return true;
  return Math.abs(current.value - previous.value) >= referenceBandWidth(current) * MEANINGFUL_CHANGE_FRACTION;
}

/**
 * Which of the five things happened. Note that the two in-range/out-of-range
 * crossings are decided by status, not by comparing the value against the
 * range here — status is computed once upstream with the marker's own
 * severity rules, and re-deriving it from the bounds would let the two
 * disagree.
 */
export function classifyMovement(current: ComparablePoint, previous: ComparablePoint): MarkerMovement {
  const wasOut = previous.status !== 'IN_RANGE';
  const isOut = current.status !== 'IN_RANGE';

  if (wasOut && !isOut) return 'MOVED_INTO_RANGE';
  if (!wasOut && isOut) return 'MOVED_OUT_OF_RANGE';
  if (!isOut) return 'CHANGED_WITHIN_RANGE';

  // Still outside on both readings — did it head back towards the range or
  // away from it? Measured against each reading's own reference range, since
  // a different lab can supply a different range for the same marker.
  const previousDistance = distanceOutsideRange(previous.value, previous.referenceLow, previous.referenceHigh);
  const currentDistance = distanceOutsideRange(current.value, current.referenceLow, current.referenceHigh);
  return currentDistance < previousDistance ? 'CLOSER_TO_RANGE' : 'FURTHER_FROM_RANGE';
}

/**
 * Sort key for "biggest mover first". Expressed in reference-band widths so
 * markers on wildly different scales rank against each other honestly — a
 * ferritin swing of 40 µg/L and an HbA1c swing of 40 mmol/mol are not
 * remotely the same event, and sorting on the raw delta claimed they were.
 */
export function movementMagnitude(current: ComparablePoint, previous: ComparablePoint): number {
  return Math.abs(current.value - previous.value) / referenceBandWidth(current);
}
