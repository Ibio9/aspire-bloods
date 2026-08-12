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
  plot: 'rgb(var(--c-taupe-300))',
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
 * HOW HEAVILY EACH BAND IS DRAWN — and they are deliberately not equal.
 *
 * The old chart painted all five at one weight, which is five regions all
 * shouting at once and a line lost behind them. A band is CONTEXT: it says
 * where the laboratory's range sits so the reader can place their own result
 * against it. The result is the content. So the reader should meet the line
 * first and the bands second, which is the order these weights impose:
 *
 *  · IN RANGE carries almost nothing. It is the ordinary case, it is the
 *    largest region on most charts, and a green field heavy enough to notice is
 *    a green field the eye keeps returning to for no information.
 *  · ABOVE / BELOW carry a little more, because something is being said.
 *  · SIGNIFICANTLY OUT carries the most, and still less than the old flat
 *    weight — the reader is already being told this three other ways.
 *
 * Composited, never mixed: these are alphas applied to the `plot` role, which
 * is why one ladder is right in both themes. See PLOT_LIFT in tokens.ts.
 *
 * ── THIS NUMBER IS NOW A PEAK, NOT A FLAT WEIGHT (Aug 2026) ───────────────
 *
 * The bands carry gradients again (`bandPlotGradient` below), so a band's
 * weight varies across its own height and BAND_WEIGHT is the STRONGEST point
 * in it — at the far end of an out-of-range band, furthest from the reference
 * range. Every stop is a share of it. That is also the worst case for
 * everything tokenContrast.test.ts measures at these numbers: the faintest a
 * band ever gets is not what makes it hard to see through, and a point mark
 * standing off its own band has to clear the heaviest part of it.
 *
 * ── AND IT WENT BACK UP, TWICE ────────────────────────────────────────────
 *
 * 0.10 / 0.17 / 0.24 were solved for bands that FADED OUT at their own edges,
 * so the stated weight was a peak and the average was well under it. When the
 * bands went flat those numbers were cut by about a third, to 0.07 / 0.12 /
 * 0.18 — correct arithmetic for keeping the same average, and it quietly
 * undid the dark-mode solve in PLOT_LIFT, which had been done AT the old
 * weights. A band is 76–93% card, so its saturation is very nearly linear in
 * this number. Measured, as the colour that landed on the dark card at 0.07 /
 * 0.12: green hsl(80, 0.24, 0.17) and gold hsl(43, 0.33, 0.18) — the olive and
 * the brown the redesign had already been through once. 0.11 / 0.21 / 0.28
 * with PLOT_LIFT re-solved at those weights fixed the mud.
 *
 * 0.15 / 0.28 / 0.40 (Aug 2026) IS A DIFFERENT KIND OF CHANGE, and the reason
 * is worth writing down because it is the one thing every previous round of
 * this got wrong: **the chroma of a composited band is very nearly
 * `weight × chroma(hue)`.** So "the bands are too muted to read as green,
 * yellow and red" cannot be answered by re-picking the hue — the hues were
 * already at full saturation in dark — and it cannot be answered by moving
 * lightness, which is what the earlier solves spent their effort on. There is
 * one lever and it is this number. Measured chroma off the light card, before
 * → after: green 0.039 → 0.114, gold 0.149 → 0.200, red 0.153 → 0.400.
 *
 * The line stays the content. It is heavier and brighter for exactly this
 * reason — see `chart.line` and `lineWidth` — because the instruction was to
 * raise the bands and brighten the line rather than dull the bands back down.
 */
export const BAND_WEIGHT: Record<MarkerStatus, number> = {
  IN_RANGE: 0.15,
  LOW: 0.28,
  HIGH: 0.28,
  SIGNIFICANT_LOW: 0.4,
  SIGNIFICANT_HIGH: 0.4,
};

/**
 * THE WEIGHT AT EACH OF THE TWO BOUNDARIES — the midpoint of the two bands it
 * joins, DERIVED rather than written down.
 *
 * A boundary is drawn as a blend centred on itself, so the weight there has to
 * be the average of the two weights either side; written as a literal, one edit
 * to `BAND_WEIGHT` would put a visible step in the middle of what is meant to
 * be a continuous ramp and nothing would fail.
 */
const WEIGHT_AT_BOUND = (BAND_WEIGHT.IN_RANGE + BAND_WEIGHT.HIGH) / 2;
const WEIGHT_AT_THRESHOLD = (BAND_WEIGHT.HIGH + BAND_WEIGHT.SIGNIFICANT_HIGH) / 2;

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

/** The weight of a band, total for anything that isn't one of the five. */
export function bandWeight(status: MarkerStatusInput): number {
  const known = asMarkerStatus(status);
  return known ? BAND_WEIGHT[known] : 0.08;
}

