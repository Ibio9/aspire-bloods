import { useEffect, useId, useState } from 'react';
import {
  Area,
  ComposedChart,
  Line,
  ReferenceArea,
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
  bandLabel,
  chart as chartTokens,
  statusBands,
  statusPaint,
  bandPlotStops,
  bandWeight,
  BAND_WEIGHT,
  severityThresholdFor,
  formatOptimalRange,
  formatReferenceBound,
  formatReferenceRange,
  sameReferenceRange,
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
 *  - Say anything evaluative. The bands show where the lab's reference range
 *    sits and nothing more. None of them is labelled good, healthy, bad,
 *    concerning or danger, and none ever will be.
 *
 * WHAT THE BANDS ARE. The reference range renders as a soft green region.
 * Immediately above and below it, yellow. Beyond the point where the status
 * itself changes to significantly out, red — with orange as the transition
 * between the two, which is the whole of orange's job here and is never a
 * state a result can be in. Every one of those boundaries is derived from THAT
 * point's own reference range and severity threshold: a marker whose range is
 * 20–42 gets bands sized for 20–42, and the band a value falls in is always
 * the band its own status says it is in. Nothing here is a fixed scale.
 *
 * ------------------------------------------------------------------------
 * THE BANDS ARE CONTEXT AND THE LINE IS CONTENT (redesigned Aug 2026)
 * ------------------------------------------------------------------------
 *
 * They used to be four opaque, saturated slabs spanning the plot edge to edge,
 * each meeting the next at a hard step, with a near-solid rule drawn over every
 * boundary and a thin line somewhere behind it all. Everything anybody disliked
 * about this chart followed from that one thing: at equal weight and full
 * strength, five regions of colour ARE the picture, and the reader's own result
 * is a detail on top of them. It read as a fill tool rather than as shading.
 *
 * Four changes, and they are one change:
 *
 *  1. WEIGHT. A band is composited at `BAND_WEIGHT` (statusBands.ts) rather
 *     than painted at full strength, and the five weights are unequal: in range
 *     carries almost nothing, out-of-range a little, significantly-out a little
 *     more. The reader meets the line first.
 *  2. FALLOFF. Each band fades out over `bandEdgeFade` of its own height at
 *     both ends, so it reads as a region rather than as a block. What used to
 *     be a hard step between two saturated fields is now two soft edges with a
 *     hairline between them.
 *  3. HAIRLINES. The boundaries are 1px strokes at low opacity — and the
 *     reference bounds are LABELLED INLINE at the right edge of the plot, so
 *     "where does my range actually start" is answered on the chart instead of
 *     in the key.
 *  4. AXES. Round tick values only, four of them, no gridlines, no box.
 *
 * WHY THAT IS STILL SAFE. Colour is the last thing carrying status, never the
 * first — and softening it takes nothing away from the layers that do. The
 * point's SHAPE still says it (level dot, triangle, doubled triangle), the
 * tooltip still says it in words, every band still carries a visible boundary
 * line, and the key below still names every band and every mark in text. Turn
 * the whole thing greyscale and nothing is lost, which matters most for exactly
 * this pair, since red and green are the commonest confusion there is.
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

/** Low to high, which is the order the bands stack in and the key lists them. */
const BAND_ORDER: MarkerStatus[] = ['SIGNIFICANT_LOW', 'LOW', 'IN_RANGE', 'HIGH', 'SIGNIFICANT_HIGH'];

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
  sourceLabel?: string;
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
 * A point takes its own state's colour — the same green/yellow/red the band
 * under it uses, several steps stronger so it reads as a mark ON the band
 * rather than a patch of it. It reinforces the shape; it never replaces it.
 */
function markFill(status: MarkerStatus): string {
  return statusPaint(status).mark;
}

/**
 * A mark, ringed in the card's own surface colour.
 *
 * The ring is what makes the line appear to pass BEHIND the point rather than
 * to stop at it — it is the colour the plot would be if nothing were drawn
 * there, so the two or three pixels around the mark read as a gap in the line
 * rather than as a halo drawn on top of one.
 */
function StatusMark({
  cx,
  cy,
  status,
  size = 1,
  ring = 1,
}: {
  cx: number;
  cy: number;
  status: MarkerStatusInput;
  size?: number;
  /** The VISIBLE width of the ring, in pixels — see paintOrder below. */
  ring?: number;
}) {
  const known = asMarkerStatus(status);
  // No status, no mark. Every shape here — level dot, triangle, doubled
  // triangle — is a claim about where the value sits, and that is precisely
  // what is unknown. Unreachable once the series is filtered below; stated so
  // the lookup cannot be the thing that throws.
  if (!known) return null;
  const fill = markFill(known);
  const r = 5 * size;
  const common = {
    fill,
    stroke: chartTokens.pointRing,
    // Doubled, because `paint-order: stroke` draws the ring FIRST and then
    // fills over its inner half — so half of the declared width is what shows.
    strokeWidth: ring * 2,
    strokeLinejoin: 'round' as const,
    /**
     * THE RING GOES OUTSIDE THE MARK, NOT THROUGH IT.
     *
     * An SVG stroke straddles its path, so a 1.5px ring on a 5px triangle eats
     * about half the triangle's own area from the inside — and that is not a
     * theoretical amount. The below-range marks on this chart were rendering as
     * white triangles with a thin gold edge: the shape was right, the colour
     * was right, and what you actually saw was the ring. A circle survives it
     * (its area grows with r²); a triangle at the same r has under half the
     * area and does not.
     *
     * `paint-order: stroke` puts the stroke down first and the fill on top of
     * it, so the mark keeps its full size and the ring is entirely outside.
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
      <StatusMark cx={cx} cy={cy} status={payload.status} size={latest ? 1.2 : 0.9} ring={latest ? 2.2 : 1.6} />
    </g>
  );
}

/**
 * THE REFERENCE BOUNDS, LABELLED WHERE THEY ARE — AND EVERY PERIOD'S, NOT JUST
 * THE LAST ONE'S.
 *
 * A boundary line with no number on it sends the reader to the key to find out
 * what it is, and the key cannot tell them — it can say "the reference range"
 * but not "3.5 to 5.3". Printing the values level with their own lines answers
 * it in place; it is also what lets the band entries in the key stop being the
 * only place the range is stated.
 *
 * It used to print the LAST period's two bounds and nothing else, on the
 * reasoning that the right edge of the plot is the last period's territory. That
 * is true of the right edge and false of the chart: on a marker whose range
 * changed partway through, the earlier results sat inside a band whose bounds
 * were the one thing on screen that did not say what they were, so the reader
 * could see that the range had stepped and could not read what it stepped FROM
 * without going to the sentence below the chart.
 *
 * So each period is labelled at the right-hand end of its OWN extent: the last
 * one in the margin outside the plot, as before, and every earlier one just
 * inside its own step rule, right-aligned against it. Same face, same size, same
 * colour; only the anchor differs, because one is outside the plot and the rest
 * are in it.
 */
interface BoundLabel {
  value: number;
  text: string;
}
interface LabelColumn {
  /** Where this period ends, in the x domain. Null for the last one, which ends at the plot edge. */
  endsAt: number | null;
  bounds: BoundLabel[];
}

/** Roughly how wide this text is at 11px in the mono face — enough to know whether it fits. */
function labelWidth(text: string): number {
  return text.length * 6.6;
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
        const placed: number[] = [];
        const outside = column.endsAt === null;
        const endX = outside ? null : xScale?.(column.endsAt as number);
        if (!outside && (endX == null || !Number.isFinite(endX))) return null;
        return (
          <g key={`bounds-${ci}`}>
            {column.bounds.map(({ value, text }) => {
              const y = yScale(value);
              if (y == null || !Number.isFinite(y)) return null;
              if (y < plot.y || y > plot.y + plot.height) return null;
              if (placed.some((other) => Math.abs(other - y) < 12)) return null;
              // A period too narrow to hold its own label goes unlabelled rather
              // than printing over its neighbour's band. The sentence below the
              // chart still names every range and its dates, which is why this
              // can be dropped without losing the fact.
              if (!outside && (endX as number) - labelWidth(text) - 4 < plot.x) return null;
              placed.push(y);
              return (
                <text
                  key={text}
                  x={outside ? plot.x + plot.width + 7 : (endX as number) - 4}
                  y={y}
                  dy="0.32em"
                  textAnchor={outside ? 'start' : 'end'}
                  fontSize={11}
                  fontFamily="var(--font-mono)"
                  fill={chartTokens.axisText}
                >
                  {text}
                </text>
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
    // A CARD, not a browser tooltip: the product's own surface, hairline and
    // warm espresso-derived shadow, at the popover level so it reads as lifted
    // off the chart rather than drawn on it.
    <div className="min-w-[11rem] rounded-card border border-taupe bg-cream-50 px-4 py-3 text-xs shadow-popover">
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
          <StatusMark cx={6} cy={6} status={point.status} size={0.9} />
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
      {point.sourceLabel && <p className="mt-1 text-espresso/80">{point.sourceLabel}</p>}
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
   * It used to run to 30rem at lg, which is where the marker page stopped
   * fitting on a 900px screen — the chart card sets the height of the row and
   * therefore of the card beside it, so 480px of plot plus the eyebrow, the key
   * and the padding pushed the pair past the fold on the exact laptop most
   * patients read this on. 22rem is the plot area at which a 60%-width card
   * still reads wider than it is tall (roughly 640×352 at 1440), which is the
   * proportion that was actually being protected. The pair clears a 1280 × 800 laptop as well, but the height that binds there is the LEFT card, not this one: see PREVIOUS_SHOWN.
   */
  height?: 'default' | 'tall';
}) {
  const reducedMotion = useReducedMotion();
  // Pattern ids are document-global; two marker charts on one page sharing an
  // id would make the second one's band reference the first one's pattern.
  const uid = useId().replace(/:/g, '');
  const hatchId = `optimal-hatch-${uid}`;
  const gradId = `band-${uid}`;
  const areaId = `trend-area-${uid}`;

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
  // Never below zero for a marker that cannot be negative. Padding used to
  // push a ferritin axis down to -96, which was a harmless empty gutter when
  // the plot area was blank and is not harmless now that the area is shaded:
  // it would draw a "significantly below range" band across a region no
  // result can ever occupy.
  const nonNegative = Math.min(...allLows, ...values) >= 0;
  const domainMin = nonNegative ? Math.max(0, rawMin) : rawMin;
  const domainMax = Math.max(...allHighs, ...values) + domainPad;

  /**
   * THE BANDS ARE DRAWN PER PERIOD, NOT PER POINT — and that distinction is
   * the whole of what was wrong here.
   *
   * A band was previously drawn for every row, running from that row's own x
   * to the next row's. Two consequences, both bad:
   *
   *  - A series on ONE reference range was drawn as N abutting copies of the
   *    same band. Harmless to look at, but it is N times the geometry for one
   *    fact, and it is what hid the second consequence.
   *  - The LAST row's band ran from its own x to tMax — which is the padding
   *    gutter, ~6% of the plot. So a marker whose range changed on the most
   *    recent result had that new range drawn as a 24px vertical sliver
   *    against a 510px plot, stacked beside the final point. Measured, on
   *    Fasting Insulin (2–25, 2–25, then 2–10): segment widths 235, 187, 24.
   *    Nothing on screen said the range had changed, so the sliver read as a
   *    rendering fault rather than as the fact it was standing for.
   *
   * Now: consecutive results sharing a reference range are ONE period, and a
   * period gets ONE band set. One range across the series therefore means one
   * segment spanning the whole plot, which is what "no step" should look like.
   *
   * WHERE THE STEP GOES. Midway between the last sample on the old range and
   * the first on the new one. We know the range changed between those two
   * draws and not when, so the midpoint is the only honest x for it — and it
   * also guarantees every period is at least half a sampling gap wide, which
   * is what makes a sliver impossible even when the change lands on the final
   * result. Anchoring the step ON the new point is what produced the gutter.
   *
   * WHETHER THE RANGE CHANGED AT ALL is `sameReferenceRange` (statusBands.ts)
   * and not a float compare, because the bounds arriving here have been through
   * a unit conversion. A fasting glucose reported as 3.9–5.5 mmol/L and then as
   * 70–99 mg/dL is ONE range written twice, and 99/18.0182 = 5.494444506110488
   * is not float-equal to 5.5 — so the chart stepped, drew the dashed rule, named
   * the change in the key, and printed a sentence claiming the laboratory had
   * changed a range it had not touched. Identity is now decided at the precision
   * the range is printed at, so a step exists exactly when the two printed ranges
   * differ. The BAND GEOMETRY still uses the exact numbers the server sent (the
   * period takes its first row's), so no band edge moves to suit a rounding.
   */
  const periods: {
    rows: PlottedPoint[];
    low: number;
    high: number;
    threshold: number;
  }[] = [];
  for (const point of rows) {
    const open = periods[periods.length - 1];
    if (open && sameReferenceRange(open, { low: point.referenceLow, high: point.referenceHigh })) {
      open.rows.push(point);
    } else {
      periods.push({
        rows: [point],
        low: point.referenceLow,
        high: point.referenceHigh,
        // From the period's own bounds, so it is one number for the whole
        // period rather than one per row that happens to agree.
        threshold: severityThresholdFor(point.referenceLow, point.referenceHigh, point.severityThreshold),
      });
    }
  }

  /** One x per change of range, midway between the two samples it happened between. */
  const stepBoundaries = periods
    .slice(1)
    .map((next, i) => (periods[i].rows[periods[i].rows.length - 1].t + next.rows[0].t) / 2);

  /**
   * ONE X EXTENT PER PERIOD, AND EVERYTHING IN THAT PERIOD IS DRAWN TO IT.
   *
   * The five bands, the four boundary hairlines, the step rule at each end and
   * the bound labels all read `x1`/`x2` from here. That is what makes "every band
   * steps together at the same x" structural rather than a coincidence of four
   * separate expressions agreeing — nothing in a period has an x of its own to
   * get wrong.
   *
   * The outer periods run out to the axis edges so the padding gutters aren't
   * bare: the range that applied at the first sample is the range that applied
   * just before it, and likewise at the end.
   */
  const bandSegments = periods.map((period, i) => ({
    x1: i === 0 ? tMin : stepBoundaries[i - 1],
    x2: i === periods.length - 1 ? tMax : stepBoundaries[i],
    low: period.low,
    high: period.high,
    threshold: period.threshold,
    bands: statusBands(period.low, period.high, period.rows[0].severityThreshold),
    // The boundaries that need a visible line: the reference bounds first
    // (heavier — this is the band the whole chart is about), then the two
    // points where out-of-range becomes significantly out.
    edges: [
      { y: period.low, weight: 'reference' as const },
      { y: period.high, weight: 'reference' as const },
      { y: period.low - period.threshold, weight: 'severity' as const },
      { y: period.high + period.threshold, weight: 'severity' as const },
    ],
  }));

  // Every period's own bounds, at the right-hand end of its own extent. The last
  // one ends at the plot edge (endsAt null) and prints in the margin; the rest
  // end at their step rule and print just inside it.
  const labelColumns: LabelColumn[] = periods.map((period, i) => ({
    endsAt: i === periods.length - 1 ? null : stepBoundaries[i],
    bounds: [
      { value: period.high, text: formatReferenceBound(period.high) },
      { value: period.low, text: formatReferenceBound(period.low) },
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
    const all = niceTicks(domainMin, domainMax);
    const span = domainMax - domainMin;
    const kept = all.filter((tick) => !boundaryLabels.some((b) => Math.abs(b.value - tick) < span * 0.02));
    return kept.length >= 2 ? kept : all;
  })();
  const tickDecimals = yTicks.reduce((most, tick) => Math.max(most, decimalsOf(tick)), 0);

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

  // A one-sided optimal band ("below 5.0 mmol/L") has to end somewhere on
  // screen. Running it to the edge of the plot would shade impossible
  // territory — negative cholesterol — so the open side stops at the
  // reference band's own bound, or at the furthest observed value if a result
  // sits beyond it, and never past the plot edge.
  const refLow = Math.min(...allLows);
  const refHigh = Math.max(...allHighs);
  const optimalLow = optimal ? (optimal.low ?? Math.max(domainMin, Math.min(refLow, ...values))) : null;
  const optimalHigh = optimal ? (optimal.high ?? Math.min(domainMax, Math.max(refHigh, ...values))) : null;

  const summary = data
    .map((d) => `${formatDate(d.sampleDate)}: ${d.value}, ${statusLabel(d.status).toLowerCase()}`)
    .join('; ');

  // Which bands are actually on screen, for the key. A marker whose results
  // have never been near the significantly-out threshold still shows the band
  // (the domain reaches it), but the key only names what is drawn.
  const bandsShown: MarkerStatus[] = BAND_ORDER.filter((s) =>
    bandSegments.some((seg) => {
      const b = seg.bands.find((x) => x.status === s)!;
      return (b.to ?? domainMax) > domainMin && (b.from ?? domainMin) < domainMax;
    }),
  );

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

      {/* REAL PADDING INSIDE THE CARD. The plot used to run to the card's own
          edges on three sides, which is what made it read as a picture pasted
          into a box rather than as a drawing on the card. The margins below do
          the rest of it, and the right-hand one is also what the inline
          boundary labels stand in. */}
      <div
        className={`tabular w-full px-0.5 sm:px-2 ${animate ? 'trend-mount ' : ''}${
          height === 'tall' ? 'h-64 sm:h-80 lg:h-[22rem]' : 'h-72 sm:h-80'
        }`}
        role="img"
        aria-label={
          `Trend chart for ${data.length} result${data.length === 1 ? '' : 's'}. ` +
          `Shaded bands mark the reference range and how far outside it a value sits. ${summary}`
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 14, right: 46, left: 0, bottom: 6 }}>
            <defs>
              {/* The optimal band is told apart from the status bands by its
                  hatch, not by its hue — it is a different KIND of statement
                  (advisory guidance, not the lab's range) and must not look
                  like a sixth status. */}
              <pattern id={hatchId} width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                <rect width="7" height="7" fill={chartTokens.optimalBand} fillOpacity={chartTokens.optimalBandOpacity} />
                <line x1="0" y1="0" x2="0" y2="7" stroke={chartTokens.optimalEdge} strokeWidth="1.5" strokeOpacity={0.5} />
              </pattern>
              {/* ONE GRADIENT PER STATUS BAND, carrying BOTH the hue ramp and
                  the band's weight.

                  Stops run top-to-bottom on screen, which is high-value-to-
                  low-value, so the colour pair is the reverse of the
                  value-order pair bandPlotStops returns. In range resolves to
                  the same colour twice, i.e. flat.

                  The opacity is IN THE GRADIENT rather than on the element, and
                  that is deliberate rather than incidental: it is what lets a
                  band fade out at each end instead of stopping at a hard step,
                  and it keeps the element's own fillOpacity at 1 so nothing
                  downstream can halve a weight that has already been chosen
                  (which is exactly what Recharts' 0.5 default once did to every
                  band in this chart). */}
              {BAND_ORDER.map((s) => {
                const [atLowEnd, atHighEnd] = bandPlotStops(s);
                const weight = BAND_WEIGHT[s];
                const fade = chartTokens.bandEdgeFade * 100;
                return (
                  <linearGradient key={s} id={`${gradId}-${s}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={atHighEnd} stopOpacity={0} />
                    <stop offset={`${fade}%`} stopColor={atHighEnd} stopOpacity={weight} />
                    <stop offset={`${100 - fade}%`} stopColor={atLowEnd} stopOpacity={weight} />
                    <stop offset="100%" stopColor={atLowEnd} stopOpacity={0} />
                  </linearGradient>
                );
              })}
              {/* The body under the line: its own colour, fading to nothing
                  well before the foot of the plot. It gives the series some
                  weight without becoming another region of colour over the
                  bands. */}
              <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chartTokens.line} stopOpacity={chartTokens.areaOpacity} />
                {/* Gone by three quarters of the way down rather than at the
                    foot of the plot: an area that is still faintly there where
                    it meets the axis draws a hard bottom edge across the whole
                    width, which is the boxed plot area coming back in through
                    another door. */}
                <stop offset="74%" stopColor={chartTokens.line} stopOpacity={0} />
                <stop offset="100%" stopColor={chartTokens.line} stopOpacity={0} />
              </linearGradient>
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
              // no gridlines. The bands already give the plot its structure;
              // a frame around them is a second structure competing with the
              // first, and a grid over them is a third.
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
              width={46}
            />

            {/* The five status bands, behind everything else. A single point
                still gets a full-width band: its one segment runs from the
                axis minimum to the axis maximum, so the patient sees where
                their one result sits relative to its range. */}
            {bandSegments.flatMap((seg, i) =>
              seg.bands.map((b) => (
                <ReferenceArea
                  key={`band-${i}-${b.status}`}
                  x1={seg.x1}
                  x2={seg.x2}
                  // CLAMPED TO THE DOMAIN, and that is not tidiness.
                  //
                  // Null is "open" — the outermost bands run to the edge of the
                  // plot rather than asserting a bound the lab never gave. But a
                  // BOUNDED band can also reach past the domain (a marker whose
                  // range is 135–145 puts the top of its above-range band at
                  // 160, well past a 148 axis), and `ifOverflow="hidden"` clips
                  // the rect with a clip-path rather than shortening it — so the
                  // gradient inside still maps over the band's full notional
                  // height and its fade lands in the part that was clipped away.
                  // The visible result was a band at FULL weight against the top
                  // edge of the plot, i.e. the fade was drawn everywhere except
                  // where it was needed, and the plot read as a filled box.
                  // Clamping first makes the gradient span what is actually on
                  // screen, so a band dissolves into the card at the plot edge.
                  y1={Math.max(b.from ?? domainMin, domainMin)}
                  y2={Math.min(b.to ?? domainMax, domainMax)}
                  fill={`url(#${gradId}-${b.status})`}
                  // Pinned at 1 because the weight lives in the gradient's own
                  // stops. Recharts' ReferenceArea defaults this to 0.5, which
                  // silently halves whatever the token system decided — the
                  // failure that once made every band on this chart invisible.
                  fillOpacity={1}
                  strokeOpacity={0}
                  ifOverflow="hidden"
                  zIndex={100}
                />
              )),
            )}

            {optimal && optimalLow != null && optimalHigh != null && (
              // fillOpacity pinned for the same reason as the status bands
              // above: the hatch pattern carries its own opacity internally
              // (chartTokens.optimalBandOpacity), and the library's 0.5 default
              // was quietly halving it a second time.
              <ReferenceArea
                y1={optimalLow}
                y2={optimalHigh}
                fill={`url(#${hatchId})`}
                fillOpacity={1}
                strokeOpacity={0}
                zIndex={110}
              />
            )}

            {connected && (
              <Area
                type="monotone"
                dataKey="value"
                stroke="none"
                fill={`url(#${areaId})`}
                fillOpacity={1}
                dot={false}
                activeDot={false}
                isAnimationActive={animate}
                animationDuration={620}
                animationEasing="ease-out"
                zIndex={150}
              />
            )}

            {/* Every band boundary, drawn — and drawn as a HAIRLINE now that
                the bands themselves are a wash. These used to be near-solid
                rules over saturated slabs, which made the edge of the reference
                range the strongest mark in the plot; the reader's own result
                should be. Still per segment rather than a ReferenceLine across
                the whole plot, so a boundary steps with the period it belongs
                to, and still the thing that keeps the bands legible with the
                colour taken away. */}
            {bandSegments.flatMap((seg, i) =>
              seg.edges.map((e, j) => (
                <ReferenceLine
                  key={`edge-${i}-${j}`}
                  segment={[
                    { x: seg.x1, y: e.y },
                    { x: seg.x2, y: e.y },
                  ]}
                  stroke={chartTokens.referenceEdge}
                  strokeOpacity={
                    e.weight === 'reference' ? chartTokens.referenceEdgeOpacity : chartTokens.severityEdgeOpacity
                  }
                  strokeWidth={1}
                  ifOverflow="hidden"
                  zIndex={200}
                />
              )),
            )}

            {/* Dashed edges, so the optimal band has a boundary you can point
                at even where it sits inside the reference band. */}
            {optimal?.low != null && (
              <ReferenceLine
                y={optimal.low}
                stroke={chartTokens.optimalEdge}
                strokeDasharray="4 3"
                strokeWidth={1.2}
                zIndex={210}
              />
            )}
            {optimal?.high != null && (
              <ReferenceLine
                y={optimal.high}
                stroke={chartTokens.optimalEdge}
                strokeDasharray="4 3"
                strokeWidth={1.2}
                zIndex={210}
              />
            )}

            {/* The step itself, drawn. The bands already change height here,
                but a horizontal edge that jumps is easy to read as noise; a
                vertical rule at the same x says the jump is the point. Paired
                with the sentence under the chart and its own entry in the key,
                so the change is stated three ways and carried by none of them
                alone.

                ONE rule per change, at exactly the x the bands either side of it
                step at (both come from `stepBoundaries`), the full height of the
                plot, and every value describing it is a token — see
                chart.stepDashArray. The same three literals used to be written
                out here and again in the key's swatch, which is two places for
                one appearance to drift apart in. */}
            {stepBoundaries.map((x) => (
              <ReferenceLine
                key={`step-${x}`}
                x={x}
                stroke={chartTokens.referenceEdge}
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
              // `connected` gates the whole line, not just its type — a single
              // point and an incomparable series both render as marks only.
              type="monotone"
              dataKey="value"
              stroke={connected ? chartTokens.line : 'none'}
              // Thicker, with round caps and joins. A 2px line with mitred
              // corners on a chart this size reads as a plotted path; 2.75 with
              // round ones reads as a drawn stroke, which is what the rest of
              // the product's marks are.
              strokeWidth={2.75}
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
        optimal={optimal}
        statuses={[...new Set(data.map((d) => d.status))]}
        bands={bandsShown}
        unjoined={!connected && !singlePoint}
        stepped={stepBoundaries.length > 0}
      />
    </div>
  );
}

/**
 * What the marks and the bands mean, in words.
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
 * EVERY SWATCH IS THE MARK IT STANDS FOR, AT THE WEIGHT IT IS DRAWN. The band
 * entries used to be saturated blocks of colour that appeared nowhere on the
 * chart — they were the most conspicuous thing in the card and they were
 * describing the faintest thing in the plot. Each one is now the band itself:
 * the same hue, composited at the same `BAND_WEIGHT`, under the same hairline.
 * A key whose swatch does not match what it names is a key you have to
 * translate.
 */
function ChartKey({
  optimal,
  statuses,
  bands,
  unjoined,
  stepped,
}: {
  optimal: OptimalRangeDTO | null;
  statuses: MarkerStatusInput[];
  bands: MarkerStatus[];
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
        <StatusMark cx={7} cy={7} status={s} size={0.85} ring={2} />
      </svg>
      <span className="min-w-0">{statusLabel(s)}</span>
    </li>
  ));

  const regions = [
    ...bands.map((s) => {
      const [atLowEnd, atHighEnd] = bandPlotStops(s);
      return (
        <li key={`band-${s}`} className="flex items-center gap-2">
          <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true" className="shrink-0">
            {/* The band's own two-colour ramp, at the band's own weight, under
                the band's own hairline. Painted as two halves rather than a
                gradient: five more gradient definitions in the document for
                18 pixels of swatch is not a trade worth making, and the pair
                of stops is what the ramp IS. */}
            <rect x="0" y="2" width="18" height="5" fill={atHighEnd} fillOpacity={bandWeight(s)} />
            <rect x="0" y="7" width="18" height="5" fill={atLowEnd} fillOpacity={bandWeight(s)} />
            <line
              x1="0"
              y1="2"
              x2="18"
              y2="2"
              stroke={chartTokens.referenceEdge}
              strokeWidth="1"
              strokeOpacity={chartTokens.referenceEdgeOpacity}
            />
          </svg>
          <span className="min-w-0">{bandLabel(s)}</span>
        </li>
      );
    }),
    ...(optimal
      ? [
          <li key="optimal" className="flex items-center gap-2">
            <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true" className="shrink-0">
              <rect x="0" y="2" width="18" height="8" fill={chartTokens.optimalBand} fillOpacity={chartTokens.optimalBandOpacity} />
              <path d="M2 10 L6 2 M7 10 L11 2 M12 10 L16 2" stroke={chartTokens.optimalEdge} strokeWidth="1.2" strokeOpacity="0.6" />
            </svg>
            <span className="min-w-0">Optimal range (hatched)</span>
          </li>,
        ]
      : []),
    ...(stepped
      ? [
          <li key="stepped" className="flex items-center gap-2">
            {/* The rule itself, from the same tokens the plot draws it with, so
                the swatch cannot describe a mark the chart no longer makes. */}
            <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true" className="shrink-0">
              <line
                x1="9"
                y1="0"
                x2="9"
                y2="12"
                stroke={chartTokens.referenceEdge}
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
