import { hueTint, statusTint, type StatusKey } from './tokens.js';
import { asMarkerStatus, NO_STATUS_LABEL, type MarkerStatusInput } from './resultPresence.js';
import type { MarkerStatus } from './types.js';

/**
 * Where the five status regions actually sit on a marker's own scale.
 *
 * This is the single derivation of that geometry, shared by the trend chart,
 * the sparkline, the range bar and the comparison chart — four things that
 * were each drawing "the reference range" their own way and would otherwise
 * disagree with one another about where "significantly high" starts.
 *
 * It is derived from THAT result's reference range and THAT marker's severity
 * threshold, never from a fixed scale. The threshold is the same number
 * apps/server/src/lib/markerStatus.ts uses to decide the status in the first
 * place — `severityAbsoluteDelta` where the marker sets one, otherwise a
 * multiple of the range's own width — so the band a value lands in is always
 * the band its status says it is in.
 */

/** The system default when a marker doesn't override it. Mirrors Marker.severityMultiplier's schema default. */
export const DEFAULT_SEVERITY_MULTIPLIER = 1.5;

// ---------------------------------------------------------------------------
// IS THIS THE SAME REFERENCE RANGE, OR A DIFFERENT ONE?
//
// A trend chart draws a step, a dashed rule and a sentence wherever a marker's
// reference range changes between two results, because a silent change of range
// is exactly what makes a trend misleading. Which means the question "did it
// change" has to have ONE answer, and that answer has to be the same one the
// printed sentence gives — a step drawn over two ranges that print identically
// is a fault report, not a fact.
//
// It cannot be `low === low && high === high` on the raw numbers, because the
// numbers reaching the chart have been through a unit conversion. Measured, on
// a fasting glucose whose two results were reported as 3.9–5.5 mmol/L and
// 70–99 mg/dL — the same interval, written twice:
//
//     70 / 18.0182 = 3.884960761896305
//     99 / 18.0182 = 5.494444506110488
//
// Float-equal says those are two ranges. So the chart stepped, drew a dashed
// rule, named the change in the key, and printed the sentence "3.9–5.5 mmol/L
// up to 1 January 2026, then 3.884960761896305–5.494444506110488 mmol/L from
// 1 March 2026" — with 5.494444506110488 also set as an inline axis label
// beside the plot. The range had not changed at all.
//
// So identity is decided at the precision a reference range is READ at, and the
// same rounding is what gets printed. The two can then never disagree: a step
// exists if and only if the two ranges print differently.
// ---------------------------------------------------------------------------

/**
 * How many decimals a reference bound of this magnitude is written to.
 *
 * A ladder rather than significant figures, and deliberately coarse — three
 * significant figures keeps 5.494 apart from 5.500 and reintroduces the whole
 * problem above. It is per BOUND rather than per range, so a marker with a
 * decimal floor and a whole-number ceiling (TSH 0.27–4.2) keeps the precision
 * its floor needs: taking the precision from the high bound alone would round
 * 0.27 and 0.34 to the same 0.3 and hide a change that is real.
 */
export function referenceBoundDecimals(value: number): number {
  const magnitude = Math.abs(value);
  if (!Number.isFinite(magnitude) || magnitude === 0) return 0;
  if (magnitude < 0.2) return 3;
  if (magnitude < 2) return 2;
  if (magnitude < 20) return 1;
  return 0;
}

/** A reference bound at the precision it is read at. */
export function roundReferenceBound(value: number): number {
  if (!Number.isFinite(value)) return value;
  return Number(value.toFixed(referenceBoundDecimals(value)));
}

/**
 * A reference bound as text. Trailing zeros are dropped — a range printed
 * "0.00–3.00" is the rounding showing through, and the product writes that
 * range as 0–3.
 */
export function formatReferenceBound(value: number): string {
  if (!Number.isFinite(value)) return '';
  return String(roundReferenceBound(value));
}

/**
 * A range, set the way every reference range in the product and the PDF is set:
 * an en dash between the bounds, the unit after, and no space around the dash.
 */
export function formatReferenceRange(low: number, high: number, unit?: string | null): string {
  const range = `${formatReferenceBound(low)}–${formatReferenceBound(high)}`;
  return unit ? `${range} ${unit}` : range;
}

