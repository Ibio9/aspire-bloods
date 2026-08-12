import { severityThresholdFor } from '@aspire-bloods/shared';

/**
 * =============================================================================
 *  THE SCALE A RANGE BAR IS DRAWN ON — AND IT IS NOT THE REFERENCE RANGE.
 * =============================================================================
 *
 * A range bar answers one question: WHERE DOES THIS RESULT SIT. Everything in
 * here exists because it was answering it wrongly, in two directions, on real
 * patient data:
 *
 *   · A value of 122 against a reference range of 0–41 drew a bar labelled
 *     "0" and "41" with the mark hard against the right-hand end. Read
 *     literally — and it is read literally — that says "just at the top of the
 *     range". The result is three times the upper limit.
 *   · A value of 65 against 125–375 drew a bar labelled "125" and "375" with
 *     the mark INSIDE it, near the left. The value is below the entire printed
 *     scale and was drawn as though it were within it.
 *
 * The bug was never the geometry: the domain already stretched to hold the
 * value. It was that THE NUMBERS UNDER THE ENDS OF THE BAR WERE THE REFERENCE
 * BOUNDS rather than the scale that had actually been drawn. So the reader was
 * given a correct picture with a false axis on it, which is worse than either
 * on its own — a bar that is obviously wrong gets ignored, and a bar that is
 * quietly wrong gets believed.
 *
 * So this module has one job and every caller shares it: given a result and its
 * range, produce THE SCALE THAT IS DRAWN, and let the labels come from that.
 *
 * Three rules, and they are the ones the bar can't be right without:
 *
 *  1. THE SCALE ALWAYS CONTAINS THE VALUE, with headroom. Never clamped to an
 *     end — a mark pinned to the edge of a bar is a mark that has stopped
 *     carrying information, and it is indistinguishable from a mark that
 *     legitimately sits at the edge.
 *  2. THE SCALE ALWAYS CONTAINS THE REFERENCE RANGE, so a reader can see both
 *     where the range is and how far past it they are, in one picture.
 *  3. WHEN BOTH CANNOT BE DRAWN HONESTLY, NOTHING IS DRAWN. A reference range
 *     rendered as a two-pixel sliver at one end is a bar that says "your range
 *     is somewhere over there", which is not a scale. The caller says it in
 *     words instead — see `outOfScale`.
 */

/**
 * The smallest share of the drawn scale the reference range may occupy before
 * the bar stops being a picture of anything.
 *
 * 5% of a 300px bar is 15px — narrow, and still a region with two visible
 * edges and a hairline at each. Below that the two bounds collapse onto one
 * another and the band is a line. It takes a value about twenty times the
 * width of its own range to reach this, so it is a genuine backstop rather
 * than a path anything ordinary goes down.
 */
export const MIN_REFERENCE_FRACTION = 0.05;

/**
 * How far from either end the mark is kept, as a share of the drawn scale.
 *
 * The mark is 14px across and overhangs the track by half of it, so a value at
 * 100% is drawn half outside the bar — which is exactly what "pinned to the
 * end" looked like. Six per cent of a 300px bar is 18px: enough for the mark
 * to be visibly inside the scale rather than falling off it.
 */
const HEADROOM = 0.06;

export interface RangeBarScale {
  /** The left-hand end of the drawn scale, in the result's own units. This IS the number printed under it. */
  min: number;
  /** The right-hand end, likewise. */
  max: number;
  /** Where a value falls along the drawn scale, 0–100. Total: the scale contains everything it was built from. */
  pct: (value: number) => number;
  /** What share of the drawn scale the reference range occupies, 0–1. */
  referenceFraction: number;
  /**
   * The reference range is too narrow a share of the scale to draw. The caller
   * must say where the result sits in WORDS rather than drawing it wrongly.
   */
  outOfScale: boolean;
}

export interface RangeBarScaleInput {
  low: number;
  high: number;
  value: number;
  /** Where significantly-out begins, in the result's own units. Shapes the resting shoulder. */
  severityThreshold?: number | null;
}

/**
 * The smallest step from the 1 / 2 / 2.5 / 5 ladder at this span's own order of
 * magnitude, aiming for about ten of them across the bar.
 *
 * The same ladder the trend chart's y-axis uses, and for the same reason: the
 * number printed under the end of a bar has to be one a person would have
 * chosen. Left raw, the scale for a value of 122 against 0–41 ends at 129.79 —
 * an artefact of the headroom arithmetic showing through, and a reader who sees
 * one correctly stops trusting the numbers beside it.
 */
function niceStep(span: number): number {
  if (!Number.isFinite(span) || span <= 0) return 1;
  const rough = span / 10;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}

/** How many decimals a step of this size needs to print exactly, so 2.0000000000000004 never reaches an axis. */
function decimalsFor(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  return Math.max(0, Math.min(6, Math.ceil(-Math.log10(step)) + 1));
}

export function rangeBarScale({ low, high, value, severityThreshold = null }: RangeBarScaleInput): RangeBarScale {
  const rawWidth = high - low;
  // A range with no width is not a range, and `deriveStatus` refuses one long
  // before it reaches a bar — but this is arithmetic that divides, so it says
  // what it does rather than producing Infinity.
  const width = rawWidth > 0 ? rawWidth : Math.max(Math.abs(high), 1);
  const threshold = severityThresholdFor(low, high, severityThreshold);

  // THE RESTING SCALE: what is drawn when everything is inside the range. Wide
  // enough to show a real shoulder either side — otherwise the bar is a green
  // block with nowhere for the transition to happen — and capped, because a
  // marker whose severity threshold dwarfs its range (ferritin's is 270 against
  // a 180-wide band) would otherwise squeeze the reference range into a fifth
  // of the bar, which inverts what the bar is for.
  const pad = Math.min(Math.max(width * 0.4, threshold * 0.6), width * 0.9);

  let lo = low - pad;
  let hi = high + pad;

  // RULE 1. The value goes in, with headroom, and it is solved rather than
  // nudged: the margin is a share of the FINAL span, and adding a fixed slice
  // to an end changes the span it was a share of.
  const finite = Number.isFinite(value);
  if (finite && value < lo + (hi - lo) * HEADROOM) {
    lo = (value - HEADROOM * hi) / (1 - HEADROOM);
  }
  if (finite && value > hi - (hi - lo) * HEADROOM) {
    hi = (value - HEADROOM * lo) / (1 - HEADROOM);
  }

  // Same rule as the trend chart: no scale below zero for a quantity that
  // cannot be negative. Applied before the rounding so the printed end is 0
  // rather than a step below it.
  const nonNegative = Math.min(low, finite ? value : low) >= 0;
  if (nonNegative) lo = Math.max(0, lo);

  // Round OUTWARD to a number somebody would have chosen. Outward only, so the
  // rounding can add headroom and can never take any away.
  const step = niceStep(hi - lo);
  const decimals = decimalsFor(step);
  let min = Number((Math.floor(lo / step) * step).toFixed(decimals));
  let max = Number((Math.ceil(hi / step) * step).toFixed(decimals));
  if (!(max > min)) {
    min = lo;
    max = hi > lo ? hi : lo + 1;
  }
  if (nonNegative) min = Math.max(0, min);

  const span = max - min || 1;
  const referenceFraction = Math.max(0, Math.min(high, max) - Math.max(low, min)) / span;

  return {
    min,
    max,
    pct: (v: number) => ((v - min) / span) * 100,
    referenceFraction,
    outOfScale: !finite || referenceFraction < MIN_REFERENCE_FRACTION,
  };
}
