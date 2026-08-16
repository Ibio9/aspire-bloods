import { isOpenUpperBound, severityThresholdFor, statusBands, type MarkerStatus } from '@aspire-bloods/shared';

/**
 * =============================================================================
 *  WHERE A RESULT SITS ON THE GAUGE — AND THE RING IS NO LONGER A NUMBER LINE.
 * =============================================================================
 *
 * ── WHAT THIS REPLACED, AND WHY THE OLD ANSWER WAS RIGHT AND STILL WRONG ────
 *
 * Until Aug 2026 this module derived a NUMERIC SCALE: given a result and its
 * range, produce the domain the instrument is drawn on, guarantee it contains
 * both the value and the reference range, round its ends to a ladder somebody
 * would have chosen, and hand back the labels for those ends so the picture and
 * its axis could never disagree. Every one of those guarantees was earned by a
 * real failure — a value of 122 against 0–41 drawn hard against the end of a bar
 * labelled "41", a value of 65 against 125–375 drawn INSIDE it — and the module
 * was correct.
 *
 * It was correct about a bar. Bent round a ring it produced a NEW failure that a
 * straight bar never had, because a ring is read as a shape rather than as an
 * axis: THE GREEN MOVED. A value above its range pushed the scale upward, so the
 * in-range arc slid toward the start of the ring; a value below it slid the
 * green toward the end. Two cards side by side on the same grid, both correct,
 * showed the reference zone in two different places — so the one thing a reader
 * can take in without reading any numbers, the SHAPE, meant something different
 * on every card. On a grid of 165 that is not a scale, it is noise.
 *
 * ── THE RING IS FIXED, SYMMETRIC, AND IDENTICAL ON EVERY GAUGE ─────────────
 *
 * Five slices, in the reading order the arc already had, with equal angular
 * space either side of centre:
 *
 *     0%        15%          34%        66%          85%      100%
 *     ├──red────┼────gold────┼───green───┼────gold────┼───red───┤
 *     significantly    below    IN RANGE    above    significantly
 *        below                                            above
 *
 * Green always central, gold always flanking it, red always at both ends. This
 * never changes with the value, so the colour under the mark always agrees with
 * the status word beside it, and two gauges on one screen are the same picture
 * with the mark in two places.
 *
 * ── WHAT IT COSTS, STATED PLAINLY ──────────────────────────────────────────
 *
 * DISTANCE INSIDE THE OUTER BANDS IS NO LONGER TO SCALE. The two red slices are
 * open-ended in value and finite in angle, so they are compressed: a result at
 * twice its threshold and one at ten times both sit in the right-hand red, the
 * second further round but not five times further. The mark is still ORDERED
 * (more extreme is always further out) and is still NEVER CLAMPED — see
 * `saturate` below, which approaches the end of the arc and never reaches it —
 * but "how far out am I" is answered by the figure in the middle of the gauge
 * and by the status word, not by the geometry.
 *
 * That is the trade, and it is the right way round for this instrument: a
 * patient reading a card wants "is this inside the range" first and "by how
 * much" second, and the first question is now answered by a shape that means
 * the same thing everywhere.
 *
 * ── AND ONE REFUSAL WENT AWAY WITH THE SCALE ───────────────────────────────
 *
 * `reference-range-too-small` is gone. It existed because a value twenty times
 * the width of its own range squeezed the reference band into a sliver of a
 * numeric axis, and a band you cannot see is not a scale. A fixed ring has no
 * such failure mode: the green is 32% of the arc whatever the value does. The
 * other four refusals stand, because each is about the RANGE rather than about
 * the drawing.
 */

/**
 * The four boundaries, as fractions of the arc from its start. Symmetric about
 * 0.5 by construction rather than by three numbers that happen to add up.
 *
 * ⚠ THE OUTER SLICES ARE NARROWER THAN THE INNER ONES ON PURPOSE. Green takes
 * the most because it is the answer most results have and the one a reader has
 * to be able to see a mark sitting comfortably inside. The reds take the least
 * because they are unbounded in value: giving them more angle would spread a
 * compressed axis over more of the ring, which buys nothing and costs the bands
 * that are actually to scale.
 */
const GREEN_SHARE = 0.32;
const GOLD_SHARE = 0.19;
/** Whatever is left, halved. Written as a derivation so the five always sum to 1. */
const RED_SHARE = (1 - GREEN_SHARE - 2 * GOLD_SHARE) / 2;