/**
 * Whether two results were measured against the same reference range — i.e.
 * whether a chart should draw a step between them.
 *
 * True exactly when the two ranges print the same, which is what keeps the
 * drawn step and the written sentence from ever disagreeing.
 */
export function sameReferenceRange(
  a: { low: number; high: number },
  b: { low: number; high: number },
): boolean {
  return (
    roundReferenceBound(a.low) === roundReferenceBound(b.low) &&
    roundReferenceBound(a.high) === roundReferenceBound(b.high)
  );
}

// ---------------------------------------------------------------------------
// PERIODS — CONSECUTIVE RESULTS SHARING A REFERENCE RANGE ARE ONE THING
// ---------------------------------------------------------------------------
//
// The trend chart draws its bands PER PERIOD, not per point: a series measured
// against one range is ONE band set spanning the whole plot, and a genuine
// change of range is a step midway between the two samples it happened between.
// Everything else the change produces — the dashed rule, both periods' bound
// labels, the sentence in the key — is derived from the same list, so the four
// cannot disagree about whether or where a range moved.
//
// IT LIVES HERE, AND OUTSIDE THE COMPONENT, SO IT CAN BE TESTED FROM FIXTURES
// (Aug 2026). It used to be twenty lines inside TrendChart, which meant the only
// coverage of a stepped chart was e2e/chart-bands.spec.ts measuring rectangles
// in a browser against WHATEVER THE DEMO SEED HAPPENED TO CONTAIN. The demo now
// deliberately contains no step at all — one reference range per marker, for the
// whole of a patient's history — so that coverage would have gone silent while
// the code it was covering stayed in the product for the day a laboratory really
// does move a range. Fixtures do not go quiet.
//
// The x axis here is a NUMBER and is deliberately unnamed as time: the caller
// passes epoch milliseconds today, and nothing in the derivation cares.

/** What a period needs from a plotted point. Anything else on the row travels with it. */
export interface PeriodPoint {
  /** Position on the x axis. Epoch milliseconds, in every caller today. */
  t: number;
  referenceLow: number;
  referenceHigh: number;
  /** The marker's own severity threshold, where the server sent one. */
  severityThreshold?: number;
}

export interface ReferenceRangePeriod<P extends PeriodPoint> {
  /** The rows measured against this range, in the order they were given. */
  rows: P[];
  low: number;
  high: number;
  /** One number for the whole period, from the period's own bounds. */
  threshold: number;
}

/**
 * Consecutive rows grouped by the range they were measured against.
 *
 * `sameReferenceRange` decides identity, NOT a float compare — the bounds
 * arriving here have been through a unit conversion, and 99/18.0182 is not
 * float-equal to 5.5. A period therefore exists exactly where the two printed
 * ranges differ, which is what stops the drawn step and the written sentence
 * ever disagreeing.
 *
 * ROWS MUST ALREADY BE SORTED. The caller sorts (the chart reads its series as a
 * sequence in time for the line as well), and grouping is by ADJACENCY: a range
 * that goes away and comes back is two periods, because that is what happened.
 */
export function referenceRangePeriods<P extends PeriodPoint>(rows: P[]): ReferenceRangePeriod<P>[] {
  const periods: ReferenceRangePeriod<P>[] = [];
  for (const point of rows) {
    const open = periods[periods.length - 1];
    if (open && sameReferenceRange(open, { low: point.referenceLow, high: point.referenceHigh })) {
      open.rows.push(point);
    } else {
      periods.push({
        rows: [point],
        low: point.referenceLow,
        high: point.referenceHigh,
        threshold: severityThresholdFor(point.referenceLow, point.referenceHigh, point.severityThreshold),
      });
    }
  }
  return periods;
}

/**
 * One x per change of range, MIDWAY between the two samples it happened between.
 *
 * We know the range changed between those two draws and not when, so the
 * midpoint is the only honest x for it — and it is also what guarantees every
 * period is at least half a sampling gap wide, which is what makes a sliver
 * impossible even when the change lands on the final result. Anchoring the step
 * ON the new point is what once drew the newest range as a 24px strip in the
 * plot's padding gutter.
 *
 * n periods give n−1 boundaries; one period gives none, which is what "no step"
 * is.
 */
