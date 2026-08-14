import { useEffect, useId, useState } from 'react';
import {
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
} from 'recharts';
import {
  asMarkerStatus,
  chart as chartTokens,
  statusPaint,
  hueTint,
  severityThresholdFor,
  referenceRangePeriods,
  periodStepBoundaries,
  formatOptimalRange,
  formatReferenceBound,
  formatReferenceRange,
  formatDate,
  type MarkerStatus,
  type MarkerStatusInput,
  type OptimalRangeDTO,
} from '@aspire-bloods/shared';
import { formatAxisDate } from '../../lib/patientPortal';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { statusColor, statusLabel } from '../../lib/markerCopy';

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
 * A calendar date as an epoch value, for a time-scaled axis.
 *
 * Read as UTC midnight deliberately: a sample date is a calendar date, not an
 * instant, and parsing it in local time shifts it a day west of Greenwich —
 * the same reason packages/shared/format.ts reads the parts directly.
 */
function epochOf(sampleDate: string): number {
  return Date.parse(`${sampleDate.slice(0, 10)}T00:00:00Z`);
}

const DAY_MS = 86_400_000;

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
 * Status as a shape, not a hue.
 *
 * Direction is legible at 10px and survives greyscale, a colour-blind reader
 * and a printed page — none of which a fill colour does. Severity is the
 * doubled mark, the same doubled-chevron idea the status badges use, so the
 * vocabulary is one vocabulary across the product.
 */
const STATUS_SHAPE: Record<MarkerStatus, 'circle' | 'up' | 'down' | 'double-up' | 'double-down'> = {
  IN_RANGE: 'circle',
  HIGH: 'up',
  LOW: 'down',
  SIGNIFICANT_HIGH: 'double-up',
  SIGNIFICANT_LOW: 'double-down',
};

/**
 * A point's own state's colour — the same green/gold/red family the band under
 * it uses, several steps stronger. It is the mark's OUTLINE rather than its
 * fill; see StatusMark.
 */
function markFill(status: MarkerStatus): string {
  return statusPaint(status).mark;
}

/**
 * A POINT IS A SHAPE STROKED IN ITS OWN STATUS COLOUR, FILLED WITH THE CARD.
 *
 * The fill is what makes the line pass visibly BEHIND the point rather than
 * stopping at it, so it has to be the colour the ground would be with nothing
 * drawn there — which, with the plot panel gone, is the card in each theme
 * (`chart.surface`). It was the light plot's own off-white, which on a dark
 * card would now paint a pale halo round every mark.
 *
 * ── ONE COLOUR IN ALL THREE PLACES NOW (Aug 2026) ──────────────────────────
 *
 * The same glyph is drawn on the chart, in the tooltip and in the key, and it
 * used to need TWO colours: `--c-hue-*-mark` was solved against the BANDS and
 * measured 1.28:1 on a card, so the key's triangles were invisible and had to
 * borrow the status TEXT colour instead. With the bands gone that token is
 * solved against the card itself, which is the surface all three instances
 * stand on — so the `surface` parameter and the second lookup are both gone.
 *
 * `paintOrder: stroke` still applies and still for the reason below: a stroke
 * straddles its path, and on a 5px triangle that eats half the shape from the
 * inside.
 */
