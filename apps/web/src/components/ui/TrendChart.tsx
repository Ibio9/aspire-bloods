import { useEffect, useId, useState } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  chart as chartTokens,
  statusBands,
  statusPaint,
  bandGradientStops,
  severityThresholdFor,
  BAND_LABEL,
  formatOptimalRange,
  formatDate,
  type MarkerStatus,
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
 * WHAT THE BANDS ARE. The reference range renders as a soft green band.
 * Immediately above and below it, yellow. Beyond the point where the status
 * itself changes to significantly out, red — with orange as the transition
 * between the two, which is the whole of orange's job here and is never a
 * state a result can be in. Every one of those boundaries is derived from THAT
 * point's own reference range and severity threshold: a marker whose range is
 * 20–42 gets bands sized for 20–42, and the band a value falls in is always
 * the band its own status says it is in. Nothing here is a fixed scale.
 *
 * WHY THAT IS SAFE. Colour is the last thing carrying status, never the first.
 * The point's SHAPE still says it (level dot, triangle, doubled triangle), the
 * tooltip still says it in words, every band carries a visible boundary line,
 * and the key below the chart names every band and every mark in text. Turn
 * the whole thing greyscale and nothing is lost — which matters most for
 * exactly this pair, since red and green are the commonest confusion there is.
 *
 * The explanatory line above the chart matches whichever of the three data
 * states actually applies, rather than showing the incomparable-sources note
 * unconditionally — which, on a patient's very first result, was a sentence
 * about a comparison that hadn't happened.
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
  status: MarkerStatus;
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
 * under it uses, a step stronger so it reads as a mark on the band rather than
 * disappearing into it. It reinforces the shape; it never replaces it.
 */
function markFill(status: MarkerStatus): string {
  return statusPaint(status).mark;
}