export function periodStepBoundaries<P extends PeriodPoint>(periods: ReferenceRangePeriod<P>[]): number[] {
  return periods
    .slice(1)
    .map((next, i) => (periods[i].rows[periods[i].rows.length - 1].t + next.rows[0].t) / 2);
}

export interface StatusBandRange {
  /** Null means "open" — this band runs to the edge of whatever domain it's drawn in. */
  from: number | null;
  to: number | null;
  status: MarkerStatus;
}

/**
 * The threshold beyond which out-of-range becomes significantly out, in the
 * result's own units.
 *
 * `severityThreshold` is what the server sends when it knows the marker's
 * setting. Absent (an older payload, or a shape that never carried it), the
 * schema default is applied to the range width — which is what the server
 * itself would have computed for any marker that hasn't overridden it.
 */
export function severityThresholdFor(low: number, high: number, severityThreshold?: number | null): number {
  if (typeof severityThreshold === 'number' && Number.isFinite(severityThreshold) && severityThreshold > 0) {
    return severityThreshold;
  }
  const width = high - low;
  const usable = width > 0 ? width : Math.max(Math.abs(high), 1);
  return usable * DEFAULT_SEVERITY_MULTIPLIER;
}

/**
 * The five regions, low to high. The two outer ones are open-ended on purpose:
 * "significantly above" has no ceiling, and a chart that drew one would be
 * asserting a bound the lab never gave.
 */
export function statusBands(low: number, high: number, severityThreshold?: number | null): StatusBandRange[] {
  const t = severityThresholdFor(low, high, severityThreshold);
  return [
    { from: null, to: low - t, status: 'SIGNIFICANT_LOW' },
    { from: low - t, to: low, status: 'LOW' },
    { from: low, to: high, status: 'IN_RANGE' },
    { from: high, to: high + t, status: 'HIGH' },
    { from: high + t, to: null, status: 'SIGNIFICANT_HIGH' },
  ];
}

const TINT_KEY: Record<MarkerStatus, StatusKey> = {
  IN_RANGE: 'inRange',
  HIGH: 'high',
  LOW: 'low',
  SIGNIFICANT_HIGH: 'significantHigh',
  SIGNIFICANT_LOW: 'significantLow',
};

/**
 * What absence looks like: the neutral surface and border tones, and not one of
 * the three hues.
 *
 * A result nobody could place against a range has no traffic light, so it is
 * given none — this is the ordinary card, the ordinary track and the ordinary
 * taupe rule, exactly what the page looks like with the status layer removed.
 * It exists so that every lookup below can be TOTAL: absence has an answer, so
 * no caller has to remember to check first, and none of them can throw.
 */
export const NO_STATUS_PAINT = {
  surface: 'rgb(var(--c-cream-50))',
  bar: 'rgb(var(--c-cream-300))',
  band: 'rgb(var(--c-cream-200))',
  fill: 'rgb(var(--c-taupe-300))',
  edge: 'rgb(var(--c-taupe-600))',
  mark: 'rgb(var(--c-taupe-700))',
} as const;

/**
 * The band fill / boundary line / point fill for a status, as theme-aware CSS
 * variables.
 *
 * Total by construction. `statusTint[TINT_KEY[status]]` returned `undefined`
 * for anything outside the five and threw on the next property access — in a
 * chart, a sparkline or a range bar, none of which had any way to know that the
 * status they were handed had never been checked.
 */
export function statusPaint(status: MarkerStatusInput): typeof statusTint[StatusKey] | typeof NO_STATUS_PAINT {
  const known = asMarkerStatus(status);
  return known ? statusTint[TINT_KEY[known]] : NO_STATUS_PAINT;
}