function StatusMark({
  cx,
  cy,
  status,
  size = 1,
  ring = 1,
  hollow = false,
}: {
  cx: number;
  cy: number;
  status: MarkerStatusInput;
  size?: number;
  /** The VISIBLE width of the outline, in pixels — see paintOrder below. */
  ring?: number;
  /** The key and the tooltip, where the shape sits on a surface that already shows through it. */
  hollow?: boolean;
}) {
  const known = asMarkerStatus(status);
  // No status, no mark. Every shape here — level dot, triangle, doubled
  // triangle — is a claim about where the value sits, and that is precisely
  // what is unknown. Unreachable once the series is filtered below; stated so
  // the lookup cannot be the thing that throws.
  if (!known) return null;
  const r = 5 * size;
  const common = {
    fill: hollow ? 'transparent' : chartTokens.surface,
    stroke: markFill(known),
    // Doubled, because `paint-order: stroke` draws the outline FIRST and then
    // fills over its inner half — so half of the declared width is what shows.
    strokeWidth: ring * 2,
    strokeLinejoin: 'round' as const,
    /**
     * THE OUTLINE GOES OUTSIDE THE MARK, NOT THROUGH IT.
     *
     * An SVG stroke straddles its path, so a 1.5px stroke on a 5px triangle
     * eats about half the triangle's own area from the inside — and that is not
     * a theoretical amount. A circle survives it (its area grows with r²); a
     * triangle at the same r has under half the area and does not.
     */
    paintOrder: 'stroke' as const,
  };
  const shape = STATUS_SHAPE[known];

  if (shape === 'circle') return <circle cx={cx} cy={cy} r={r} {...common} />;

  const up = shape === 'up' || shape === 'double-up';
  const tri = (offset: number) =>
    up
      ? `${cx},${cy - r - offset} ${cx + r},${cy + r * 0.6 - offset} ${cx - r},${cy + r * 0.6 - offset}`
      : `${cx},${cy + r + offset} ${cx + r},${cy - r * 0.6 + offset} ${cx - r},${cy - r * 0.6 + offset}`;

  if (shape === 'up' || shape === 'down') return <polygon points={tri(0)} {...common} />;

  // Significant: two stacked triangles, pointing the same way.
  return (
    <g>
      <polygon points={tri(r * 0.75)} {...common} />
      <polygon points={tri(-r * 0.55)} {...common} />
    </g>
  );
}

/**
 * THE MOST RECENT POINT IS THE ONE THE READER CAME FOR.
 *
 * Every point on this chart used to be drawn at exactly the same size, which
 * makes the series read as a set of equally interesting facts. It isn't: the
 * history is context for the latest result, in the same way the bands are
 * context for the line. So the last point is larger and carries a soft halo of
 * its own colour, and the ones behind it are smaller and quieter.
 *
 * Nothing about the SHAPE layer changes with the size — a triangle at 0.82 is
 * the same triangle, and the tooltip and the key say the same words about it.
 */
function CustomDot(props: { cx?: number; cy?: number; payload?: PlottedPoint; latestT?: number }) {
  const { cx, cy, payload, latestT } = props;
  if (cx == null || cy == null || !payload) return null;
  const known = asMarkerStatus(payload.status);
  const latest = payload.t === latestT;
  return (
    <g>
      {latest && known && (
        <circle cx={cx} cy={cy} r={13} fill={markFill(known)} fillOpacity={chartTokens.haloOpacity} />
      )}
      {/* Invisible circle widens the touch/click target well past the visible marker — the
          visible mark stays small and precise, the tappable area doesn't. */}
      <circle cx={cx} cy={cy} r={16} fill="transparent" />
      <StatusMark cx={cx} cy={cy} status={payload.status} size={latest ? 1.2 : 0.9} ring={latest ? 2.4 : 1.8} />
    </g>
  );
}

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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE LINE CARRIES THE STATUS ALONG ITS OWN LENGTH (Aug 2026).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The line used to be one flat bronze and the BANDS carried the traffic light.
 * That put the loudest thing on the plot behind the data — in dark, measurably
 * so: the out-of-range band stood 4.74:1 off the plot panel while the line
 * cleared it at 3.05, so the context was louder than the content in the theme
 * most people read in.
 *
 * So it is inverted. Each point's own status colour is a stop on ONE gradient
 * laid across the plot in user space, positioned at that point's own x. Between
 * two points the browser interpolates, which is exactly the claim the chart is
 * entitled to make: the colour changes gradually between two draws because the
 * VALUE changed gradually between them, and a segment that crosses a reference
 * bound blends across it rather than stepping at it. A hard colour step would
 * assert that the crossing happened at a particular moment, and nobody measured
 * that moment.
 *
 * USER SPACE, NOT `objectBoundingBox`. A gradient in bounding-box units is
 * relative to the PATH's own box, so it would rescale whenever the series' x
 * extent changed and the stops would no longer be at the points. In user space
 * the offsets are the plot's own pixels and a stop lands exactly on its point.
 *
 * THE COLOURS ARE THE POINT MARKS' OWN (`markFill`), so the line arrives at each
 * mark in precisely that mark's colour rather than in a near-miss of it. That
 * is also what made the band re-solve necessary rather than optional: these
 * colours have to clear EVERY band now, because a gold segment crosses the
 * green band on its way up. Measured against the old bands the worst pair was
 * 1.10:1 — see MARK_SHIFT in tokens.ts.
 *
 * A SINGLE-POINT series has nothing to interpolate; the gradient still resolves
 * (two identical stops) and no line is drawn anyway.
 */
