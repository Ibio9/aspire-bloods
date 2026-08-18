import { useEffect, useId, useState } from 'react';
import { ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  asMarkerStatus,
  chart as chartTokens,
  severityThresholdFor,
  referenceRangePeriods,
  periodStepBoundaries,
  formatOptimalRange,
  formatReferenceBound,
  formatReferenceRange,
  formatDate,
  type MarkerStatusInput,
  type OptimalRangeDTO,
} from '@aspire-bloods/shared';
import { formatAxisDate } from '../../lib/patientPortal';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { statusColor, statusLabel } from '../../lib/markerCopy';
import {
  axisGutter,
  DAY_MS,
  epochOf,
  type LabelColumn,
  type StatusLinePoint,
} from '../../lib/chartGeometry';
import {
  BoundaryLabels,
  RuleSwatch,
  SparkDot,
  SparkGradient,
  SparkPoint,
  SparkSwatch,
  StatusLineGradient,
  StatusLineSwatch,
  statusLineCasing,
} from './chartParts';

/**
 * One marker over time.
 *
 * Three things this chart refuses to do, each of which it used to:
 *
 *  - Draw a line through fewer than two points. A single result has no
 *    direction, and a flat segment through one point reads as "steady", which
 *    is a claim nobody has the data to make.
 *  - Draw a line between results that aren't comparable. Two values that
 *    needed a unit conversion we don't hold are two separate facts, not a
 *    trajectory, so they render as unconnected points.
 *  - Say anything evaluative. It shows where the lab's reference range sits and
 *    nothing more. Nothing on it is labelled good, healthy, bad, concerning or
 *    danger, and nothing ever will be.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE BANDS ARE GONE. THE LINE IS THE CHART (Aug 2026).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This supersedes every previous instruction in this file about band colour,
 * band opacity, the boundary-centred ramp, the plot lift and the plot panel.
 * There are NO FILLED REGIONS on this chart of any kind: no status bands, no
 * ramp gradients, no optimal narrowing drawn as a shape, no inset panel behind
 * it all. What is drawn, and this is the whole list:
 *
 *   1. THE LINE, on the card itself, carrying status along its own length.
 *   2. FOUR BOUNDARY RULES — the two reference bounds and the two
 *      significantly-out thresholds — with their values printed on the axis.
 *   3. THE POINTS, each a shape in its own status colour.
 *   4. THE AXIS, and the unit above it.
 *
 * ── AND SINCE Aug 2026 ALL OF IT IS LIT ────────────────────────────────────
 *
 * Every point is a SPARK — a tight core inside a wide radial falloff in its own
 * status colour, brightest on the most recent — and the line carries a faint
 * casing of the same light along its length. That is an effect applied to the
 * colours already solved here and it changes none of them.
 *
 * IT DOES NOT REOPEN "NO FILLED REGIONS". That rule is about REGIONS OF THE
 * PLOT — the status bands, the optimal narrowing, the inset panel — areas of
 * colour that said where the reference range sits and out-read the reader's own
 * result while doing it. A halo is part of the point mark, drawn at the mark and
 * nowhere else, and one has been drawn here all along (it was a flat 13px disc,
 * which is what made it read as a dot inside a ring rather than as light). See
 * SPARK in tokens.ts for the falloff, the per-theme strength and why none of it
 * goes near an SVG filter.
 *
 * ── WHY THIS IS BETTER AND NOT JUST QUIETER ────────────────────────────────
 *
 * The bands went through four re-solves in this file's history and every one of
 * them hit the same wall from a different side, because they were being asked
 * to do two incompatible things at once: be legible enough to say where the
 * range is, and quiet enough that the reader's own result out-reads them. Every
 * gain on one was a loss on the other, and the LINE paid for all of it — its
 * colour was solved to clear five painted regions, which is what produced a
 * white-ish line on the dark plot and three near-black browns on the light one.
 *
 * With nothing behind it the line answers to one surface, and it can be as
 * colourful as the palette allows. Measured: light's green went from #265600 to
 * #507e2c and its red from #941a08 to #c14836; dark's from a pale cream line to
 * #73a14f / #bf8f00 / #e46956. See LINE_FILL_TARGET in tokens.ts.
 *
 * ── WHAT CARRIES THE REFERENCE RANGE NOW ───────────────────────────────────
 *
 * The four hairlines, at two weights that are distinguishable without colour:
 * the reference bounds SOLID at full weight, the significantly-out thresholds
 * DASHED and lighter. Each is labelled with its own value on the left axis,
 * beside the scale and told apart from it by a lead rule matching its own
 * line's dash. A dashed horizontal is not the dashed VERTICAL that marks a
 * change of reference range: different axis, different meaning, and both are
 * named in the key.
 *
 * ── WHAT IS UNCHANGED, AND IT IS THE PART THAT MATTERS ─────────────────────
 *
 * The shape layer. Every point is still a level mark, a chevron or a doubled
 * chevron; every state is still named in words in the key and in the tooltip;
 * every bound is still a figure on the axis. Turn the whole chart greyscale and
 * nothing is lost — which matters most for exactly this pair, since red and
 * green are the commonest confusion there is.
 *
 * ── AND THE RANGE BARS ARE UNTOUCHED ───────────────────────────────────────
 *
 * They keep their five painted segments. A bar is a different instrument doing
 * a different job: one value against a scale, with no line to carry the colour.
 * `bandRampStops`, `BAND_CONTRAST` and `--c-hue-*-fill` all still exist and all
 * still serve it.
 */

/**
 * ── AND EVERY PART OF THE DRAWING IS SHARED WITH COMPARE (Aug 2026) ────────
 *
 * The line's gradient, its casing, the spark at every point, the boundary
 * labels, the gutter arithmetic and every swatch live in chartParts.tsx, and
 * MultiTrendChart imports the same ones. That chart was the last thing in the
 * product still drawing a banded background, so the two sat one press apart
 * saying the same thing in two incompatible ways; a second copy of any of this
 * is how the next divergence starts. What is left in THIS file is what only a
 * single-marker chart has: real units on the axis, the tick ladder, the
 * reference-range periods and the step between them.
 */

interface TrendPoint {
  sampleDate: string;
  value: number;
  unit?: string;
  /**
   * Nullable because the wire is. A point with no status is dropped before
   * anything is drawn — see the filter in TrendChart.
   */
  status: MarkerStatusInput;
  referenceLow: number;
  referenceHigh: number;
  /**
   * Where significantly-out begins for this marker, in the value's own units.
   * Absent on an older payload, in which case the shared default multiplier is
   * applied to the range width — see severityThresholdFor.
   */
  severityThreshold?: number;
  converted?: boolean;
  originalValue?: number;
  originalUnit?: string;
}