/**
 * The two-stop ramp the NORMALISED COMPARISON chart draws (MultiTrendChart),
 * which plots several markers on one 0–1 scale and predates the boundary-
 * centred ramp below. It takes the pre-mixed `band` role and is unaffected by
 * the opaque-fill change; `bandRampStops` is what the trend chart and the range
 * bars share.
 *
 * A band's fill, as a gradient where the band is a transition and a flat
 * colour where it isn't.
 *
 * The two out-of-range bands shade from their own yellow at the reference
 * bound out to ORANGE at the significantly-out threshold, and the two
 * significantly-out bands carry on from orange into red. That is the whole of
 * orange's job in the system: it is the transition between yellow and red, and
 * never a state a result can be in.
 *
 * `stops` run low-to-high in value space, which is TOP TO BOTTOM in a chart's
 * y-axis and LEFT TO RIGHT in a range bar — the caller orients them.
 */
export function bandGradientStops(status: MarkerStatusInput): [string, string] {
  switch (asMarkerStatus(status)) {
    case 'SIGNIFICANT_LOW':
      return [hueTint.red.band, hueTint.orange.band];
    case 'LOW':
      return [hueTint.orange.band, hueTint.yellow.band];
    case 'IN_RANGE':
      return [hueTint.green.band, hueTint.green.band];
    case 'HIGH':
      return [hueTint.yellow.band, hueTint.orange.band];
    case 'SIGNIFICANT_HIGH':
      return [hueTint.orange.band, hueTint.red.band];
    default:
      // Flat neutral. A switch with no default returned `undefined` here, which
      // is not a colour: the browser dropped the gradient stop and the band
      // rendered black or inherited — the silent half of the same failure.
      return [NO_STATUS_PAINT.band, NO_STATUS_PAINT.band];
  }
}

/**
 * ---------------------------------------------------------------------------
 * HOW HEAVILY EACH BAND IS DRAWN — AND IT IS A COLOUR, NOT AN ALPHA (Aug 2026)
 * ---------------------------------------------------------------------------
 *
 * The ladder is unchanged and is still the thing the chart is built on. A band
 * is CONTEXT: it says where the laboratory's range sits so the reader can place
 * their own result against it, and the result is the content. So the reader
 * meets the line first and the bands second, and the bands themselves are
 * unequal:
 *
 *  · IN RANGE carries the least. It is the ordinary case, it is the largest
 *    region on most charts, and a green field heavy enough to notice is a green
 *    field the eye keeps returning to for no information.
 *  · ABOVE / BELOW carry more, because something is being said.
 *  · SIGNIFICANTLY OUT carries the most — and still not much, because the
 *    reader is already being told this three other ways.
 *
 * WHAT CHANGED IS WHAT THE NUMBER IS. It was `BAND_WEIGHT`, an ALPHA applied to
 * a hue, and every previous round of "the bands look muted" was spent
 * re-solving that hue. That could never work, and the reason is one sentence:
 * **the chroma of a composited band is very nearly `weight × chroma(hue)`**, so
 * a band drawn at 15% of a colour carries at most 15% of a colour whatever
 * colour it is. Three re-solves of PLOT_LIFT are in the history, each hitting
 * the same ceiling, because the ceiling was the alpha.
 *
 * So a band is PAINTED now. No alpha in the rect, none in the gradient stops,
 * nothing behind a band showing through it — and the ladder moved into the
 * colour, as the CONTRAST each rung's fill is solved to stand off the surface
 * it is drawn on. Same ordering, same reasoning, expressed in the one dimension
 * that is not capped. The fills themselves are `BAND_FILL` in tokens.ts, at
 * each hue's own saturation so that "stronger" can never turn into "a signal
 * green and a web red".
 *
 * THE MEASURE IS THE GEOMETRIC MEAN of the contrast off the CARD (where a range
 * bar sits) and off the PLOT PANEL (where a chart band sits), because one fill
 * is drawn on both and the two surfaces are not the same distance apart in the
 * two themes. See the note on BAND_FILL for the measurement.
 *
 * BAND_CONTRAST, LINE_LIFT AND MARK_SHIFT ARE ONE DECISION. A heavier band is
 * closer to the trend line crossing it and to the point mark standing on it;
 * change a rung here and both are solved again — the line by getting brighter,
 * never the bands by getting duller.
 */
export const BAND_CONTRAST: Record<MarkerStatus, number> = {
  IN_RANGE: 1.5,
  LOW: 1.88,
  HIGH: 1.88,
  SIGNIFICANT_LOW: 2.3,
  SIGNIFICANT_HIGH: 2.3,
};