function StatusLineGradient({ id, points }: { id: string; points: PlottedPoint[] }) {
  const plot = usePlotArea();
  const xScale = useXAxisScale();
  if (!plot || !xScale) return null;

  const at = (p: PlottedPoint): number | null => {
    const x = xScale(p.t);
    return x == null || !Number.isFinite(x) ? null : (x as number);
  };

  const stops: { x: number; colour: string }[] = [];
  for (const [i, p] of points.entries()) {
    const known = asMarkerStatus(p.status);
    const x = at(p);
    if (known && x !== null) stops.push({ x, colour: markFill(known) });

    /**
     * ── AND THE LINE TRAVELS THROUGH EVERY REGION IT ACTUALLY PASSES ───────
     *
     * Endpoint stops alone are correct and ugly, and the ugliness is a real
     * failure rather than a taste: a segment from an in-range result to a
     * significantly-high one interpolates GREEN straight to RED in sRGB, which
     * passes through a muddy olive-brown at its midpoint — a colour that is in
     * neither state and belongs to no part of the vocabulary.
     *
     * The value between two draws does not jump from in-range to significantly
     * high; it passes THROUGH above-range on the way. So the line does too.
     *
     * ── AND "THROUGH" MEANS THE REGIONS, NOT ONLY THE BOUNDARIES (Aug 2026) ─
     *
     * The first version of this added a stop at each boundary CROSSING, in that
     * boundary's own hinge colour. That is right for a segment that stops in
     * the next region along and wrong for one that crosses a region entirely,
     * which is the case a reader is most likely to be looking at.
     *
     * MEASURED, on the demo patient's AFP (range 125–375): 429 down to 65, a
     * segment that passes through the WHOLE of the reference range. The
     * crossings gave gold → olive(375) → olive(125) → gold, so a line spending
     * most of its length inside the range never once read green — on the one
     * marker page where a patient is looking at exactly that.
     *
     * So each segment is walked as a sequence of WAYPOINTS: the two endpoints
     * and every boundary between them, in order. Each boundary gets its hinge
     * colour AT the crossing, and each stretch BETWEEN two waypoints gets the
     * colour of whatever region it is in, at its own midpoint. AFP now reads
     * gold → olive → green → olive → gold, which is the journey the value took.
     *
     * The segment takes the FIRST point's geometry, which is the same rule the
     * periods follow: where a reference range changed between two draws we know
     * it changed between them and not when, so the earlier one is what the
     * segment is read against.
     */
    const next = points[i + 1];
    if (!next) continue;
    const x2 = at(next);
    const v1 = p.value;
    const v2 = next.value;
    if (x === null || x2 === null || !Number.isFinite(v1) || !Number.isFinite(v2) || v1 === v2) continue;
    const threshold = severityThresholdFor(p.referenceLow, p.referenceHigh, p.severityThreshold);

    /** Which of the three hues a value sits in, on THIS segment's geometry. */
    const hueAt = (value: number): string => {
      if (value < p.referenceLow - threshold || value > p.referenceHigh + threshold) return hueTint.red.mark;
      if (value < p.referenceLow || value > p.referenceHigh) return hueTint.yellow.mark;
      return hueTint.green.mark;
    };

    const boundaries: [number, string][] = [
      [p.referenceLow - threshold, hueTint.orange.mark],
      [p.referenceLow, hueTint.olive.mark],
      [p.referenceHigh, hueTint.olive.mark],
      [p.referenceHigh + threshold, hueTint.orange.mark],
    ];
    // Every boundary strictly between the two values, as a fraction along the
    // segment. Strict, so a point sitting exactly ON a bound does not get a
    // second stop at its own x fighting its own colour.
    const crossed = boundaries
      .filter(([bound]) => Number.isFinite(bound) && (v1 - bound) * (v2 - bound) < 0)
      .map(([bound, colour]) => ({ ratio: (bound - v1) / (v2 - v1), value: bound, colour }))
      .sort((a, b) => a.ratio - b.ratio);

    // The waypoints, in order along the segment: start, each crossing, end.
    const waypoints = [
      { ratio: 0, value: v1 },
      ...crossed.map((c) => ({ ratio: c.ratio, value: c.value })),
      { ratio: 1, value: v2 },
    ];
    for (const c of crossed) stops.push({ x: x + (x2 - x) * c.ratio, colour: c.colour });
    for (const [w, from] of waypoints.entries()) {
      const to = waypoints[w + 1];
      if (!to) continue;
      // The stretch between two waypoints is entirely inside one region, so its
      // midpoint names it. Skipped for the two OUTER stretches, whose colour is
      // already the endpoint's own status — restating it would be a second stop
      // in the same colour at very nearly the same x.
      if (w === 0 || w === waypoints.length - 2) continue;
      const midRatio = (from.ratio + to.ratio) / 2;
      stops.push({ x: x + (x2 - x) * midRatio, colour: hueAt((from.value + to.value) / 2) });
    }
  }

  stops.sort((a, b) => a.x - b.x);
  if (stops.length === 0) return null;

  return (
    <linearGradient
      id={id}
      gradientUnits="userSpaceOnUse"
      x1={plot.x}
      y1={0}
      x2={plot.x + plot.width}
      y2={0}
    >
      {/* Before the first point and after the last the line does not exist, so
          the end stops simply hold the first and last colours — anything else
          would be inventing a colour for a stretch of plot with no line on it. */}
      <stop offset={0} stopColor={stops[0].colour} />
      {stops.map((s, i) => (
        <stop
          key={i}
          offset={Math.max(0, Math.min(1, (s.x - plot.x) / (plot.width || 1)))}
          stopColor={s.colour}
        />
      ))}
      <stop offset={1} stopColor={stops[stops.length - 1].colour} />
    </linearGradient>
  );
}