/** Where green meets gold, and gold meets red, on each side. Fractions of the arc. */
export const GAUGE_BOUNDARIES = {
  /** Gold → red on the low side. The significantly-below threshold. */
  lowThreshold: RED_SHARE,
  /** Gold → green on the low side. The lower reference bound. */
  low: RED_SHARE + GOLD_SHARE,
  /** Green → gold on the high side. The upper reference bound. */
  high: RED_SHARE + GOLD_SHARE + GREEN_SHARE,
  /** Gold → red on the high side. The significantly-above threshold. */
  highThreshold: 1 - RED_SHARE,
} as const;

/** The five slices, low to high, as [from, to] fractions of the arc. */
export const GAUGE_SLICES: Record<MarkerStatus, [number, number]> = {
  SIGNIFICANT_LOW: [0, GAUGE_BOUNDARIES.lowThreshold],
  LOW: [GAUGE_BOUNDARIES.lowThreshold, GAUGE_BOUNDARIES.low],
  IN_RANGE: [GAUGE_BOUNDARIES.low, GAUGE_BOUNDARIES.high],
  HIGH: [GAUGE_BOUNDARIES.high, GAUGE_BOUNDARIES.highThreshold],
  SIGNIFICANT_HIGH: [GAUGE_BOUNDARIES.highThreshold, 1],
};

/** Why a gauge cannot be drawn. Each has its own sentence — see GAUGE_UNAVAILABLE. */
export type RangeBarUndrawable =
  | 'no-reference-range'
  | 'range-has-no-width'
  | 'value-not-numeric'
  | 'reference-range-open-ended';

/**
 * What is said INSTEAD of drawing, per reason.
 *
 * Here rather than in the component because adding a reason without adding its
 * sentence should be a type error, not a gauge that says something false about a
 * case nobody thought of. `long` leads the full gauge's replacement sentence,
 * which then prints whatever figures exist; `short` is the one line a card has
 * room for.
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
  /**
   * ── A RANGE WITH NO TOP HAS NO UPPER HALF TO DRAW ────────────────────────
   *
   * Four markers have no clinical upper bound — eGFR, HDL, the Omega-3 Index,
   * progesterone — and the catalogue writes `OPEN_UPPER_BOUND` (999) for the
   * ceiling because a reference range in this schema is two numbers.
   *
   * The fixed ring does not save this one, and it is worth being clear why the
   * others were saved and this was not. The others were failures of the SCALE:
   * a numeric axis stretched or squeezed by a value, which a fixed geometry
   * simply does not have. This is a failure of the RANGE. A gauge whose right
   * half means "above 999" is drawing a threshold no laboratory set and no
   * clinician would recognise, and a perfectly healthy eGFR of 97 would sit in
   * the left-hand red — which is the same wrong picture as before, arrived at
   * from the other direction.
   *
   * Drawing an OPEN-ENDED gauge instead — green from the lower bound running off
   * the end of the arc, no upper hairline, no upper label — is the right
   * rendering and is a design change rather than a placement correction. It is
   * on the list for Richard (docs/audits/randox-band-mapping.md).
   */
  'reference-range-open-ended': {
    // NO EM DASH. The house style has none in anything a reader sees, and this
    // string is on the Overview beside a real result — `e2e/copy.spec.ts`
    // catches it there.
    long: 'This marker has no upper limit: any result at or above the lower bound is within range, so there is no scale with two ends to draw it on.',
    short: 'No upper limit to draw a scale against',
  },
};

export interface GaugePlacementInput {
  /**
   * Nullable, and every one of these is a case that reaches a gauge in practice:
   * a qualitative result with no numeric value, a marker with a one-sided lab
   * range, an older payload with a bound missing. Typing them as plain numbers
   * never stopped any of them arriving — it only stopped this function from
   * being written to survive them, and `NaN - undefined` propagates all the way
   * to a `rotate(NaN deg)`.
   */
  low: number | null | undefined;
  high: number | null | undefined;
  value: number | null | undefined;
  /** Where significantly-out begins, in the result's own units. */
  severityThreshold?: number | null;
}

export type GaugePlacement =
  | {
      drawable: true;
      /** Where the mark sits, 0–1 along the arc. Never 0 and never 1 — see `saturate`. */
      at: number;
      /** Which slice it landed in. Always the status the value computes to. */
      status: MarkerStatus;
      low: number;
      high: number;
      value: number;
      /** Where significantly-out begins, as a distance from each bound. */
      threshold: number;
    }
  | {
      drawable: false;
      /** The caller says where the result sits in WORDS instead — this says which words. */
      undrawable: RangeBarUndrawable;
    };

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * AN UNBOUNDED BAND INTO A FINITE SLICE, WITHOUT EVER REACHING THE END.
 *
 * `t` is how far past the threshold the value is, in multiples of the threshold
 * itself. `t / (1 + t)` is 0 at the threshold, 0.5 at one threshold beyond it,
 * and approaches 1 without arriving — so the mark is strictly ordered, strictly
 * inside the arc, and NEVER CLAMPED. That last one is the rule this whole module
 * has always been built around: a mark pinned to the end of an instrument has
 * stopped carrying information and is indistinguishable from one that legitimately
 * sits there.
 *
 * The compression is the cost of a fixed geometry and is documented at the top.
 */