/**
 * WHAT EACH BAND IS ACTUALLY SOLVED TO, PER THEME — and it is not always the
 * rung above (Aug 2026).
 *
 * `BAND_CONTRAST` is the ladder the design asks for. `BAND_RUNG` is where the
 * fills land, and there is exactly ONE difference between them: **dark's
 * out-of-range band**, at 4.45 instead of 1.88.
 *
 * It is here rather than as a relaxed assertion in a test because it is a
 * decision, and a decision belongs in the source. The decision is that the
 * out-of-range band has to READ AS YELLOW — it is the colour a patient sees for
 * every result outside their range — and against a near-black plot the 1.88
 * rung fixes its luminance so low that no yellow exists there. It came out
 * #604a0b: a dark ochre. The full measurement, and the four things that had to
 * move with it, are on `BAND_FILL` in tokens.ts.
 *
 * THE CONSEQUENCE, STATED PLAINLY: in dark, the out-of-range band is the
 * LOUDEST band on the plot. Red cannot be lifted past it — every band's
 * luminance is capped by the trend line that has to clear it at AA-large, and
 * at that cap red runs out of room before yellow does. So the escalation from
 * "outside the range" to "significantly outside it" is carried in dark by
 * CHROMA, which is monotonic across all five where the contrast ladder is not
 * (0.097 → 0.104 → 0.129 → 0.131 → 0.158), and by the hue itself. A traffic
 * light is the same arrangement: its amber is brighter than its red.
 *
 * IN RANGE IS STILL THE QUIETEST BAND IN BOTH THEMES, which is the rung that
 * was always load-bearing — it is the one covering most of a plot, and the one
 * the "bands are context, the line is content" rule is really about.
 */
export const BAND_RUNG: Record<'light' | 'dark', Record<'green' | 'yellow' | 'red', number>> = {
  light: { green: BAND_CONTRAST.IN_RANGE, yellow: BAND_CONTRAST.HIGH, red: BAND_CONTRAST.SIGNIFICANT_HIGH },
  dark: { green: BAND_CONTRAST.IN_RANGE, yellow: 4.45, red: BAND_CONTRAST.SIGNIFICANT_HIGH },
};

/**
 * THE RUNG AT EACH OF THE TWO BOUNDARIES — the midpoint of the two bands it
 * joins, DERIVED rather than written down.
 *
 * A boundary is drawn as a blend centred on itself, so the hinge colour there
 * has to sit halfway up the ladder between the two bands either side of it.
 * Written as a literal, one edit to `BAND_CONTRAST` would put a visible step in
 * the middle of what is meant to be a continuous ramp and nothing would fail.
 *
 * These are what `BAND_FILL`'s olive and orange are solved to, and they are
 * exported so tokenContrast.test.ts measures each hinge at the rung it is
 * actually drawn at rather than at its heavier neighbour's.
 */
export const CONTRAST_AT_BOUND = (BAND_CONTRAST.IN_RANGE + BAND_CONTRAST.HIGH) / 2;
export const CONTRAST_AT_THRESHOLD = (BAND_CONTRAST.HIGH + BAND_CONTRAST.SIGNIFICANT_HIGH) / 2;

/**
 * HOW WIDE A TRANSITION IS, as a share of the DRAWN EXTENT — the plot's y
 * domain on a chart, the scale's full span on a range bar.
 *
 * Of the extent and never of the reference range, which is the whole reason it
 * is a share of anything: a marker with a 3.9–5.1 range and one with a 30–400
 * range would otherwise get transitions two orders of magnitude apart in
 * appearance, and the reader has no way to know that the softness of an edge is
 * telling them about the width of a band rather than about their own result.
 * On the plot this is the same handful of pixels every time.
 *
 * 0.11 of the extent, i.e. ±5.5% either side of the boundary. Enough to be
 * unmistakably a blend at the shortest height this chart is drawn at (~200px,
 * so ~22px) and far short of the width of the narrowest band it has to sit
 * inside.
 */
export const TRANSITION_SHARE = 0.11;

