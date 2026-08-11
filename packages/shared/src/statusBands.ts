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
 */
export const BAND_WEIGHT: Record<MarkerStatus, number> = {
  IN_RANGE: 0.1,
  LOW: 0.17,
  HIGH: 0.17,
  SIGNIFICANT_LOW: 0.24,
  SIGNIFICANT_HIGH: 0.24,
};

/** The weight of a band, total for anything that isn't one of the five. */
export function bandWeight(status: MarkerStatusInput): number {
  const known = asMarkerStatus(status);
  return known ? BAND_WEIGHT[known] : 0.08;
}

/**
 * The band's colour pair in the `plot` role — the form a band is drawn in now
 * that its weight is an alpha rather than a mix.
 *
 * Kept as a second function rather than a change to `bandGradientStops` because
 * the two roles are painted differently and cannot share one value: `band` is a
 * pre-mixed colour drawn at full opacity (the comparison chart still does
 * that), and `plot` is the hue itself, which at full opacity would be a
 * highlighter pen.
 *
 * ONE SUBSTANTIVE DIFFERENCE, AND IT IS A CORRECTION. Above-range and
 * below-range are FLAT here, where `band` ramps them out to orange.
 *
 * The ramp was a small lie that only became visible once the bands were
 * softened. A trend chart's y-axis is padded by about a third of the reference
 * range's own width, and the out-of-range band is a range-width and a half tall
 * — so roughly the top FIFTH of the below-range band is ever on screen. The
 * gradient still has to fade at the edge of the plot rather than at the edge of
 * the band (otherwise it is at full strength exactly where it should have
 * dissolved, which is what made the plot read as a filled box), and once it is
 * mapped to what is visible, the whole yellow-to-orange ramp is compressed into
 * that fifth. The result was orange painted immediately below the reference
 * bound — the transition into significantly-out, drawn at the point a result is
 * barely out at all. On a dark surface it was also the muddiest colour in the
 * set, and it was covering the largest region.
 *
 * So the shoulder now lives only where it is true: in the significantly-out
 * bands, orange at the threshold and red beyond it. Orange is still the
 * transition between yellow and red and still never a state a result can be in.
 *
 * `stops` run low-to-high in value space, which is TOP TO BOTTOM in a chart's
 * y-axis — the caller orients them.
 */
export function bandPlotStops(status: MarkerStatusInput): [string, string] {
  switch (asMarkerStatus(status)) {
    case 'SIGNIFICANT_LOW':
      return [hueTint.red.plot, hueTint.orange.plot];
    case 'LOW':
      return [hueTint.yellow.plot, hueTint.yellow.plot];
    case 'IN_RANGE':
      return [hueTint.green.plot, hueTint.green.plot];
    case 'HIGH':
      return [hueTint.yellow.plot, hueTint.yellow.plot];
    case 'SIGNIFICANT_HIGH':
      return [hueTint.orange.plot, hueTint.red.plot];
    default:
      return [NO_STATUS_PAINT.plot, NO_STATUS_PAINT.plot];
  }
}

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