function saturate(t: number): number {
  if (!Number.isFinite(t) || t <= 0) return 0;
  return t / (1 + t);
}

/**
 * Which of the five bands a value falls in, from `statusBands` — the ONE
 * derivation of that geometry in this product, shared with the trend chart and
 * with the server's own status computation (`severityThresholdFor` is the same
 * number on both sides).
 *
 * It is asked here rather than the caller's `status` prop being trusted, and
 * that is the whole reason "the colour under the mark agrees with the label" is
 * true by construction: a gauge handed a status that disagreed with its own
 * value would otherwise draw the mark in one band and tint the card in another,
 * which is the exact class of bug the fixed ring was introduced to end.
 *
 * The bands run low to high with open ends, so the containing one is the last
 * whose `from` the value has passed.
 */
function bandContaining(low: number, high: number, threshold: number | null | undefined, value: number): MarkerStatus | null {
  const bands = statusBands(low, high, threshold);
  const found = [...bands].reverse().find((b) => value >= (b.from ?? Number.NEGATIVE_INFINITY));
  return found ? found.status : null;
}

/**
 * Where the mark goes, and it is derived from WHICH BAND the value is in and
 * where inside that band — never from a numeric axis across the whole ring.
 */
export function gaugePlacement({ low, high, value, severityThreshold = null }: GaugePlacementInput): GaugePlacement {
  const lowN = finiteOrNull(low);
  const highN = finiteOrNull(high);
  const valueN = finiteOrNull(value);

  // A one-sided range is refused rather than completed. A lab range of
  // "under 5.0" has no lower end to draw from, and inventing one — zero, say —
  // is this product asserting a bound the laboratory did not give.
  if (lowN === null || highN === null) return { drawable: false, undrawable: 'no-reference-range' };
  // A range with no width is not a range, and `deriveStatus` refuses one long
  // before it reaches a gauge. Refused here too rather than divided by.
  if (!(highN > lowN)) return { drawable: false, undrawable: 'range-has-no-width' };
  // Checked BEFORE the value, so an open-topped marker gives the same answer
  // whether or not the result parsed.
  if (isOpenUpperBound(highN)) return { drawable: false, undrawable: 'reference-range-open-ended' };
  if (valueN === null) return { drawable: false, undrawable: 'value-not-numeric' };

  const threshold = severityThresholdFor(lowN, highN, severityThreshold);
  const status = bandContaining(lowN, highN, severityThreshold, valueN);
  // The bands are exhaustive over the reals once the range has width, so this is
  // unreachable — and it is here rather than as a cast because an unreachable
  // branch that returns a sentence is a rendering, and an unreachable cast that
  // is wrong is `GAUGE_SLICES[null]` and a NaN in a transform.
  if (status === null) return { drawable: false, undrawable: 'value-not-numeric' };

  const [from, to] = GAUGE_SLICES[status];
  const span = to - from;

  /**
   * How far through its own band the value is, 0 at the band's lower edge and 1
   * at its upper. The two OPEN-ENDED bands saturate instead of dividing, which
   * is the only difference between the five.
   */
  const within = (): number => {
    switch (status) {
      case 'IN_RANGE':
        return (valueN - lowN) / (highN - lowN);
      case 'HIGH':
        return (valueN - highN) / threshold;
      case 'LOW':
        // Drawn low-to-high like every other band: the lower edge of the LOW
        // slice is `low - threshold`, so a value just under `low` is at the TOP
        // of it, next to the green.
        return 1 - (lowN - valueN) / threshold;
      case 'SIGNIFICANT_HIGH':
        return saturate((valueN - (highN + threshold)) / threshold);
      case 'SIGNIFICANT_LOW':
        return 1 - saturate((lowN - threshold - valueN) / threshold);
    }
  };

  // Clamped only against float noise at a band's own edges — `within` is already
  // inside [0, 1] for every value the status says belongs to this band, and a
  // value sitting exactly ON a boundary is drawn exactly on it either way.
  const t = Math.min(1, Math.max(0, within()));
  return { drawable: true, at: from + t * span, status, low: lowN, high: highN, value: valueN, threshold };
}