function StatusMark({ cx, cy, status, size = 1 }: { cx: number; cy: number; status: MarkerStatus; size?: number }) {
  const fill = markFill(status);
  const r = 5 * size;
  const common = { fill, stroke: chartTokens.pointRing, strokeWidth: 1.5 };
  const shape = STATUS_SHAPE[status];

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

function CustomDot(props: { cx?: number; cy?: number; payload?: TrendPoint }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload) return null;
  return (
    <g>
      {/* Invisible circle widens the touch/click target well past the visible marker — the
          visible mark stays small and precise, the tappable area doesn't. */}
      <circle cx={cx} cy={cy} r={16} fill="transparent" />
      <StatusMark cx={cx} cy={cy} status={payload.status} />
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

  return (
    <div className="rounded-card border border-taupe bg-white px-4 py-3 text-xs shadow-popover">
      <p className="tabular text-base font-semibold leading-none text-espresso">
        {point.value}
        {point.unit && <span className="ml-1 text-xs font-normal text-espresso/80">{point.unit}</span>}
      </p>
      <p className="mt-1.5 text-espresso/80">{formatDate(point.sampleDate)}</p>
      {/* The status word takes its own state's colour. It is a label FOR that
          colour rather than content sitting in it, and it still leads with the
          mark's shape — so it reads identically with the colour removed. */}
      <p className="mt-1.5 flex items-center gap-1.5 font-medium" style={{ color: statusColor(point.status) }}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <StatusMark cx={6} cy={6} status={point.status} size={0.9} />
        </svg>
        {statusLabel(point.status)}
      </p>
      <p className="tabular mt-1.5 text-espresso/80">
        Reference range {point.referenceLow}–{point.referenceHigh}
      </p>
      {/* Advisory, and clearly separate from the status above it. */}
      {optimal && (
        <p className="tabular mt-1 text-espresso/80">
          Optimal {formatOptimalRange(optimal.low, optimal.high, optimal.unit)}
          <span> · {withinOptimal ? 'within optimal' : 'outside optimal'}</span>
        </p>
      )}
      {point.sourceLabel && <p className="mt-1.5 text-espresso/80">{point.sourceLabel}</p>}
      {point.converted && (
        <p className="mt-1.5 text-espresso/80">
          Converted from {point.originalValue} {point.originalUnit}
        </p>
      )}
    </div>
  );
}

export function TrendChart({
  data,
  crossSourceComparable = true,
  optimal = null,
}: {
  data: TrendPoint[];
  crossSourceComparable?: boolean;
  /** The advisory optimal band, or null when this marker has no established one — in which case nothing about optimal is drawn or said. */
  optimal?: OptimalRangeDTO | null;
}) {
  const reducedMotion = useReducedMotion();
  // Pattern ids are document-global; two marker charts on one page sharing an
  // id would make the second one's band reference the first one's pattern.
  const uid = useId().replace(/:/g, '');
  const hatchId = `optimal-hatch-${uid}`;
  const gradId = `band-${uid}`;

  const singlePoint = data.length === 1;
  // Connecting a line means asserting these points belong on one trajectory.
  // Two conditions, both required: there are at least two of them, and they
  // are comparable with each other.
  const connected = data.length >= 2 && crossSourceComparable;

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
        This marker's result isn't a number, so there is nothing to plot. The result itself is shown above.
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
  const rows = data.map((d) => ({ ...d, t: epochOf(d.sampleDate) }));
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

  // Phase 2 §2.4: stepped/segmented bands — each point's own range is drawn
  // from its position up to the next point, so a range change between sources
  // is visible as a step, never smoothed into one region that would
  // misrepresent which range actually applied when. The five status bands are
  // built per segment for the same reason: they are derived from that point's
  // range, so they step with it.
  const bandSegments = rows.map((point, i) => {
    const threshold = severityThresholdFor(point.referenceLow, point.referenceHigh, point.severityThreshold);
    return {
      // Each point's range is shaded from that point up to the next one. The
      // first and last segments run out to the axis edges so the padding
      // gutters aren't bare — the range that applied at the first sample is
      // the range that applied just before it, and likewise at the end.
      x1: i === 0 ? tMin : point.t,
      x2: i === rows.length - 1 ? tMax : rows[i + 1].t,
      low: point.referenceLow,
      high: point.referenceHigh,
      threshold,
      bands: statusBands(point.referenceLow, point.referenceHigh, point.severityThreshold),
      // The boundaries that need a visible line: the reference bounds first
      // (heavier — this is the band the whole chart is about), then the two
      // points where out-of-range becomes significantly out.
      edges: [
        { y: point.referenceLow, weight: 'reference' as const },
        { y: point.referenceHigh, weight: 'reference' as const },
        { y: point.referenceLow - threshold, weight: 'severity' as const },
        { y: point.referenceHigh + threshold, weight: 'severity' as const },
      ],
    };
  });

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

  // A boundary line is drawn as a very thin band rather than a ReferenceLine,
  // because a ReferenceLine spans the whole plot and these have to step with
  // their own segment. Sized off the domain so it stays ~1px at any scale.
  const hairline = (domainMax - domainMin) * 0.003;

  // Which bands are actually on screen, for the key. A marker whose results
  // have never been near the significantly-out threshold still shows the band
  // (the domain reaches it), but the key only names what is drawn.
  const bandsShown: MarkerStatus[] = ['SIGNIFICANT_LOW', 'LOW', 'IN_RANGE', 'HIGH', 'SIGNIFICANT_HIGH'].filter(
    (s) =>
      bandSegments.some((seg) => {
        const b = seg.bands.find((x) => x.status === s)!;
        return (b.to ?? domainMax) > domainMin && (b.from ?? domainMin) < domainMax;
      }),
  ) as MarkerStatus[];

  return (
    <div>
      {/* Exactly one of these three. The state of the data decides which. */}
      {singlePoint ? (
        <p className="mb-3 text-xs leading-relaxed text-espresso/80">
          This is your first result for this marker, so it is shown as a single point with no trend line. The green
          band is the reference range it was measured against; the shading either side of it marks how far outside
          that range a value sits. A line appears once you have had a second test.
        </p>
      ) : connected ? (
        <p className="mb-3 text-xs leading-relaxed text-espresso/80">
          These {data.length} results are directly comparable, so they are joined into one trend line. The green band
          is the reference range each was measured against; the shading either side of it marks how far outside that
          range a value sits.
        </p>
      ) : (
        <p className="mb-3 text-xs leading-relaxed text-espresso/80">
          These results come from sources that aren't directly comparable for this marker, so they are shown as
          separate points rather than joined into one trend line. Each is still shown against the reference range it
          was measured on.
        </p>
      )}

      {/* Taller than the old 256px and with room at the right for the last
          tick label — most patients read this on a phone, where a squat
          chart with clipped labels is the failure mode. */}
      <div
        className="tabular h-72 w-full sm:h-80"
        role="img"
        aria-label={
          `Trend chart for ${data.length} result${data.length === 1 ? '' : 's'}. ` +
          `Shaded bands mark the reference range and how far outside it a value sits. ${summary}`
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 12, right: 20, left: 0, bottom: 4 }}>
            <defs>
              {/* The optimal band is told apart from the status bands by its
                  hatch, not by its hue — it is a different KIND of statement
                  (advisory guidance, not the lab's range) and must not look
                  like a sixth status. */}
              <pattern id={hatchId} width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                <rect width="7" height="7" fill={chartTokens.optimalBand} fillOpacity={chartTokens.optimalBandOpacity} />
                <line x1="0" y1="0" x2="0" y2="7" stroke={chartTokens.optimalEdge} strokeWidth="1.5" strokeOpacity={0.5} />
              </pattern>
              {/* One gradient per status band. Stops run top-to-bottom on
                  screen, which is high-value-to-low-value, so they are the
                  reverse of the value-order pair bandGradientStops returns.
                  In range resolves to the same colour twice, i.e. flat. */}
              {(['SIGNIFICANT_LOW', 'LOW', 'IN_RANGE', 'HIGH', 'SIGNIFICANT_HIGH'] as MarkerStatus[]).map((s) => {
                const [atLowEnd, atHighEnd] = bandGradientStops(s);
                return (
                  <linearGradient key={s} id={`${gradId}-${s}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={atHighEnd} />
                    <stop offset="100%" stopColor={atLowEnd} />
                  </linearGradient>
                );
              })}
            </defs>

            <CartesianGrid stroke={chartTokens.gridline} strokeOpacity={0} />
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
              // Inter, sized here; the tabular figures come from the
              // `tabular` class on the wrapper below, which SVG text inherits.
              // Recharts' tick prop type doesn't carry fontVariantNumeric, and
              // an inline style on every tick would be forty declarations to
              // say one thing.
              tick={{ fontSize: 11, fill: chartTokens.axisText, fontFamily: 'Inter, sans-serif' }}
              axisLine={{ stroke: chartTokens.axisLine }}
              tickLine={false}
              minTickGap={16}
              // At 375px a 5-point series would otherwise overlap its own
              // labels; Recharts drops ticks rather than letting them collide.
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[domainMin, domainMax]}
              tick={{ fontSize: 12, fill: chartTokens.axisText, fontFamily: 'Inter, sans-serif' }}
              axisLine={false}
              tickLine={false}
              width={44}
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
                  // Null is "open" — the outermost bands run to the edge of
                  // the plot rather than asserting a bound the lab never gave.
                  y1={b.from ?? domainMin}
                  y2={b.to ?? domainMax}
                  fill={`url(#${gradId}-${b.status})`}
                  // NOT optional, and this is the whole of why the bands were
                  // invisible. Recharts' ReferenceArea defaults fillOpacity to
                  // 0.5, so every band was drawn at half the weight the token
                  // system had already calibrated — and the band tokens are a
                  // ~30% mix toward the hue precisely because that is what
                  // reads as green or gold rather than as cream. Halved again
                  // it lands on ~15%, which is the exact "a 12% wash of an
                  // orange is indistinguishable from cream" failure the token
                  // file documents. The opacity belongs in the token, not in
                  // the chart library's default, so it is pinned to 1 here.
                  fillOpacity={1}
                  strokeOpacity={0}
                  ifOverflow="hidden"
                />
              )),
            )}

            {/* Every band boundary, drawn. This is what keeps the bands legible
                with the colour taken away: the reference bounds get the heavier
                line because they are the thing the chart is about, and the two
                significantly-out thresholds get a lighter one. Drawn as very
                thin bands rather than ReferenceLines so they step with their own
                segment instead of spanning the whole plot. */}
            {bandSegments.flatMap((seg, i) =>
              seg.edges.map((e, j) => (
                <ReferenceArea
                  key={`edge-${i}-${j}`}
                  x1={seg.x1}
                  x2={seg.x2}
                  y1={e.y - hairline * (e.weight === 'reference' ? 1.5 : 1)}
                  y2={e.y + hairline * (e.weight === 'reference' ? 1.5 : 1)}
                  fill={chartTokens.referenceEdge}
                  fillOpacity={e.weight === 'reference' ? 0.85 : 0.45}
                  strokeOpacity={0}
                  ifOverflow="hidden"
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
              />
            )}
            {/* Dashed edges, so the optimal band has a boundary you can point
                at even where it sits inside the reference band. */}
            {optimal?.low != null && (
              <ReferenceLine y={optimal.low} stroke={chartTokens.optimalEdge} strokeDasharray="4 3" strokeWidth={1.2} />
            )}
            {optimal?.high != null && (
              <ReferenceLine y={optimal.high} stroke={chartTokens.optimalEdge} strokeDasharray="4 3" strokeWidth={1.2} />
            )}

            <Tooltip
              content={<ChartTooltip optimal={optimal} />}
              cursor={{ stroke: chartTokens.cursor, strokeWidth: 1 }}
            />
            <Line
              // `connected` gates the whole line, not just its type — a single
              // point and an incomparable series both render as marks only.
              type="monotone"
              dataKey="value"
              stroke={connected ? chartTokens.line : 'none'}
              strokeWidth={2}
              dot={<CustomDot />}
              activeDot={false}
              isAnimationActive={animate}
              animationDuration={600}
              animationEasing="ease-out"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <ChartKey optimal={optimal} statuses={[...new Set(data.map((d) => d.status))]} bands={bandsShown} />
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
 */
function ChartKey({
  optimal,
  statuses,
  bands,
}: {
  optimal: OptimalRangeDTO | null;
  statuses: MarkerStatus[];
  bands: MarkerStatus[];
}) {
  return (
    <div className="mt-4 border-t border-taupe pt-3 text-xs text-espresso/80">
      <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6">
        {statuses.map((s) => (
          <li key={s} className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
              <StatusMark cx={7} cy={7} status={s} size={0.95} />
            </svg>
            {statusLabel(s)}
          </li>
        ))}
      </ul>
      <ul className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6">
        {bands.map((s) => (
          <li key={s} className="flex items-center gap-2">
            <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true" className="shrink-0">
              <rect x="0" y="2" width="18" height="8" fill={statusPaint(s).band} />
              <line x1="0" y1="2" x2="18" y2="2" stroke={chartTokens.referenceEdge} strokeWidth="1" strokeOpacity="0.85" />
            </svg>
            {BAND_LABEL[s]}
          </li>
        ))}
        {optimal && (
          <li className="flex items-center gap-2">
            <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true" className="shrink-0">
              <rect x="0" y="2" width="18" height="8" fill={chartTokens.optimalBand} fillOpacity={chartTokens.optimalBandOpacity} />
              <path d="M2 10 L6 2 M7 10 L11 2 M12 10 L16 2" stroke={chartTokens.optimalEdge} strokeWidth="1.2" strokeOpacity="0.6" />
            </svg>
            Optimal range (hatched)
          </li>
        )}
      </ul>
    </div>
  );
}
