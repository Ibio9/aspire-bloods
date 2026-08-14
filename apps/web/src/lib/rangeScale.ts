import { isOpenUpperBound, severityThresholdFor } from '@aspire-bloods/shared';

/**
 * =============================================================================
 *  THE SCALE A RANGE BAR IS DRAWN ON — AND IT IS NOT THE REFERENCE RANGE.
 * =============================================================================
 *
 * A range bar answers one question: WHERE DOES THIS RESULT SIT. Everything in
 * here exists because it was answering it wrongly, in three ways, on real
 * patient data:
 *
 *   · A value of 122 against a reference range of 0–41 drew a bar labelled
 *     "0" and "41" with the mark hard against the right-hand end. Read
 *     literally — and it is read literally — that says "just at the top of the
 *     range". The result is three times the upper limit.
 *   · A value of 65 against 125–375 drew a bar labelled "125" and "375" with
 *     the mark INSIDE it, near the left. The value is below the entire printed
 *     scale and was drawn as though it were within it.
 *   · A value of 3.4 against 3.8–5.8 drew the CARD bar — which printed no
 *     figures of its own at all, so the only numbers anywhere near it were the
 *     card's own "Lab reference range 3.8–5.8" two lines below. A bar with no
 *     axis does not read as a bar with no axis; it reads as a bar whose axis is
 *     whatever numbers are nearest to it. See MiniRangeBar.
 *
 * The bug was never the geometry: the domain already stretched to hold the
 * value. It was that THE NUMBERS UNDER THE ENDS OF THE BAR WERE THE REFERENCE
 * BOUNDS rather than the scale that had actually been drawn — or, on the card,
 * that there were no numbers under the ends and the nearest ones stood in. So
 * the reader was given a correct picture with a false axis on it, which is
 * worse than either on its own: a bar that is obviously wrong gets ignored, and
 * a bar that is quietly wrong gets believed.
 *
 * So this module has one job and every caller shares it: given a result and its
 * range, produce THE SCALE THAT IS DRAWN, and let the labels come from that.
 * The labels come from HERE and not from the components (`minLabel`/`maxLabel`),
 * so a bar cannot print a number that describes a scale other than its own —
 * that is structural now rather than a rule two components have to remember.
 *
 * Four rules, and they are the ones the bar can't be right without:
 *
 *  1. THE SCALE ALWAYS CONTAINS THE VALUE, with headroom. Never clamped to an
 *     end — a mark pinned to the edge of a bar is a mark that has stopped
 *     carrying information, and it is indistinguishable from a mark that
 *     legitimately sits at the edge.
 *  2. THE SCALE ALWAYS CONTAINS THE REFERENCE RANGE, so a reader can see both
 *     where the range is and how far past it they are, in one picture.
 *  3. THE PRINTED ENDS ARE THE SCALE, exactly — `Number(minLabel) === min`.
 *  4. WHEN NONE OF THAT CAN BE DRAWN HONESTLY, NOTHING IS DRAWN. A reference
 *     range rendered as a two-pixel sliver at one end is a bar that says "your
 *     range is somewhere over there", which is not a scale; and a result with
 *     no range, no width to its range or no numeric value has no position to
 *     draw at all. The caller says it in words instead — see `undrawable`,
 *     which names WHICH of those happened so the sentence can be true. It used
 *     to be one boolean and one sentence about being far outside the range,
 *     which was simply false for the other three.
 *
 * `min` and `max` are ALWAYS finite and `max` is ALWAYS greater than `min`,
 * including in every refusal case, so no arithmetic downstream of this can put
 * a NaN into a style attribute.
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
 *
 * It holds at the top end without exception. At the BOTTOM it yields to the
 * zero floor below, and only there: a quantity that cannot be negative has a
 * hard floor at zero, a value sitting on that floor is genuinely at the end of
 * its own scale, and inventing a negative end to hold a mark off the edge would
 * print a number no laboratory could report.
 */