/** A point with its date resolved to a number, which is what everything below reads. */
type PlottedPoint = TrendPoint & { t: number };

// ---------------------------------------------------------------------------
// A NUMBER SOMEBODY WOULD HAVE CHOSEN.
//
// The y-axis used to read 0, 8, 16, 24, 31.9 — because Recharts, handed a
// domain, divides it into equal parts and prints whatever falls out, and the
// top of the domain is the data plus a computed pad. 31.9 is not a quantity
// anybody picked, it is an artefact of the padding arithmetic showing through,
// and a reader who sees one immediately (and correctly) stops trusting the
// numbers beside it.
//
// So the ticks are chosen from the 1 / 2 / 2.5 / 5 ladder at the marker's own
// order of magnitude and placed INSIDE the domain rather than at its ends. The
// domain is untouched by this: the bands are geometry derived from the
// reference range and must not move because an axis label wanted to be round.
// ---------------------------------------------------------------------------

/** The smallest step from the 1/2/2.5/5 ladder that is at least `rough`. */
function niceStep(rough: number): number {
  if (!Number.isFinite(rough) || rough <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}

/** How many decimals a value needs to print exactly, capped where a lab result stops caring. */
function decimalsOf(value: number): number {
  const text = String(value);
  const dot = text.indexOf('.');
  return dot < 0 ? 0 : Math.min(3, text.length - dot - 1);
}

/**
 * Round tick values within [min, max] — four of them where the span allows,
 * which is fewer than the six or seven Recharts reaches for by default. A trend
 * chart is read for its shape; the axis is there to give that shape a scale,
 * and every extra label is furniture competing with the data.
 */
/**
 * HOW CLOSE A TICK MAY GET TO A REFERENCE BOUND BEFORE IT IS DROPPED, as a
 * share of the y domain.
 *
 * It was 2%, which is not a distance on screen — it is a distance in the
 * marker's own units, and the two are only related through the plot's height.
 * On a marker whose domain spans ~500 units over a ~200px plot, 2% is 10 units
 * and therefore 4px: a round tick at 400 and a reference bound at 375 cleared
 * it comfortably and then printed on top of each other.
 *
 * 8%. On the SHORTEST plot this chart is ever drawn at (the `h-64` case, less
 * the margins and the x-axis, so roughly 200px) that is 16px — comfortably
 * more than the 12px `BoundaryLabels` uses to resolve its own collisions,
 * because these two labels are not merely near each other, they are in the
 * same gutter and one of them has a lead rule attached.
 *
 * 6% was tried first and is the arithmetic answer (12px, the same figure);
 * rendered, it left ALT's tick at 50 sitting directly on its reference bound
 * at 41, which is the collision this exists to prevent. Nothing is lost by the
 * extra room: dropping a tick reruns the ladder at a finer step, so the axis
 * ends up with the same number of labels somewhere else.
 *
 * The BOUND always wins, never the tick: a tick value is where the scale
 * happens to be marked and a bound is a clinical threshold.
 */
const TICK_BOUND_GAP = 0.08;

function niceTicks(min: number, max: number, target = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
  const step = niceStep((max - min) / target);
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)) + 1);
  const ticks: number[] = [];
  const first = Math.ceil(min / step - 1e-9) * step;
  for (let i = 0; i < 40; i += 1) {
    const value = first + i * step;
    if (value > max + step * 1e-9) break;
    // Rebuilt from the step each time rather than accumulated, so 0.1 + 0.1 +
    // 0.1 does not print as 0.30000000000000004 on somebody's blood result.
    ticks.push(Number(value.toFixed(decimals)));
  }
  return ticks.length >= 2 ? ticks : [];
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE SHAPE LAYER IS OFF THIS CHART, AND ONLY THIS CHART (Aug 2026).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `STATUS_SHAPE` and `StatusMark` used to live here: a level dot for in range,
 * a chevron for out, a DOUBLED chevron for significantly out, each stroked in
 * its own status colour and filled with the card. Three kinds of mark on one
 * line, and the line beneath them already carried the identical fact in colour
 * along its own length. Both are gone and neither comes back — every point is
 * now the same white spark (see `SparkPoint`).
 *
 * ── THIS IS A NAMED EXCEPTION TO "NEVER COLOUR ALONE", AND THE ONLY ONE ────
 *
 * The rule stands everywhere else and nothing here weakens it: result cards,
 * range bars, the counts strip, the status words, the badges and the tooltip
 * all still carry status as a shape and a word first. What makes this chart
 * different is that it has a second non-colour carrier none of those surfaces
 * has — a point's POSITION against four labelled boundary rules, each drawn
 * across the plot and printed with its own value on the axis. A reader who
 * cannot separate the green stretch of line from the red one still sees which
 * side of the reference bound every point falls on, which is a more precise
 * answer than a chevron and one that survives greyscale and a printed page in
 * full. The status is still NAMED IN WORDS on every point in the tooltip, and
 * in the key below the chart.
 *
 * See CLAUDE.md, "Traffic-light status", for the same note in the one place a
 * future session will look before putting the shapes back.
 */

/**
 * ⚠ THE SPARK, THE SWATCHES, THE LINE GRADIENT, THE CASING AND THE BOUNDARY
 * LABELS ARE IN chartParts.tsx (Aug 2026), and every one of them was defined
 * here until Compare needed the identical drawing. Do not reintroduce a local
 * copy of any of them: the whole point of the move is that a change to how a
 * point is lit, or to how the line travels through a region, reaches both
 * charts in one edit.
 */

/**
 * WHAT WAS HERE, AND WHY ALL THREE ARE GONE (Aug 2026).
 *
 * `LatestValueLabel` — the most recent value printed beside its own point. It
 * was added because every point on this chart was an anonymous mark and reading
 * one meant hovering, which is a gesture a phone does not have. On the MARKER
 * PAGE, which is the only screen this chart appears on, that number is already
 * the largest thing on the screen in the card immediately beside it. Printing
 * it a second time inside the plot was the same figure twice, six inches apart.
 *
 * `PlotPanel` — the inset panel the bands were drawn on: a warm off-white
 * rectangle, a hairline frame at two weights and a two-gradient inner shadow.
 * With no bands there is no ground to give an edge to, and a filled rectangle
 * on the card is exactly the "filled region" this pass removed.
 *
 * `OptimalRegions` — the optimal band drawn as a deepening of the in-range
 * green. It is a filled region like any other and goes with them. The optimal
 * range is still SAID: in the tooltip on every point, and on the marker page in
 * a card that names its published source.
 */