/**
 * ALL FOUR BOUNDARIES, LABELLED ON THE AXIS — AND EVERY PERIOD'S, NOT JUST THE
 * LAST ONE'S.
 *
 * A boundary line with no number on it sends the reader to the key to find out
 * what it is, and the key cannot tell them — it can say "the reference range"
 * but not "3.5 to 5.3". With the bands gone these lines are the ONLY thing
 * saying where the range is, so the figures matter more than they ever did.
 *
 * ── FOUR NOW, NOT TWO (Aug 2026) ───────────────────────────────────────────
 *
 * The two significantly-out thresholds used to be drawn and left unlabelled,
 * on the reasoning that the bands beyond them said what they meant. They do
 * not exist. So each threshold prints its own value as well.
 *
 * THREE KINDS OF LABEL IN ONE GUTTER, and each is told apart by a MARK rather
 * than a hue — a coloured axis label would be the status layer leaking into the
 * furniture:
 *
 *     tick value      muted ink, no rule        where the scale is marked
 *     reference bound full ink, SOLID lead rule the lab's own range
 *     threshold       full ink, DASHED lead rule where significantly-out starts
 *
 * Each lead rule matches its own line's dash, so the label is attached to the
 * boundary it names rather than merely level with one.
 *
 * ONLY THE CURRENT PERIOD'S GO ON THE AXIS, because the axis has one left-hand
 * gutter and a marker whose range has changed has two sets. The earlier periods
 * keep their labels at the right-hand end of their OWN extent, just inside their
 * step rule — the only place they can go and still say which period they are.
 */