export const MARK_HEADROOM = 0.06;

/** Why a bar cannot be drawn. Each has its own sentence — see RANGE_BAR_UNAVAILABLE. */
export type RangeBarUndrawable =
  | 'no-reference-range'
  | 'range-has-no-width'
  | 'value-not-numeric'
  | 'reference-range-too-small'
  | 'reference-range-open-ended';

/**
 * What is said INSTEAD of drawing, per reason.
 *
 * Here rather than in the components because there are two bars and adding a
 * reason without adding its sentence should be a type error, not a bar that
 * says something false about a case nobody thought of. `long` leads the full
 * bar's replacement sentence, which then prints whatever figures exist; `short`
 * is the one line the card has room for.
 */
export const RANGE_BAR_UNAVAILABLE: Record<RangeBarUndrawable, { long: string; short: string }> = {
  'no-reference-range': {
    long: 'This result has no two-sided reference range, so there is no scale to place it on.',
    short: 'No reference range to draw against',
  },
  'range-has-no-width': {
    long: 'This result’s reference range has the same lower and upper bound, so there is no scale to place it on.',
    short: 'No reference range to draw against',
  },
  'value-not-numeric': {
    long: 'This result has no numeric value, so there is nothing to place on a scale.',
    short: 'No numeric value to place on a scale',
  },
  'reference-range-too-small': {
    long: 'This result is too far outside the reference range to draw on a scale that shows both.',
    short: 'Too far outside the range to draw to scale',
  },
  /**
   * ── A RANGE WITH NO TOP CANNOT BE DRAWN AS A BAR, AND WAS BEING (Aug 2026) ──
   *
   * Four markers have no clinical upper bound — eGFR, HDL, the Omega-3 Index,
   * progesterone — and the catalogue writes `OPEN_UPPER_BOUND` (999) for the
   * ceiling because a reference range in this schema is two numbers.
   *
   * Rule 2 above then does exactly what it says: the scale is built to contain
   * the reference range, so a 60–999 range produces a scale of roughly 0 to
   * 2000. MEASURED, on a perfectly healthy eGFR of 97: the mark lands at 5% of
   * the bar, hard against the left-hand end of a green band running to 999. A
   * patient reads that as "only just inside my range". It is an excellent
   * result.
   *
   * That is the same failure this whole module was written to end — a correct
   * picture with a false axis — surviving in the one input nobody had put
   * through it, because 999 is a perfectly ordinary number to the arithmetic.
   *
   * NOTHING IS DRAWN, which is rule 4, and the sentence says the true thing
   * instead. NOT "fixed" by drawing an open-ended bar from the lower bound
   * rightwards: that is the right rendering and it is a design change — a band
   * with no right-hand edge, no upper hairline and no upper label, across two
   * components — rather than a scale correction, and it is on the list.
   */
  'reference-range-open-ended': {
    long: 'This marker has no upper limit — any result at or above the lower bound is within range — so there is no scale with two ends to draw it on.',
    short: 'No upper limit to draw a scale against',
  },
};

interface RangeBarGeometry {
  /** The left-hand end of the drawn scale, in the result's own units. This IS the number printed under it. */
  min: number;
  /** The right-hand end, likewise. */
  max: number;
  /** `min` as it is printed. `Number(minLabel) === min`, exactly — the label cannot describe another scale. */
  minLabel: string;
  /** `max` as it is printed. `Number(maxLabel) === max`, exactly. */
  maxLabel: string;
  /** Where a value falls along the drawn scale, 0–100. Total: the scale contains everything it was built from. */
  pct: (value: number) => number;
  /** What share of the drawn scale the reference range occupies, 0–1. */
  referenceFraction: number;
}