/** Value, unit, date, status and source — everything needed to read a point without leaving it. */
function ChartTooltip({
  active,
  payload,
  optimal,
}: {
  active?: boolean;
  payload?: { payload: TrendPoint }[];
  optimal?: OptimalRangeDTO | null;
}) {
  if (!active || !payload?.[0]) return null;
  const point = payload[0].payload;
  const withinOptimal =
    optimal == null
      ? null
      : (optimal.low == null || point.value >= optimal.low) && (optimal.high == null || point.value <= optimal.high);
  const unit = point.unit ? ` ${point.unit}` : '';

  return (
    // A CARD, not a browser tooltip: the product's own hairline and warm
    // espresso-derived shadow, at the popover level so it reads as lifted off
    // the chart rather than drawn on it.
    //
    // GLASS rather than a flat surface, the same material as the pinned results
    // control bar and the sidebar — so the plot underneath is diffused instead
    // of covered, which is what a tooltip on a chart should do: it is a reading
    // OF the chart and should not delete the part it is reading.
    <div className="glass min-w-[11rem] rounded-card border border-taupe px-4 py-3 text-xs shadow-popover">
      <p className="numeric text-[11px] uppercase tracking-eyebrow text-espresso/80">{formatDate(point.sampleDate)}</p>
      <p className="numeric tabular mt-1.5 text-lg font-semibold leading-none text-espresso">
        {point.value}
        {point.unit && <span className="ml-1 text-xs font-normal text-espresso/80">{point.unit}</span>}
      </p>
      {/* The status word takes its own state's colour. It is a label FOR that
          colour rather than content sitting in it, and the WORD is what carries
          the state — so it reads identically with the colour removed.

          ── THE GLYPH BESIDE IT IS A STRETCH OF LINE NOW (Aug 2026) ─────────
          It was the point's own shape: a chevron, or a doubled one. The chart
          does not draw those any more, and a tooltip that shows a mark the
          chart never made is a key to a different picture. What it shows
          instead is what the chart DOES draw for this state — a length of line
          in that state's colour — which is the same rule every swatch in the
          key answers to. */}
      <p className="mt-2 flex items-center gap-1.5 font-medium" style={{ color: statusColor(point.status) }}>
        <StatusLineSwatch status={point.status} />
        {statusLabel(point.status)}
      </p>
      {/* THAT point's range, not the marker's current one — the whole reason a
          changed reference range gets a step, a dashed rule and a sentence. */}
      {/* Formatted, never interpolated raw. These bounds have been through a
          unit conversion by the time they get here, and `{point.referenceLow}`
          printed one as 3.884960761896305 in a patient-facing tooltip. */}
      <p className="mt-2 border-t border-taupe/60 pt-2 text-espresso/80">
        Reference range{' '}
        <span className="numeric">
          {formatReferenceRange(point.referenceLow, point.referenceHigh)}
          {unit}
        </span>
      </p>
      {/* Advisory, and clearly separate from the status above it. */}
      {optimal && (
        <p className="tabular mt-1 text-espresso/80">
          Optimal {formatOptimalRange(optimal.low, optimal.high, optimal.unit)}
          <span> · {withinOptimal ? 'within optimal' : 'outside optimal'}</span>
        </p>
      )}
      {/* "Analysed by Randox Health" is gone from every patient surface (Aug
          2026) — see ReportHeader. The CONVERSION note below stays and is a
          different kind of fact: it says this figure is not the number the
          laboratory printed, which is the one provenance line a patient
          reading their own trend actually needs. */}
      {point.converted && (
        <p className="mt-1 text-espresso/80">
          Converted from {point.originalValue} {point.originalUnit}
        </p>
      )}
    </div>
  );
}