interface BoundLabel {
  value: number;
  text: string;
  kind: 'bound' | 'threshold';
}
interface LabelColumn {
  /** Where this period ends, in the x domain. Null for the last one, which is labelled on the axis. */
  endsAt: number | null;
  bounds: BoundLabel[];
}

/** Roughly how wide this text is at 11px in the mono face — enough to know whether it fits. */
function labelWidth(text: string): number {
  return text.length * 6.6;
}

/**
 * HOW MUCH ROOM THE LEFT GUTTER NEEDS, from the widest thing that will be
 * printed in it — and this is what stops an axis label being clipped.
 *
 * It was a hard-coded 46, which is fine for "4.2" and not fine for "1400" with
 * a lead rule and a gap in front of it. The widest label plus the rule, the gap
 * and a little air; clamped so a pathological value cannot eat the plot.
 */
function axisGutter(texts: string[]): number {
  const widest = texts.reduce((most, t) => Math.max(most, labelWidth(t)), 0);
  return Math.min(96, Math.max(46, Math.ceil(widest) + 18));
}

function BoundaryLabels({ columns }: { columns: LabelColumn[] }) {
  const plot = usePlotArea();
  const yScale = useYAxisScale();
  const xScale = useXAxisScale();
  if (!plot || !yScale) return null;
  return (
    <g aria-hidden="true">
      {columns.map((column, ci) => {
        // Collisions are resolved per COLUMN. Two labels a few pixels apart in
        // the same column overlap into an unreadable smudge; the same two in
        // different columns are metres apart on screen and both fine.
        //
        // The BOUNDS are placed before the thresholds (see the caller's order),
        // so where the two collide it is the threshold that is dropped. That is
        // the right way round: the reference range is what the chart is about.
        const placed: number[] = [];
        const onAxis = column.endsAt === null;
        const endX = onAxis ? null : xScale?.(column.endsAt as number);
        if (!onAxis && (endX == null || !Number.isFinite(endX))) return null;
        return (
          <g key={`bounds-${ci}`}>
            {column.bounds.map(({ value, text, kind }) => {
              const y = yScale(value);
              if (y == null || !Number.isFinite(y)) return null;
              if (y < plot.y || y > plot.y + plot.height) return null;
              if (placed.some((other) => Math.abs(other - y) < 12)) return null;
              // A period too narrow to hold its own label goes unlabelled rather
              // than printing over its neighbour's. The sentence below the chart
              // still names every range and its dates, which is why this can be
              // dropped without losing the fact.
              if (!onAxis && (endX as number) - labelWidth(text) - 4 < plot.x) return null;
              placed.push(y);
              const threshold = kind === 'threshold';
              return (
                <g key={`${kind}-${text}`} data-boundary-label={kind} data-value={value}>
                  {/* The lead rule, in the same dash as the line it points at. */}
                  {onAxis && (
                    <line
                      x1={plot.x - 6}
                      y1={y}
                      x2={plot.x}
                      y2={y}
                      stroke={chartTokens.boundLabel}
                      strokeWidth={1}
                      strokeOpacity={threshold ? chartTokens.thresholdOpacity : 1}
                      strokeDasharray={threshold ? chartTokens.thresholdDashArray.join(' ') : undefined}
                      shapeRendering="crispEdges"
                    />
                  )}
                  <text
                    x={onAxis ? plot.x - 10 : (endX as number) - 4}
                    y={y}
                    dy="0.32em"
                    textAnchor="end"
                    fontSize={11}
                    fontFamily="var(--font-mono)"
                    fill={chartTokens.boundLabel}
                    fillOpacity={threshold ? chartTokens.thresholdOpacity : 1}
                  >
                    {text}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

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
          colour rather than content sitting in it, and it still leads with the
          mark's shape — so it reads identically with the colour removed. */}
      <p className="mt-2 flex items-center gap-1.5 font-medium" style={{ color: statusColor(point.status) }}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <StatusMark cx={6} cy={6} status={point.status} size={0.9} hollow />
        </svg>
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
   * ── 28rem, UP FROM 22 (Aug 2026) ─────────────────────────────────────────
   *
   * It ran to 30rem once and was cut to 22, because the chart card sets the
   * height of its row and therefore of the card beside it, and 480px of plot
   * pushed the pair past the fold on a 900px laptop. That budget has been given
   * back by the LEFT card: the lab reference range line, the optimal line and
   * the source label all came off it (items 10 and 16), which is about 66px,
   * and the "Marker detail" standfirst came off the page header above.
   *
   * 28rem is what those removals buy, spent on the thing the page is for, and
   * it is MEASURED rather than chosen: at 1440 × 900 the pair now ends at 812
   * of 900 with the page header still above it (it was 821 at 22rem, because
   * the LEFT card was what set the row height then and it has since lost three
   * lines). 30rem ends at 876, which fits and leaves no room for a longer
   * marker name, so this is one step back from the edge.
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
          height === 'tall' ? 'h-72 sm:h-[22rem] lg:h-[28rem]' : 'h-72 sm:h-80'
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
                  It is the only gradient left on this chart: the band ramps
                  went with the bands. */}
              <StatusLineGradient id={lineGradientId} points={rows} />
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
            <Line
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
              dot={<CustomDot latestT={tLast} />}
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
  const marks = statuses.map((s) => (
    <li key={`mark-${s}`} className="flex items-center gap-2">
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
        <StatusMark cx={7} cy={7} status={s} size={0.85} ring={2} hollow />
      </svg>
      <span className="min-w-0">{statusLabel(s)}</span>
    </li>
  ));

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
      <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true" className="shrink-0">
        <line x1="0" y1="6" x2="18" y2="6" stroke={chartTokens.bound} strokeWidth={chartTokens.boundWidth} />
      </svg>
      <span className="min-w-0">The reference range</span>
    </li>,
    ...(hasThresholds
      ? [
    <li key="threshold" className="flex items-center gap-2">
      <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true" className="shrink-0">
        <line
          x1="0"
          y1="6"
          x2="18"
          y2="6"
          stroke={chartTokens.bound}
          strokeWidth={chartTokens.boundWidth}
          strokeDasharray={chartTokens.thresholdDashArray.join(' ')}
          strokeOpacity={chartTokens.thresholdOpacity}
        />
      </svg>
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
        {regions}
      </ul>
      {/* Full width rather than in a column: it is a sentence, not a label, and
          a sentence in a half-width column wraps to four lines and undoes the
          saving the grid just made. */}
      {unjoined && (
        <p className="mt-2 flex items-start gap-2">
          <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true" className="mt-0.5 shrink-0">
            <circle cx="3" cy="6" r="2" fill={chartTokens.point} />
            <circle cx="9" cy="6" r="2" fill={chartTokens.point} />
            <circle cx="15" cy="6" r="2" fill={chartTokens.point} />
          </svg>
          <span>Separate points, not joined: these came from sources that aren’t comparable for this marker</span>
        </p>
      )}
    </div>
  );
}