/** One stop in a band's fill, placed by the VALUE it belongs at. */
export interface BandRampStop {
  /** Where this stop sits, in the result's own units. The caller maps it onto whatever it is drawing. */
  value: number;
  /**
   * The opaque fill for this point on the ramp.
   *
   * There is no `weight` beside it and that absence is the design: a band is a
   * solid fill, the ladder is IN this colour (see BAND_CONTRAST), and a stop
   * that carried an alpha as well would be two answers to one question. A
   * caller that needs a number here is a caller about to reintroduce the
   * translucency this removed.
   */
  colour: string;
}

/** What a ramp needs to know about the marker, in the result's own units. */
export interface BandRampGeometry {
  low: number;
  high: number;
  /** Where significantly-out begins, as a distance from the bound — `severityThresholdFor`. */
  threshold: number;
  /**
   * HALF the transition zone, in the result's own units: the caller multiplies
   * its own drawn extent by `TRANSITION_SHARE / 2`. It is the caller's because
   * only the caller knows what it is drawing on — a chart's y domain, a range
   * bar's full scale — and the whole point is that the zone is a share of that
   * rather than of the reference range.
   */
  halfWidth: number;
}

/**
 * ---------------------------------------------------------------------------
 * THE GRADIENT BELONGS AT THE BOUNDARY, NOT ACROSS THE BAND (Aug 2026).
 * ---------------------------------------------------------------------------
 *
 * What this replaces: green flat to a hard edge at the reference bound, then
 * one long yellow-to-orange smear running the whole width of the out-of-range
 * band, then orange-to-red across the whole significantly-out band. Two things
 * were wrong with that and they are the same thing.
 *
 *  · A HARD EDGE AT THE BOUND SAYS THE BOUND IS A CLIFF. A value one unit
 *    inside a reference range and a value one unit outside it are not
 *    clinically different, and drawing them in two flatly different colours
 *    tells a patient they are. The transition is where the meaning actually
 *    changes, so that is where the colour should change.
 *  · A RAMP ACROSS A WHOLE BAND SAYS THE MIDDLE OF THE BAND IS A TRANSITION.
 *    It is not; it is "above the range", the whole way across. The reader saw
 *    a continuously shifting colour over a region whose meaning is constant,
 *    and a step change over the one place its meaning does change.
 *
 * So each of the four boundaries is drawn as a blend CENTRED ON ITSELF:
 *
 *      …flat green… ▒▒▒ olive ▒▒▒ …flat gold… ▒▒▒ orange ▒▒▒ …flat red…
 *                     ↑                          ↑
 *              reference bound           severity threshold
 *
 * with the boundary at the MIDPOINT of the blend, so a result sitting exactly
 * on the limit is drawn exactly half in each colour — and the hairline that
 * marks the bound runs through the middle of the gradient rather than along its
 * edge. Away from a boundary every band is flat: green across most of the
 * range, gold between the two transitions, red beyond.
 *
 * OLIVE AND ORANGE ARE THE TWO HINGES and neither is ever a state. Orange has
 * always been described that way; olive exists because the same job now has to
 * be done at the reference bound, and it is the exact RGB midpoint of green and
 * yellow for the same reason the blend is centred: half of each.
 *
 * THE LADDER IS UNBROKEN AND CONTINUOUS, and it is carried by the five fills:
 * green, olive, gold, orange, red, each solved a rung further from the surface
 * than the last (`BAND_CONTRAST`, with the two hinges at the derived midpoints
 * `CONTRAST_AT_BOUND` / `CONTRAST_AT_THRESHOLD`). Both adjacent bands name the
 * same stop, at the same value, in the same colour — so the fill is continuous
 * across a boundary even though it is drawn as two separate shapes, and
 * "further out is more strongly marked" holds at every point rather than at
 * three sampled ones.
 *
 * ONE SET OF STOPS FOR BOTH INSTRUMENTS (Aug 2026). There used to be a `role`
 * parameter — `plot` for the chart, where the colours were composited at a
 * weight, and `track` for a range bar, where they were painted. Two palettes
 * for one vocabulary, which is why a chart band and the bar directly below it
 * on the same card were different greens. Bands are painted everywhere now, so
 * there is one answer and the parameter is gone.
 *
 * STOPS RUN LOW VALUE TO HIGH, which is bottom-to-top on a chart's y-axis and
 * left-to-right along a range bar. The caller orients them.
 */