/**
 * A UNION rather than a struct with a boolean, so a component cannot reach the
 * drawing path without having gone past the refusal.
 *
 * The drawable arm carries the three numbers the scale was built from, already
 * narrowed. That is not a convenience: a component that re-reads its own `low`
 * prop to place a bound tick is a component whose bar and whose axis are two
 * derivations of the same fact, which is how they drift.
 */
export type RangeBarScale =
  | (RangeBarGeometry & {
      outOfScale: false;
      undrawable: null;
      low: number;
      high: number;
      value: number;
    })
  | (RangeBarGeometry & {
      /**
       * Nothing may be drawn. The caller must say where the result sits in
       * WORDS rather than drawing it wrongly — `undrawable` says which words.
       */
      outOfScale: true;
      undrawable: RangeBarUndrawable;
    });

export interface RangeBarScaleInput {
  /**
   * Nullable, and every one of these is a case that reaches a bar in practice:
   * a qualitative result with no numeric value, a marker with a one-sided lab
   * range, an older payload with a bound missing. They used to be typed as
   * plain numbers, which did not stop any of them arriving — it only stopped
   * this function from being written to survive them, and `NaN - undefined`
   * propagates all the way to a `left: NaN%`.
   */
  low: number | null | undefined;
  high: number | null | undefined;
  value: number | null | undefined;
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

/**
 * How many decimals a step of this size needs to print exactly, so
 * 2.0000000000000004 never reaches an axis.
 *
 * One more than the step itself needs, which is what absorbs the float noise,
 * and capped at 12 rather than the 6 it used to be: a double carries noise from
 * about the sixteenth significant digit, so 12 still cleans it, and 6 silently
 * collapsed the whole scale of a marker whose range is narrower than 1e-6 — the
 * ends rounded to the same number and the bar fell back to raw arithmetic.
 */
function decimalsFor(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0;
  return Math.max(0, Math.min(12, Math.ceil(-Math.log10(step)) + 1));
}

/**
 * A scale end at the printed precision, rounded OUTWARD.
 *
 * Outward is the whole point: rounding a scale end toward the middle would move
 * it inside the value or the reference range it was built to contain, which is
 * the one thing a scale end may never do. Rounding away can only ever add
 * headroom.
 */
function roundOut(value: number, decimals: number, direction: 'down' | 'up'): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  const scaled = value * factor;
  if (!Number.isFinite(scaled)) return value;
  const stepped = direction === 'down' ? Math.floor(scaled) : Math.ceil(scaled);
  return Number((stepped / factor).toFixed(decimals));
}