/** One stop in a band's fill, placed by the VALUE it belongs at. */
export interface BandRampStop {
  /** Where this stop sits, in the result's own units. The caller maps it onto whatever it is drawing. */
  value: number;
  /** The hue. `plot` where it is composited (a chart band), `track` where it is painted (a range bar). */
  colour: string;
  /**
   * The alpha this stop is composited at, ABSOLUTE rather than a share of the
   * band's own peak — because a stop at a boundary belongs to both bands either
   * side of it and has to carry the same number in each. In the painted `track`
   * role every weight is 1: a range-bar segment is opaque colour.
   */
  weight: number;
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
 * THE WEIGHT LADDER IS UNBROKEN AND CONTINUOUS. Each stop carries an absolute
 * weight, the two boundary stops carry the midpoint of the two bands they join
 * (`WEIGHT_AT_BOUND` / `WEIGHT_AT_THRESHOLD`, derived), and both adjacent bands
 * name the same stop at the same value — so the fill is continuous across a
 * boundary even though it is drawn as two separate shapes, and "further out is
 * more strongly marked" holds at every point rather than at three sampled ones.
 *
 * STOPS RUN LOW VALUE TO HIGH, which is bottom-to-top on a chart's y-axis and
 * left-to-right along a range bar. The caller orients them.
 */
export function bandRampStops(
  status: MarkerStatusInput,
  { low, high, threshold, halfWidth }: BandRampGeometry,
  role: 'plot' | 'track' = 'plot',
): BandRampStop[] {
  const [g, v, y, o, r] = (['green', 'olive', 'yellow', 'orange', 'red'] as const).map((hue) => hueTint[hue][role]);
  // A painted segment is opaque colour; only the composited role carries a
  // weight ladder at all.
  const w = (weight: number) => (role === 'track' ? 1 : weight);
  const IN = w(BAND_WEIGHT.IN_RANGE);
  const OUT = w(BAND_WEIGHT.HIGH);
  const SIG = w(BAND_WEIGHT.SIGNIFICANT_HIGH);
  const BOUND = w(WEIGHT_AT_BOUND);
  const THRESH = w(WEIGHT_AT_THRESHOLD);

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
        { value: low, colour: v, weight: BOUND },
        { value: a, colour: g, weight: IN },
        { value: b, colour: g, weight: IN },
        { value: high, colour: v, weight: BOUND },
      ];
    }
    case 'HIGH': {
      const [a, b] = flat(high, high + threshold);
      return [
        { value: high, colour: v, weight: BOUND },
        { value: a, colour: y, weight: OUT },
        { value: b, colour: y, weight: OUT },
        { value: high + threshold, colour: o, weight: THRESH },
      ];
    }
    case 'LOW': {
      const [a, b] = flat(low - threshold, low);
      return [
        { value: low - threshold, colour: o, weight: THRESH },
        { value: a, colour: y, weight: OUT },
        { value: b, colour: y, weight: OUT },
        { value: low, colour: v, weight: BOUND },
      ];
    }
    // The two outer bands are open-ended, so they carry only the half of the
    // transition that exists — flat red runs on from there to wherever the
    // caller's own extent ends, which is what a gradient's last stop already
    // does.
    case 'SIGNIFICANT_HIGH':
      return [
        { value: high + threshold, colour: o, weight: THRESH },
        { value: high + threshold + halfWidth, colour: r, weight: SIG },
      ];
    case 'SIGNIFICANT_LOW':
      return [
        { value: low - threshold - halfWidth, colour: r, weight: SIG },
        { value: low - threshold, colour: o, weight: THRESH },
      ];
    default: {
      // Flat neutral, spanning the reference range so the two stops are still
      // in order and still real numbers. Total by construction, for the same
      // reason every other lookup in this file is: an `undefined` reaching an
      // SVG stop is not a colour, and the browser drops it silently.
      const neutral = role === 'track' ? NO_STATUS_PAINT.bar : NO_STATUS_PAINT.plot;
      return [
        { value: low, colour: neutral, weight: w(bandWeight(status)) },
        { value: high, colour: neutral, weight: w(bandWeight(status)) },
      ];
    }
  }
}

/**
 * HOW MUCH FURTHER THE OPTIMAL PORTION OF THE REFERENCE RANGE IS TAKEN.
 *
 * Composited ON TOP of the in-range band, so the optimal region lands at
 * 0.11 + 0.09 — a deepening of one green rather than a second region in a
 * second texture. That is the whole change: an optimal range is a NARROWING of
 * in-range, and until now it was drawn as a hatched band with its own key
 * entry, which reads as a parallel system making a competing claim.
 *
 * Small on purpose. It has to be visible as a shift and must not be mistaken
 * for a band boundary, which is what the hairlines are for.
 */
export const OPTIMAL_DEEPEN = 0.09;

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