export function TrendChart({
  data: input,
  crossSourceComparable = true,
  optimal = null,
  height = 'default',
}: {
  data: TrendPoint[];
  crossSourceComparable?: boolean;
  /** The advisory optimal band, or null when this marker has no established one — in which case nothing about optimal is drawn or said. */
  optimal?: OptimalRangeDTO | null;
  /**
   * `tall` is the marker detail page, where this card takes 60% of the row
   * rather than 50%. The extra height over `default` is not decoration: a trend
   * line in a squat plot area exaggerates every movement in it, which on a page
   * about someone's blood is the wrong kind of wrong.
   *
   * ── 24rem, DOWN FROM 28, AND THE CARD IS WIDER (Aug 2026) ────────────────
   *
   * The complaint was the PROPORTIONS rather than the size: a plot 490px wide
   * and 432px tall is very nearly square, and a trend read in a square is a
   * trend read at 45°, where every movement looks like a cliff. It went 30rem →
   * 22 → 28 by adding and removing height alone, which is the axis that was
   * already wrong.
   *
   * Both dimensions move a little this time, in opposite directions. The card
   * takes 62.5% of the row rather than 60% (5 of 8 columns rather than 3 of 5;
   * see the grid on MarkerDetailPage) and the plot loses 64px of height. The
   * inner plot goes from about 490 × 432 to 514 × 368 — from 1.13:1 to 1.40:1,
   * which is a landscape chart rather than a squat one, on a change of 2.5% of
   * width and 14% of height.
   *
   * IT ALSO GIVES BACK THE FOLD. At 1440 × 900 the pair is comfortably inside
   * the window with the page header above it, and the LEFT card is now what
   * sets the row height — which is the right way round, since that card's
   * content is fixed and the plot's is elastic.
   *
   * `e2e/marker-pair-fit.spec.ts` measures the pair at 1440 x 900 in both
   * themes and fails if it stops fitting. That file is NEW, and it is new
   * because this comment has cited a spec through three different heights
   * (30rem, 22rem, now 28rem) and the file it named did not exist — a number
   * protected by a comment pointing at nothing, which reads as covered and is
   * worse than an uncovered number that admits it.
   */
  height?: 'default' | 'tall';
}) {
  const reducedMotion = useReducedMotion();
  // Ids are document-global; two marker charts on one page sharing one would
  // make the second line reference the first one's gradient.
  const uid = useId().replace(/:/g, '');
  /** The line's own status gradient — same reason as `uid`: ids are document-global. */
  const lineGradientId = `status-line-${uid}`;
  /**
   * The same gradient at the casing's alpha, and the POINTS' radial falloffs.
   *
   * `status-glow-` rather than a second `status-line-`: e2e/chart-bands.spec.ts
   * reads the line's stops off `linearGradient[id^="status-line-"]` and would
   * otherwise measure whichever of the two it reached first.
   */
  const lineGlowId = `status-glow-${uid}`;
  /** ONE falloff for the whole chart — every point is the same white spark. */
  const sparkId = `spark-${uid}`;

  /**
   * Only points that were actually placed against a range are plotted.
   *
   * A point's status decides its mark's shape, its colour and the words for it
   * in the key and the accessible summary; a point with none has nothing to
   * give any of the three, and inventing one would be a claim about a
   * comparison nobody made. The server already refuses to send one
   * (getMarkerTrendForPatient), and the empty-data message below is the right
   * answer when that leaves nothing.
   */
  const data = input.filter((p) => asMarkerStatus(p.status) !== null);

  const singlePoint = data.length === 1;
  // Connecting a line means asserting these points belong on one trajectory.
  // Two conditions, both required: there are at least two of them, and they
  // are comparable with each other.
  const connected = data.length >= 2 && crossSourceComparable;

  /**
   * THE MOUNT, and it is short.
   *
   * The line draws itself in (Recharts animates the stroke's dash offset, which
   * is a draw rather than a fade) and the bands come up under it — in that
   * order, because the line is the subject. `animate` falls back to false once
   * it is done so that a re-render caused by a hover or a resize does not
   * replay it, and the whole thing is skipped outright under reduced motion:
   * `.trend-mount` is what carries the band fade, and it is only ever applied
   * when this is true. The keyframe in globals.css is guarded a second time.
   */
  const [animate, setAnimate] = useState(connected && !reducedMotion);
  useEffect(() => {
    if (reducedMotion || !connected) return;
    const t = setTimeout(() => setAnimate(false), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A marker whose only released result is textual ("Not detected") has no
  // plottable point at all. Rendering an axis around nothing is worse than
  // saying so plainly.
  if (data.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-espresso/80">
        This marker’s result isn’t a number, so there is nothing to plot. The result itself is shown above.
      </p>
    );
  }

  /**
   * THE TIME AXIS.
   *
   * This chart used to plot sampleDate as a category, which is Recharts'
   * default for a string key — every point evenly spaced regardless of when it
   * was actually taken. On a screening history that is not a cosmetic
   * simplification, it is a false claim about rate of change: results in
   * August 2025, November 2025 and August 2026 drew as three equal steps, so a
   * marker that moved sharply over three months and then held for nine
   * rendered as a steady drift across the whole year. The slope of the line —
   * the only thing a trend chart is for — meant nothing.
   *
   * Plotted against real time, the gaps are the gaps.
   */
  // Sorted, because everything below reads the series as a sequence in time:
  // the band periods, the step boundaries between them, and the line itself.
  // The server sends it in order today; a chart that silently draws a zigzag
  // if it ever stops is not worth the two comparisons saved.
  const rows: PlottedPoint[] = data.map((d) => ({ ...d, t: epochOf(d.sampleDate) })).sort((a, b) => a.t - b.t);
  /**
   * The same series in the units the SHARED gradient reads.
   *
   * This chart plots the marker's own unit, so `low` and `high` are the
   * laboratory's own bounds and the threshold is resolved here, in those units.
   * Compare hands the identical shape in normalised position instead, which is
   * the whole reason `StatusLinePoint` names the fields for their job rather
   * than for the payload they came from. See chartParts.tsx.
   */
  const linePoints: StatusLinePoint[] = rows.map((r) => ({
    t: r.t,
    value: r.value,
    status: r.status,
    low: r.referenceLow,
    high: r.referenceHigh,
    threshold: severityThresholdFor(r.referenceLow, r.referenceHigh, r.severityThreshold),
  }));
  const times = rows.map((r) => r.t);
  const tFirst = Math.min(...times);
  const tLast = Math.max(...times);
  // A single point (or several on one day) has no span to pad from; a week
  // either side gives it a plot area rather than a degenerate domain.
  const tPad = Math.max((tLast - tFirst) * 0.06, 7 * DAY_MS);
  const tMin = tFirst - tPad;
  const tMax = tLast + tPad;

  const values = data.map((d) => d.value);
  const allLows = data.map((d) => d.referenceLow);
  const allHighs = data.map((d) => d.referenceHigh);

  // Axis scaling, deliberately not from zero. Anchoring at zero flattens a
  // marker whose normal range sits well above it (HbA1c 20–42) into a
  // straight line and hides every real movement; cropping tight to the data
  // does the opposite and makes ordinary variation look alarming. So the
  // domain is driven by the reference band plus the observed values, padded
  // by a share of the band's own width — the band stays visually meaningful
  // at whatever scale the marker happens to use.
  const bandSpan = Math.max(...allHighs) - Math.min(...allLows);
  const valueSpan = Math.max(...values) - Math.min(...values);
  // A single point (or a perfectly flat series) has no span of its own to
  // scale from — fall back to the band, then to the value itself, so one
  // result still renders inside a sensibly-proportioned chart instead of
  // collapsing the domain to a zero-height line.
  const referenceSpan = bandSpan || valueSpan || Math.abs(values[0] || 1);
  const domainPad = referenceSpan * 0.3;
  const rawMin = Math.min(...allLows, ...values) - domainPad;
  // Never below zero for a marker that cannot be negative. With the bands gone
  // a negative gutter would no longer paint a region no result can occupy, but
  // it would still print a negative tick on the axis of a quantity that has no
  // negative values, which is the same claim in smaller type.
  const nonNegative = Math.min(...allLows, ...values) >= 0;
  const domainMin = nonNegative ? Math.max(0, rawMin) : rawMin;
  const domainMax = Math.max(...allHighs, ...values) + domainPad;

  /**
   * THE BOUNDARIES ARE DRAWN PER PERIOD, NOT PER POINT — and that distinction
   * is what stops a range change rendering as a sliver.
   *
   * Consecutive results sharing a reference range are ONE period, and a period
   * gets ONE set of four rules. One range across the series therefore means
   * four rules spanning the whole plot, which is what "no step" looks like.
   *
   * WHERE THE STEP GOES. Midway between the last sample on the old range and
   * the first on the new one. We know the range changed between those two draws
   * and not when, so the midpoint is the only honest x for it — and it also
   * guarantees every period is at least half a sampling gap wide, which is what
   * makes a sliver impossible even when the change lands on the final result.
   * Anchoring the step ON the new point is what once drew the newest range as a
   * 24px strip in the plot's padding gutter.
   *
   * WHETHER THE RANGE CHANGED AT ALL is `sameReferenceRange` (statusBands.ts)
   * and not a float compare, because the bounds arriving here have been through
   * a unit conversion. A fasting glucose reported as 3.9–5.5 mmol/L and then as
   * 70–99 mg/dL is ONE range written twice, and 99/18.0182 = 5.494444506110488
   * is not float-equal to 5.5 — so the chart stepped, drew the dashed rule, named
   * the change in the key, and printed a sentence claiming the laboratory had
   * changed a range it had not touched. Identity is decided at the precision the
   * range is printed at, so a step exists exactly when the two printed ranges
   * differ. The GEOMETRY still uses the exact numbers the server sent (the
   * period takes its first row's), so no rule moves to suit a rounding.
   *
   * THE DERIVATION ITSELF IS IN packages/shared (`referenceRangePeriods` /
   * `periodStepBoundaries`), so it can be tested from explicit fixtures rather
   * than only through a browser measuring whatever the demo seed happens to
   * hold — and the demo deliberately holds no step at all now. See
   * apps/server/tests/referenceRangePeriods.test.ts.
   */
  const periods = referenceRangePeriods(rows);
  const stepBoundaries = periodStepBoundaries(periods);

  /**
   * ONE X EXTENT PER PERIOD, AND EVERYTHING IN THAT PERIOD IS DRAWN TO IT.
   *
   * The four boundary rules, the step rule at each end and the bound labels all
   * read `x1`/`x2` from here, so "every rule steps together at the same x" is
   * structural rather than a coincidence of separate expressions agreeing.
   *
   * The outer periods run out to the axis edges so the padding gutters aren't
   * bare: the range that applied at the first sample is the range that applied
   * just before it, and likewise at the end.
   *
   * THE ORDER OF `edges` IS LOAD-BEARING. The two reference bounds come first,
   * and `BoundaryLabels` resolves collisions by dropping whatever it reaches
   * second — so on a marker whose threshold sits within 12px of a bound, it is
   * the THRESHOLD's label that goes. The reference range is what the chart is
   * about.
   */
  const bandSegments = periods.map((period, i) => ({
    x1: i === 0 ? tMin : stepBoundaries[i - 1],
    x2: i === periods.length - 1 ? tMax : stepBoundaries[i],
    low: period.low,
    high: period.high,
    threshold: period.threshold,
    edges: [
      { y: period.low, kind: 'bound' as const },
      { y: period.high, kind: 'bound' as const },
      { y: period.low - period.threshold, kind: 'threshold' as const },
      { y: period.high + period.threshold, kind: 'threshold' as const },
    ],
  }));

  // Every period's own bounds. The CURRENT one (endsAt null) prints on the left
  // axis beside the scale, with a lead rule to its own hairline; the earlier
  // ones end at their step rule and print just inside it, which is the only
  // place they can go and still say which period they belong to.
  const labelColumns: LabelColumn[] = periods.map((period, i) => ({
    endsAt: i === periods.length - 1 ? null : stepBoundaries[i],
    // BOUNDS FIRST. Collisions are resolved by dropping whatever is reached
    // second, so a threshold sitting within 12px of a bound loses its number
    // and keeps its dashed rule.
    bounds: [
      { value: period.high, text: formatReferenceBound(period.high), kind: 'bound' as const },
      { value: period.low, text: formatReferenceBound(period.low), kind: 'bound' as const },
      {
        value: period.high + period.threshold,
        text: formatReferenceBound(period.high + period.threshold),
        kind: 'threshold' as const,
      },
      {
        value: period.low - period.threshold,
        text: formatReferenceBound(period.low - period.threshold),
        kind: 'threshold' as const,
      },
    ],
  }));
  const boundaryLabels = labelColumns.flatMap((c) => c.bounds);

  /**
   * The scale, minus anything the inline boundary labels already say.
   *
   * A reference range is very often a round number — 135–145 for sodium is
   * exactly the sort of pair the tick ladder lands on too — and the two label
   * sets then print the same figure twice at the same height on opposite sides
   * of the plot, which reads as a second axis rather than as a range bound. The
   * boundary wins where they collide: it is the more specific fact, and it is
   * the one attached to a line.
   *
   * Never below two, so a marker whose range happens to swallow every tick
   * still has a scale on the left rather than an empty gutter.
   */
  const yTicks = (() => {
    const gap = (domainMax - domainMin) * TICK_BOUND_GAP;
    const clear = (ticks: number[]) => ticks.filter((t) => !boundaryLabels.some((b) => Math.abs(b.value - t) < gap));
    // Asking for more ticks and clearing again, rather than falling back to the
    // unfiltered set. The old fallback put the collision straight back: on a
    // marker whose bounds swallow most of a four-tick ladder, "keep them all"
    // means keeping the two that print over a bound.
    for (const target of [4, 6, 8, 10]) {
      const kept = clear(niceTicks(domainMin, domainMax, target));
      if (kept.length >= 2) return kept;
    }
    return [];
  })();
  const tickDecimals = yTicks.reduce((most, tick) => Math.max(most, decimalsOf(tick)), 0);

  /**
   * THE LEFT GUTTER, SIZED FROM WHAT IS ACTUALLY PRINTED IN IT.
   *
   * It was a hard-coded 46px, which held four mono characters. A marker whose
   * significantly-out threshold is 1400 prints five, plus a 6px lead rule and a
   * 4px gap — 47px of content in a 46px gutter, and the leading digit is
   * clipped by the SVG's own edge. Derived, it cannot be.
   */
  const gutter = axisGutter([...yTicks.map((t) => t.toFixed(tickDecimals)), ...boundaryLabels.map((b) => b.text)]);

  /**
   * A reference range that changes partway through a series has to be SAID,
   * not just drawn.
   *
   * Two results measured against different ranges are two different questions
   * answered, and a reader comparing "in range" to "above range" across that
   * boundary is comparing the wrong things without knowing it. That is exactly
   * the sort of silent change that misleads someone reading their own trend,
   * so it gets a sentence as well as a step. Positional wording only: which
   * range applied from when, and nothing about what the change means.
   *
   * The bounds go through `formatReferenceRange` — the same rounding that decided
   * there was a step at all, so this sentence can never name two ranges that are
   * the same range, and can never print one of them as 3.884960761896305.
   */
  const rangeChangeNote =
    periods.length < 2
      ? null
      : periods
          .map((p, i) => {
            const range = formatReferenceRange(p.low, p.high, p.rows[0].unit);
            return i === 0
              ? `${range} up to ${formatDate(p.rows[p.rows.length - 1].sampleDate)}`
              : `${range} from ${formatDate(p.rows[0].sampleDate)}`;
          })
          .join(', then ');

  const summary = data
    .map((d) => `${formatDate(d.sampleDate)}: ${d.value}, ${statusLabel(d.status).toLowerCase()}`)
    .join('; ');

  return (
    <div>
      {/* NOTHING ABOVE THE CHART in the ordinary case, and that is the change.
          A paragraph saying "these 4 results are directly comparable, so they
          are joined into one trend line" sat over every healthy series,
          explaining the absence of a problem — which is a sentence about the
          chart's implementation rather than about the patient's results, and
          it pushed the plot area down by two lines on a phone.

          The comparability logic is untouched and still gates whether a line
          is drawn at all (see `connected`). What changed is where the two
          cases that are actually worth saying get said: the first-result case
          is stated once, quietly, because a lone point with no line genuinely
          needs explaining; and the not-comparable case has moved into the key
          below, beside the marks it is about, where the rest of this chart's
          vocabulary already lives. */}
      {singlePoint && (
        <p className="mb-3 text-xs leading-relaxed text-espresso/80">
          This is your first result for this marker, so it is shown as a single point with no trend line.
        </p>
      )}

      {/* THE UNIT, ONCE, ON THE AXIS — not repeated on every tick.
          A y-axis reading "4 mmol/L, 6 mmol/L, 8 mmol/L" states the unit three
          times to say it once, and the repetition is the widest thing in the
          gutter. Mono, because it is part of the numeric data rather than
          prose. Absent where the marker has no unit, which is nine of them
          deliberately (CLAUDE.md). */}
      {rows[0]?.unit && (
        <p className="numeric mb-1 pl-1 text-xs text-espresso/80">{rows[0].unit}</p>
      )}

      {/* ── ONE PADDING VALUE ON ALL FOUR SIDES (Aug 2026) ──────────────────
          The wrapper was `px-1 pb-1 sm:px-2` — three different numbers and no
          top padding at all — and the chart margins inside it were
          `{18, 18, 6, 10}`, four more. Between them the drawing sat a different
          distance from every edge of its card, which is what "the geometry
          differs between instances" was.

          `p-2` here and a symmetric `PLOT_MARGIN` below, plus a left gutter
          DERIVED from the widest label that will be printed in it (see
          `gutter`), so nothing on the axis can be clipped by the SVG's own edge
          at any width. */}
      <div
        className={`tabular w-full p-2 ${animate ? 'trend-mount ' : ''}${
          height === 'tall' ? 'h-72 sm:h-80 lg:h-[24rem]' : 'h-72 sm:h-80'
        }`}
        role="img"
        aria-label={
          `Trend chart for ${data.length} result${data.length === 1 ? '' : 's'}. ` +
          `Horizontal rules mark the reference range and the points beyond which a result is significantly out. ${summary}`
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          {/* Equal on three sides; the left is 4 because the axis gutter after
              it is what actually holds the scale, and the lead rules beside the
              bound labels need those 4px so they are not clipped. */}
          <ComposedChart data={rows} margin={{ top: 16, right: 16, left: 4, bottom: 16 }}>
            <defs>
              {/* THE LINE'S OWN GRADIENT — a stop per point, in that point's
                  status colour, at that point's x. Inside <defs> so it is a
                  definition rather than something drawn; it reads the plot area
                  and the x scale, which are only available inside the chart.
                  The band ramps went with the bands; what is here besides is
                  the same gradient at the casing's alpha and one radial falloff
                  per status the points spark in. */}
              <StatusLineGradient id={lineGradientId} points={linePoints} />
              <StatusLineGradient id={lineGlowId} points={linePoints} glow />
              <SparkGradient id={sparkId} />
            </defs>

            <XAxis
              dataKey="t"
              // Real time, not a category per sample — see the note above the
              // domain. Ticks are the sample dates themselves, so every tick
              // marks a real event rather than a round number the patient
              // never had a test on.
              type="number"
              scale="time"
              domain={[tMin, tMax]}
              ticks={times}
              // ISO never reaches an axis. The compact "Aug 26" form is purely
              // for width — the tooltip gives the full "5 August 2026".
              tickFormatter={(t: number) => formatAxisDate(new Date(t).toISOString().slice(0, 10))}
              // Axis labels are numeric data, so they are set in the mono
              // face like every other number in the product — the family comes
              // from the token, never a font name. The tabular figures come
              // from the `tabular` class on the wrapper below, which SVG text
              // inherits; Recharts' tick prop type doesn't carry
              // fontVariantNumeric, and an inline style on every tick would be
              // forty declarations to say one thing.
              tick={{ fontSize: 11, fill: chartTokens.axisText, fontFamily: 'var(--font-mono)' }}
              // ONE GROUND LINE AND NOTHING ELSE — no box, no vertical rules,
              // no gridlines. The four boundary rules are the plot's structure
              // now; a frame around them is a second structure competing with
              // the first, and a grid over them is a third.
              axisLine={{ stroke: chartTokens.axisLine, strokeOpacity: 0.5 }}
              tickLine={false}
              tickMargin={10}
              minTickGap={16}
              // At 375px a 5-point series would otherwise overlap its own
              // labels; Recharts drops ticks rather than letting them collide.
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[domainMin, domainMax]}
              // Round values only, and four of them — see niceTicks. The domain
              // is unchanged by this: an axis label does not get to move a band.
              ticks={yTicks.length > 0 ? yTicks : undefined}
              interval={0}
              tickFormatter={(v: number) => v.toFixed(tickDecimals)}
              tick={{ fontSize: 11, fill: chartTokens.axisText, fontFamily: 'var(--font-mono)' }}
              axisLine={false}
              tickLine={false}
              // Derived from the widest label that will actually be printed —
              // see `gutter`. It was a hard-coded 46, which clips a five-digit
              // threshold and its lead rule.
              width={gutter}
            />

            {/* ── THE FOUR BOUNDARY RULES ─────────────────────────────────
                The whole of what says where the range is, now that there are
                no bands. Two weights, distinguishable without colour:

                  REFERENCE BOUNDS     solid, full weight
                  SIGNIFICANTLY OUT    dashed and lighter

                Per segment rather than one ReferenceLine across the plot, so a
                boundary steps with the period it belongs to. `data-boundary`
                is what e2e/chart-bands.spec.ts measures — the geometry these
                rules describe is the evidence the band rects used to carry. */}
            {bandSegments.flatMap((seg, i) =>
              seg.edges.map((e, j) => (
                <ReferenceLine
                  key={`edge-${i}-${j}`}
                  segment={[
                    { x: seg.x1, y: e.y },
                    { x: seg.x2, y: e.y },
                  ]}
                  stroke={chartTokens.bound}
                  strokeOpacity={e.kind === 'bound' ? chartTokens.boundOpacity : chartTokens.thresholdOpacity}
                  strokeDasharray={e.kind === 'threshold' ? chartTokens.thresholdDashArray.join(' ') : undefined}
                  strokeWidth={chartTokens.boundWidth}
                  ifOverflow="hidden"
                  zIndex={200}
                />
              )),
            )}

            {/* The step. A vertical dashed rule at the x where a reference
                range changed, the full height of the plot, paired with the
                sentence under the chart and its own entry in the key — so the
                change is stated three ways and carried by none of them alone.

                ONE rule per change, at exactly the x the boundary rules either
                side of it step at (both come from `stepBoundaries`), and every
                value describing it is a token — see chart.stepDashArray. The
                same three literals used to be written out here and again in the
                key's swatch, which is two places for one appearance to drift
                apart in.

                It takes `chart.bound` like every other rule on the plot: a
                boundary that carries a hue is a boundary competing with the
                status layer, which is now entirely on the line. */}
            {stepBoundaries.map((x) => (
              <ReferenceLine
                key={`step-${x}`}
                x={x}
                stroke={chartTokens.bound}
                strokeDasharray={chartTokens.stepDashArray.join(' ')}
                strokeWidth={chartTokens.stepWidth}
                strokeOpacity={chartTokens.stepOpacity}
                zIndex={210}
              />
            ))}

            <BoundaryLabels columns={labelColumns} />

            <Tooltip
              content={<ChartTooltip optimal={optimal} />}
              // A guide, not the browser's default crosshair: one vertical
              // hairline at the point being read, in the chart's own neutral,
              // at a weight that does not compete with the line.
              //
              // SOLID, and the reason is the dashed rule below it. A chart
              // whose reference range changed already carries a dashed vertical
              // at the change point, and a dashed cursor differing from it only
              // in its dash pattern is two marks that look the same and mean
              // completely different things — one of them "the laboratory
              // changed your reference range here".
              cursor={{ stroke: chartTokens.cursor, strokeWidth: 1, strokeOpacity: 0.55 }}
            />
            {/* ── THE LINE'S CASING ───────────────────────────────────────
                Three wider strokes of the same path under the line, painted
                with the line's own glow gradient. Spread rather than nested:
                Recharts reads its own children to decide what to draw, so a
                wrapper component would be an unrecognised child and the casing
                would simply not exist. See statusLineCasing in chartParts.tsx,
                which Compare draws its own three from. */}
            {connected && statusLineCasing({ dataKey: 'value', gradientId: lineGlowId, animate })}
            <Line
              /**
               * THE CORE, NAMED — because it is no longer the only
               * `.recharts-line-curve` in the document. e2e/chart-bands.spec.ts
               * and e2e/status-colour.spec.ts both measure the line's weight and
               * its gradient, and a `querySelector` for the bare class would
               * have measured the outermost casing instead: 19px, painted with
               * the glow gradient. A test that silently measures the wrong
               * element is worse than one that fails.
               */
              className="trend-line-core"
              // STRAIGHT SEGMENTS, NEVER A CURVE. `monotone` draws a smooth
              // spline between the points, which is a claim about values
              // between two blood draws that nobody measured — on a series
              // three months apart it invents a shape for the whole quarter.
              // `linear` says only what is known: these results, joined.
              //
              // `connected` gates the whole line, not just its type — a single
              // point and an incomparable series both render as marks only.
              type="linear"
              dataKey="value"
              // THE STATUS, ALONG ITS LENGTH — see StatusLineGradient. It was
              // one flat bronze, on the reasoning that a status hue on the line
              // would imply a verdict on the whole trend; drawn per point and
              // blended between them it says the opposite, which is that the
              // verdict changed where the value did.
              stroke={connected ? `url(#${lineGradientId})` : 'none'}
              // Round caps and joins: a line with mitred corners reads as a
              // plotted path, and a drawn stroke is what the rest of the
              // product's marks are. The WEIGHT is a token and it went to 5
              // with the bands' removal — the line is the whole chart now.
              strokeWidth={chartTokens.lineWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={<SparkDot latestT={tLast} sparkId={sparkId} />}
              activeDot={false}
              isAnimationActive={animate}
              animationDuration={620}
              animationEasing="ease-out"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {rangeChangeNote && (
        <p className="mt-3 text-xs leading-relaxed text-espresso/85">
          The lab’s reference range changed during this period: <span className="numeric">{rangeChangeNote}</span>. Each
          result is shown against the range that applied to it, and the dashed rule marks where the range changed.
        </p>
      )}

      <ChartKey
        statuses={[...new Set(data.map((d) => d.status))]}
        unjoined={!connected && !singlePoint}
        stepped={stepBoundaries.length > 0}
        /**
         * ── A KEY MAY NOT NAME A MARK THE CHART DID NOT DRAW (Aug 2026) ────
         *
         * The two significantly-out thresholds are `ifOverflow="hidden"`, so on
         * a marker whose threshold falls outside the y domain they are clipped
         * away entirely — which is most in-range markers, because the threshold
         * is 1.5× the range WIDTH out from each bound and the domain is padded
         * by 0.3× of it. Measured on Adiponectin (0.5–1.5, domain 0.2–1.8):
         * thresholds at −1.0 and 3.0, neither drawn, and the key said "Where a
         * result becomes significantly out" beside a dashed swatch of nothing.
         *
         * The same rule the step entry already follows, and the same rule this
         * file states about swatches generally.
         */
        hasThresholds={bandSegments.some((seg) =>
          seg.edges.some((e) => e.kind === 'threshold' && e.y > domainMin && e.y < domainMax),
        )}
      />
    </div>
  );
}

/**
 * What the marks mean, in words.
 *
 * Not optional and not decoration. The chart carries status by shape and
 * reinforces it with colour; a shape with no key is a rebus, and a coloured
 * region with no name is the exact "colour alone" failure the rest of this
 * system spends its effort avoiding. Someone who cannot distinguish the green
 * band from the red one reads this list instead and loses nothing.
 *
 * Every phrase here is positional — "above the reference range", not "high
 * risk", not "unhealthy". The chart says where the lab's range sits; it does
 * not offer an opinion on being outside it.
 *
 * EVERY SWATCH IS THE MARK IT STANDS FOR, AT THE SIZE IT IS DRAWN — never a
 * coloured rectangle. The band entries that used to be here are gone entirely:
 * the reference bounds are printed on the axis now, in figures, level with
 * their own hairlines, which is a better answer than a swatch and one a
 * greyscale reader gets in full. See the note on `regions` below.
 */
function ChartKey({
  statuses,
  unjoined,
  stepped,
  hasThresholds,
}: {
  statuses: MarkerStatusInput[];
  /**
   * The points are NOT joined because their sources aren't comparable for this
   * marker. That used to be a paragraph above the chart; it belongs here,
   * beside the marks it describes, because it is a statement about what the
   * marks mean — the same kind of statement as every other entry in this key.
   * False for a first result, which has its own line above the chart: one
   * point has nothing to be unjoined from.
   */
  unjoined: boolean;
  /** The reference range changed partway through, so the dashed rule needs naming. */
  stepped: boolean;
  /** At least one significantly-out threshold is inside the y domain and therefore drawn. */
  hasThresholds: boolean;
}) {
  // Ids are document-global, and this key's swatches carry their own gradient
  // definitions — two charts on one page sharing one id would make the second
  // key's sparks reference the first key's defs.
  const swatchId = `key-${useId().replace(/:/g, '')}`;

  /**
   * TWO COLUMNS, ONE LIST.
   *
   * The key was two stacked rows of wrapping flex items — fine at three
   * entries, and the band vocabulary is five. On the marker page's 60%-width
   * card each entry took a line of its own, so the key ran to eight lines
   * under a chart it is subordinate to.
   *
   * A grid pairs them instead: same entries, same wording, half the height,
   * and the columns line up rather than ragging the way wrapped flex items do.
   * Nothing is dropped and nothing is abbreviated — an entry that is not worth
   * the room is an entry that should not have been drawn on the chart.
   */
  /**
   * ── THE SWATCHES ARE STRETCHES OF LINE, NOT SHAPES (Aug 2026) ────────────
   *
   * Each of these used to be the point's own glyph — a level dot, a chevron, a
   * doubled chevron — at the size the chart drew it. The chart does not draw
   * those any more (every point is the same white spark), so naming them here
   * would be a key to a picture nobody is looking at. That is the one thing a
   * key may never be.
   *
   * What each entry shows now is exactly what the chart DOES draw for that
   * state: a length of the line, at the line's own weight, in that state's own
   * colour. Still not a coloured rectangle — the rule was never "no colour in
   * the key", it was "every swatch is the mark it stands for, at the size it is
   * drawn", and a stretch of line is that mark.
   */
  const marks = statuses.map((s) => (
    <li key={`mark-${s}`} className="flex items-center gap-2">
      <StatusLineSwatch status={s} />
      <span className="min-w-0">{statusLabel(s)}</span>
    </li>
  ));

  /**
   * AND THE POINT ITSELF GETS ONE ENTRY, BECAUSE IT NOW MEANS ONE THING.
   *
   * With five glyphs there were five entries and the mark carried the state.
   * With one uniform spark the mark carries "a result was taken here" and
   * nothing else, which is worth exactly one line — and worth having, because a
   * mark on a chart with no name in the key is a rebus however simple it is.
   */
  const pointEntry = (
    <li key="point" className="flex items-center gap-2">
      <SparkSwatch id={`${swatchId}-point`}>
        <SparkPoint cx={10} cy={10} latest={false} gradientId={`${swatchId}-point`} />
      </SparkSwatch>
      <span className="min-w-0">One result, on the date it was taken</span>
    </li>
  );

  /**
   * NO BAND ENTRIES — and now there are no bands either (Aug 2026).
   *
   * There were five, one per region, each a coloured swatch beside a sentence,
   * and a swatch is exactly what this key is not allowed to be made of. They
   * went when the reference bounds started printing on the axis in figures.
   * The bands themselves have now gone too, so nothing has come back.
   *
   * WHAT IS HERE INSTEAD ARE THE TWO RULES, which is new. With the bands gone
   * the four hairlines carry the whole reference range, and two of them are
   * drawn differently from the other two — so the difference has to be NAMED,
   * in words, beside the mark it describes. That is the same requirement every
   * other entry in this key meets: a mark with no name is a rebus.
   *
   * Every swatch is drawn from the plot's own tokens, so a swatch cannot
   * describe a mark the chart no longer makes.
   */
  const regions = [
    <li key="bound" className="flex items-center gap-2">
      <RuleSwatch kind="bound" />
      <span className="min-w-0">The reference range</span>
    </li>,
    ...(hasThresholds
      ? [
          <li key="threshold" className="flex items-center gap-2">
            <RuleSwatch kind="threshold" />
            <span className="min-w-0">Where a result becomes significantly out</span>
          </li>,
        ]
      : []),
    ...(stepped
      ? [
          <li key="stepped" className="flex items-center gap-2">
            <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true" className="shrink-0">
              <line
                x1="9"
                y1="0"
                x2="9"
                y2="12"
                stroke={chartTokens.bound}
                strokeWidth={chartTokens.stepWidth}
                strokeDasharray={chartTokens.stepDashArray.join(' ')}
                strokeOpacity={chartTokens.stepOpacity}
              />
            </svg>
            <span className="min-w-0">Where the reference range changed</span>
          </li>,
        ]
      : []),
  ];

  return (
    <div className="mt-4 border-t border-taupe pt-3 text-xs text-espresso/80">
      <ul className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        {marks}
        {pointEntry}
        {regions}
      </ul>
      {/* Full width rather than in a column: it is a sentence, not a label, and
          a sentence in a half-width column wraps to four lines and undoes the
          saving the grid just made. */}
      {unjoined && (
        <p className="mt-2 flex items-start gap-2">
          {/* Three sparks with no line between them, which is the picture being
              described. `chartTokens.point` was the bronze the line used to be;
              the points are white beads now and the swatch has to be made of
              what the chart draws — halo included, or it is invisible on a
              light card. See SparkSwatch. */}
          <span className="mt-0.5 shrink-0">
            <SparkSwatch id={`${swatchId}-unjoined`}>
              <SparkPoint cx={4} cy={10} latest={false} gradientId={`${swatchId}-unjoined`} />
              <SparkPoint cx={10} cy={10} latest={false} gradientId={`${swatchId}-unjoined`} />
              <SparkPoint cx={16} cy={10} latest={false} gradientId={`${swatchId}-unjoined`} />
            </SparkSwatch>
          </span>
          <span>Separate points, not joined: these came from sources that aren’t comparable for this marker</span>
        </p>
      )}
    </div>
  );
}