export function bandRampStops(
  status: MarkerStatusInput,
  { low, high, threshold, halfWidth }: BandRampGeometry,
): BandRampStop[] {
  const [g, v, y, o, r] = (['green', 'olive', 'yellow', 'orange', 'red'] as const).map((hue) => hueTint[hue].fill);

  /**
   * The flat part of a band, inset from both its ends by the half-transition —
   * and never crossing its own midpoint, so a band narrower than one transition
   * degenerates into a single stop at its centre rather than into two stops in
   * the wrong order.
   */
  const flat = (from: number, to: number): [number, number] => {
    const middle = (from + to) / 2;
    return [Math.min(from + halfWidth, middle), Math.max(to - halfWidth, middle)];
  };

  switch (asMarkerStatus(status)) {
    case 'IN_RANGE': {
      const [a, b] = flat(low, high);
      return [
        { value: low, colour: v },
        { value: a, colour: g },
        { value: b, colour: g },
        { value: high, colour: v },
      ];
    }
    case 'HIGH': {
      const [a, b] = flat(high, high + threshold);
      return [
        { value: high, colour: v },
        { value: a, colour: y },
        { value: b, colour: y },
        { value: high + threshold, colour: o },
      ];
    }
    case 'LOW': {
      const [a, b] = flat(low - threshold, low);
      return [
        { value: low - threshold, colour: o },
        { value: a, colour: y },
        { value: b, colour: y },
        { value: low, colour: v },
      ];
    }
    // The two outer bands are open-ended, so they carry only the half of the
    // transition that exists — flat red runs on from there to wherever the
    // caller's own extent ends, which is what a gradient's last stop already
    // does.
    case 'SIGNIFICANT_HIGH':
      return [
        { value: high + threshold, colour: o },
        { value: high + threshold + halfWidth, colour: r },
      ];
    case 'SIGNIFICANT_LOW':
      return [
        { value: low - threshold - halfWidth, colour: r },
        { value: low - threshold, colour: o },
      ];
    default:
      // Flat neutral, spanning the reference range so the two stops are still
      // in order and still real numbers. Total by construction, for the same
      // reason every other lookup in this file is: an `undefined` reaching an
      // SVG stop is not a colour, and the browser drops it silently.
      return [
        { value: low, colour: NO_STATUS_PAINT.fill },
        { value: high, colour: NO_STATUS_PAINT.fill },
      ];
  }
}

/**
 * HOW THE OPTIMAL PORTION OF THE REFERENCE RANGE IS DEEPENED — and it is a
 * COLOUR now, `OPTIMAL_FILL` in tokens.ts.
 *
 * `OPTIMAL_DEEPEN` was 0.09 of alpha, composited on top of the in-range band,
 * and the range bar reached for a different green at a different alpha to say
 * the same thing. With the bands opaque there is nothing to composite onto: the
 * narrowing is the same green solved one rung further along the ladder, drawn
 * solid, identical on the chart and on both bars.
 *
 * Small on purpose, and unchanged in that: 1.14:1 off the band it sits inside,
 * which is visible as a shading-in and nothing like the step a boundary makes —
 * that is what the hairlines are for.
 */

/**
 * What a band is, in words. Present on every band in every chart key, because
 * a coloured region with no label is exactly the "colour alone" failure the
 * rest of this system spends its effort avoiding.
 *
 * Descriptive, never evaluative: where the lab's range sits, and nothing about
 * whether being there is good.
 */
export const BAND_LABEL: Record<MarkerStatus, string> = {
  SIGNIFICANT_LOW: 'Significantly below the reference range',
  LOW: 'Below the reference range',
  IN_RANGE: 'Within the reference range',
  HIGH: 'Above the reference range',
  SIGNIFICANT_HIGH: 'Significantly above the reference range',
};

/**
 * The same, as a total lookup. A key with no entry gave `undefined`, which
 * renders as an empty list item — a coloured band in the key with no words
 * beside it, which is the one thing the key exists to prevent.
 */
export function bandLabel(status: MarkerStatusInput): string {
  const known = asMarkerStatus(status);
  return known ? BAND_LABEL[known] : NO_STATUS_LABEL;
}
