import { statusPaint, type MarkerStatus, type MarkerStatusInput } from '@aspire-bloods/shared';

/**
 * The arithmetic and the vocabulary both trend charts are drawn from.
 *
 * The DRAWING is in components/ui/chartParts.tsx; what is here is everything
 * that can be reasoned about without a plot: how a sample date becomes an x,
 * which colour a state takes, how wide a label is and therefore how much gutter
 * an axis needs, and the shape of a point handed to the line gradient.
 *
 * Two charts read it - TrendChart (one marker, real units) and MultiTrendChart
 * (the Compare view, several markers on one normalised axis). Anything either
 * of them would otherwise have kept its own copy of belongs here, because the
 * two spent Aug 2026 apart and the whole cost of that was two copies of one
 * idea drifting.
 */

// ---------------------------------------------------------------------------
// TIME
// ---------------------------------------------------------------------------

/**
 * A calendar date as an epoch value, for a time-scaled axis.
 *
 * Read as UTC midnight deliberately: a sample date is a calendar date, not an
 * instant, and parsing it in local time shifts it a day west of Greenwich -
 * the same reason packages/shared/format.ts reads the parts directly.
 */
export function epochOf(sampleDate: string): number {
  return Date.parse(`${sampleDate.slice(0, 10)}T00:00:00Z`);
}

export const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// THE STATUS COLOUR THE LINE AND ITS SWATCHES ARE MADE OF
// ---------------------------------------------------------------------------

/**
 * A point's own state's colour, solved at `LINE_FILL_TARGET` against the card.
 * It is what the line is at that point, what a key swatch for that state is
 * drawn in, and nothing else on either chart.
 */
export function markFill(status: MarkerStatus): string {
  return statusPaint(status).mark;
}

// ---------------------------------------------------------------------------
// THE LINE
// ---------------------------------------------------------------------------

/**
 * One point, in the units the chart PLOTS in.
 *
 * That last clause is the whole of what makes this shared. On a marker page the
 * plotted unit is the marker's own (mIU/L, µg/L) and `low`/`high` are the
 * laboratory's bounds. On Compare the plotted unit is POSITION WITHIN THE
 * RANGE, so `low` is 0, `high` is 1 and `threshold` is that marker's own
 * significantly-out distance expressed as a share of its own range width. The
 * gradient does not know or care which it has been handed: it asks where a
 * value sits relative to `low`, `high` and `threshold`, and that question has
 * the same answer in both spaces.
 *
 * `threshold` is already resolved - `severityThresholdFor` is the caller's,
 * because only the caller knows whether it then has to be normalised.
 */
export interface StatusLinePoint {
  /** x in the chart's own domain. An epoch value on both charts today. */
  t: number;
  /** y in the plotted units. */
  value: number;
  status: MarkerStatusInput;
  low: number;
  high: number;
  /** How far past a bound a result becomes significantly out, in the plotted units. */
  threshold: number;
}

// ---------------------------------------------------------------------------
// THE LEFT GUTTER
// ---------------------------------------------------------------------------

/**
 * A boundary printed in the left gutter, beside the rule it names.
 *
 * `text` is whatever that chart's axis means. On a marker page it is the bound's
 * own VALUE, because the axis is in the marker's units and a figure is the most
 * specific thing that can be said. On Compare the axis is a position within a
 * range shared by three different markers, where a figure would be meaningless
 * and a WORD is the specific answer, so it reads "Range low". Same gutter, same
 * lead rule, same two weights.
 */
export interface BoundLabel {
  value: number;
  text: string;
  kind: 'bound' | 'threshold';
}

export interface LabelColumn {
  /** Where this period ends, in the x domain. Null for the last one, which is labelled on the axis. */
  endsAt: number | null;
  bounds: BoundLabel[];
}

/**
 * WHICH FACE THE GUTTER IS SET IN, AND IT IS ONE DECISION RATHER THAN TWO.
 *
 * `mono` is a NUMBER on the axis, which is what every numeric label in the
 * product takes. `inherit` is a WORD, which mono is never for - the Compare
 * chart's boundary labels are the only prose labels on any axis in the product,
 * and they take the body face from the wrapper.
 *
 * The face and the width estimate travel together on purpose: they were two
 * arguments for one revision, and the pair that gets a mono gutter measured at
 * sans widths clips its own widest label, silently, at one viewport.
 */
export type LabelFace = 'mono' | 'inherit';

const CHAR_WIDTH: Record<LabelFace, number> = {
  /** Roughly how wide a mono character is at 11px - enough to know whether it fits. */
  mono: 6.6,
  /** IBM Plex Sans is narrower than the mono cut at the same size. */
  inherit: 5.8,
};

export function labelWidth(text: string, face: LabelFace = 'mono'): number {
  return text.length * CHAR_WIDTH[face];
}

/**
 * HOW MUCH ROOM THE LEFT GUTTER NEEDS, from the widest thing that will be
 * printed in it - and this is what stops an axis label being clipped.
 *
 * It was a hard-coded 46, which is fine for "4.2" and not fine for "1400" with
 * a lead rule and a gap in front of it. The widest label plus the rule, the gap
 * and a little air; clamped so a pathological value cannot eat the plot.
 *
 * The clamp is a parameter because the two charts print different KINDS of
 * label in it: four mono characters on a marker page, and up to seventeen sans
 * ones on Compare, where the labels are words. A single cap would either clip
 * the words or hand a two-digit axis a gutter it has no use for.
 */
export function axisGutter(
  texts: string[],
  { face = 'mono', max = 96 }: { face?: LabelFace; max?: number } = {},
): number {
  const widest = texts.reduce((most, t) => Math.max(most, labelWidth(t, face)), 0);
  return Math.min(max, Math.max(46, Math.ceil(widest) + 18));
}

// ---------------------------------------------------------------------------
// SERIES IDENTITY (Compare only, but the drawing of it is shared)
// ---------------------------------------------------------------------------

/**
 * WHICH SERIES, NEVER HOW IT IS.
 *
 * Compare plots up to three markers on one timeline and something has to say
 * which line is which. That something is the DASH PATTERN, drawn on the plot,
 * plus a shape that travels with the marker everywhere it is named: the chip
 * above the chart, the summary card below it, the legend row, the tooltip.
 *
 * ⚠ IT CANNOT BE A COLOUR, and since Aug 2026 that is a stronger claim than it
 * was. Each line now gradients through the traffic light along its own length,
 * so a hue on that plot means a STATE - and a series identifier borrowing one
 * would say "this marker is the gold one", which is a sentence about the wrong
 * thing. `dashLabel` is what a screen reader is told, so the distinction is
 * stated in words as well as drawn.
 *
 * A fourth entry cannot be needed: the selection is capped at three.
 */
export const SERIES_STYLES = [
  { dash: undefined, shape: 'circle' as const, dashLabel: 'solid line, round markers' },
  { dash: '7 4', shape: 'square' as const, dashLabel: 'dashed line, square markers' },
  { dash: '2 4', shape: 'diamond' as const, dashLabel: 'dotted line, diamond markers' },
];

export function seriesStyle(index: number) {
  return SERIES_STYLES[index % SERIES_STYLES.length];
}