/** A refusal, with geometry that is still finite so nothing downstream can divide by it. */
function undrawable(reason: RangeBarUndrawable): RangeBarScale {
  return {
    min: 0,
    max: 1,
    minLabel: '0',
    maxLabel: '1',
    // Inert rather than linear: there is no scale here, and a caller that
    // ignored `outOfScale` should get a harmless number rather than a position
    // on a domain that does not exist.
    pct: () => 0,
    referenceFraction: 0,
    outOfScale: true,
    undrawable: reason,
  };
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function rangeBarScale({ low, high, value, severityThreshold = null }: RangeBarScaleInput): RangeBarScale {
  // Narrowed once, at the boundary. Everything below is arithmetic on three
  // real numbers, which is the only way this stays readable — and null, absent,
  // NaN and Infinity are the same fact here: not a number this can draw with.
  const lowN = finiteOrNull(low);
  const highN = finiteOrNull(high);
  const valueN = finiteOrNull(value);

  // A one-sided range is refused rather than completed. A lab range of
  // "under 5.0" has no lower end to draw from, and inventing one — zero, say —
  // is this product asserting a bound the laboratory did not give.
  if (lowN === null || highN === null) return undrawable('no-reference-range');
  // A range with no width is not a range, and `deriveStatus` refuses one long
  // before it reaches a bar. Refused here too rather than divided by, because
  // the caller has to say which of the two things happened.
  if (!(highN > lowN)) return undrawable('range-has-no-width');
  // An open-topped range, which the catalogue writes as OPEN_UPPER_BOUND. Its
  // own reason and its own sentence — see RANGE_BAR_UNAVAILABLE, which has the
  // measurement. Checked BEFORE the value, so an open-topped marker gives the
  // same answer whether or not the result parsed.
  if (isOpenUpperBound(highN)) return undrawable('reference-range-open-ended');
  if (valueN === null) return undrawable('value-not-numeric');

  const width = highN - lowN;
  const threshold = severityThresholdFor(lowN, highN, severityThreshold);

  // THE RESTING SCALE: what is drawn when everything is inside the range. Wide
  // enough to show a real shoulder either side — otherwise the bar is a green
  // block with nowhere for the transition to happen — and capped, because a
  // marker whose severity threshold dwarfs its range (ferritin's is 270 against
  // a 180-wide band) would otherwise squeeze the reference range into a fifth
  // of the bar, which inverts what the bar is for.
  const pad = Math.min(Math.max(width * 0.4, threshold * 0.6), width * 0.9);

  let lo = lowN - pad;
  let hi = highN + pad;

  // RULE 1. The value goes in, with headroom, and it is solved rather than
  // nudged: the margin is a share of the FINAL span, and adding a fixed slice
  // to an end changes the span it was a share of.
  if (valueN < lo + (hi - lo) * MARK_HEADROOM) {
    lo = (valueN - MARK_HEADROOM * hi) / (1 - MARK_HEADROOM);
  }
  if (valueN > hi - (hi - lo) * MARK_HEADROOM) {
    hi = (valueN - MARK_HEADROOM * lo) / (1 - MARK_HEADROOM);
  }

  // Same rule as the trend chart: no scale below zero for a quantity that
  // cannot be negative. Applied before the rounding so the printed end is 0
  // rather than a step below it. This is the one place the headroom above
  // yields — see MARK_HEADROOM.
  const nonNegative = Math.min(lowN, valueN) >= 0;
  if (nonNegative) lo = Math.max(0, lo);

  // Round OUTWARD to a number somebody would have chosen. Outward only, so the
  // rounding can add headroom and can never take any away.
  const step = niceStep(hi - lo);
  const decimals = decimalsFor(step);
  let min = roundOut(Math.min(Math.floor(lo / step) * step, lo), decimals, 'down');
  let max = roundOut(Math.max(Math.ceil(hi / step) * step, hi), decimals, 'up');
  // Belt and braces against a float rounding that lands the wrong side of its
  // own input. Every downstream guarantee — the range inside the scale, the
  // value inside the scale, the mark off the edge — is stated in terms of
  // `lo`/`hi`, so an end that has drifted inside one of them is corrected back
  // to the raw number rather than left to be almost right.
  if (min > lo) min = lo;
  if (max < hi) max = hi;
  if (nonNegative) min = Math.max(0, min);

  if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) {
    // Reachable only from a value so large the arithmetic overflows, which is
    // the same fact as being too far outside the range to draw with it.
    return undrawable('reference-range-too-small');
  }

  const span = max - min;
  const referenceFraction = Math.max(0, Math.min(highN, max) - Math.max(lowN, min)) / span;
  if (referenceFraction < MIN_REFERENCE_FRACTION) return undrawable('reference-range-too-small');

  return {
    min,
    max,
    low: lowN,
    high: highN,
    value: valueN,
    // THE LABELS ARE THE SCALE. Derived here, from the final numbers, and
    // handed to the component — which has no formatter of its own to disagree
    // with. `String` of a double round-trips exactly through `Number`, so
    // "the printed end labels bound the drawn scale" is not a rule anybody
    // has to keep, it is the same two numbers written down.
    minLabel: String(min),
    maxLabel: String(max),
    pct: (v: number) => ((v - min) / span) * 100,
    referenceFraction,
    outOfScale: false,
    undrawable: null,
  };
}
