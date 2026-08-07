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
  formatOptimalRange,
  formatDate,
  type MarkerStatus,
  type OptimalRangeDTO,
} from '@aspire-bloods/shared';
import { formatAxisDate } from '../../lib/patientPortal';
import { statusLabel } from '../../lib/markerCopy';

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
 *  - Carry status in colour. Everything drawn here comes from the four brand
 *    hues and their tints; status is carried by the POINT'S SHAPE and by the
 *    word in the tooltip and the legend. There is no red, amber or green in
 *    this file and there is no grey either.
 *
 * The explanatory line above the chart matches whichever of the three data
 * states actually applies, rather than showing the incomparable-sources note
 * unconditionally — which, on a patient's very first result, was a sentence
 * about a comparison that hadn't happened.
 */

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

interface TrendPoint {
  sampleDate: string;
  value: number;
  unit?: string;
  status: MarkerStatus;
  referenceLow: number;
  referenceHigh: number;
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

/** Tone follows severity, within the palette. It reinforces the shape; it never replaces it. */
function markFill(status: MarkerStatus): string {
  if (status === 'IN_RANGE') return chartTokens.point;
  if (status === 'SIGNIFICANT_HIGH' || status === 'SIGNIFICANT_LOW') return chartTokens.pointFarOut;
  return chartTokens.pointOut;
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
      <p className="mt-1.5 flex items-center gap-1.5 font-medium text-espresso">
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
  const hatchId = `optimal-hatch-${useId().replace(/:/g, '')}`;

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
  const domainMin = Math.min(...allLows, ...values) - domainPad;
  const domainMax = Math.max(...allHighs, ...values) + domainPad;

  // Phase 2 §2.4: stepped/segmented reference band — each point's own
  // range is drawn from its position up to the next point, so a range
  // change between sources is visible as a step, never smoothed into one
  // region that would misrepresent which range actually applied when.
  const bandSegments = data.map((point, i) => ({
    x1: point.sampleDate,
    x2: data[i + 1]?.sampleDate ?? point.sampleDate,
    low: point.referenceLow,
    high: point.referenceHigh,
  }));

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

  return (
    <div>
      {/* Exactly one of these three. The state of the data decides which. */}
      {singlePoint ? (
        <p className="mb-3 text-xs leading-relaxed text-espresso/80">
          This is your first result for this marker, so it is shown as a single point with no trend line. The shaded
          band is the reference range it was measured against. A line appears once you have had a second test.
        </p>
      ) : connected ? (
        <p className="mb-3 text-xs leading-relaxed text-espresso/80">
          These {data.length} results are directly comparable, so they are joined into one trend line. The shaded band
          is the reference range each was measured against.
        </p>
      ) : (
        <p className="mb-3 text-xs leading-relaxed text-espresso/80">
          These results come from sources that aren't directly comparable for this marker, so they are shown as
          separate points rather than joined into one trend line.
        </p>
      )}

      {/* Taller than the old 256px and with room at the right for the last
          tick label — most patients read this on a phone, where a squat
          chart with clipped labels is the failure mode. */}
      <div
        className="tabular h-72 w-full sm:h-80"
        role="img"
        aria-label={`Trend chart for ${data.length} result${data.length === 1 ? '' : 's'}. ${summary}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 20, left: 0, bottom: 4 }}>
            <defs>
              {/* The optimal band is told apart from the reference band by its
                  hatch, not by its hue — the two sit at nearly the same tonal
                  weight on purpose, because one is not "better" than the other. */}
              <pattern id={hatchId} width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                <rect width="7" height="7" fill={chartTokens.optimalBand} fillOpacity={chartTokens.optimalBandOpacity} />
                <line x1="0" y1="0" x2="0" y2="7" stroke={chartTokens.optimalEdge} strokeWidth="1.5" strokeOpacity={0.5} />
              </pattern>
            </defs>

            <CartesianGrid stroke={chartTokens.gridline} strokeOpacity={0} />
            <XAxis
              dataKey="sampleDate"
              // ISO never reaches an axis. The compact "Aug 26" form is purely
              // for width — the tooltip gives the full "5 August 2026".
              tickFormatter={formatAxisDate}
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

            {/* With a single point x1 === x2, which is a zero-width area and
                renders nothing — so the band is drawn across the full plot
                instead. The patient still sees the range their one result is
                measured against, which is the entire point of the band. */}
            {singlePoint ? (
              <ReferenceArea
                y1={data[0].referenceLow}
                y2={data[0].referenceHigh}
                fill={chartTokens.referenceBand}
                fillOpacity={chartTokens.referenceBandOpacity}
                strokeOpacity={0}
              />
            ) : (
              bandSegments.map((seg, i) => (
                <ReferenceArea
                  key={i}
                  x1={seg.x1}
                  x2={seg.x2}
                  y1={seg.low}
                  y2={seg.high}
                  fill={chartTokens.referenceBand}
                  fillOpacity={chartTokens.referenceBandOpacity}
                  strokeOpacity={0}
                />
              ))
            )}

            {optimal && optimalLow != null && optimalHigh != null && (
              <ReferenceArea y1={optimalLow} y2={optimalHigh} fill={`url(#${hatchId})`} strokeOpacity={0} />
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

      <ChartKey optimal={optimal} statuses={[...new Set(data.map((d) => d.status))]} />
    </div>
  );
}

/**
 * What the marks and the bands mean, in words. Present because the chart
 * carries status by shape — a shape with no key is a rebus, and the whole
 * point of moving off colour was to make the chart readable rather than
 * decorative.
 */
function ChartKey({ optimal, statuses }: { optimal: OptimalRangeDTO | null; statuses: MarkerStatus[] }) {
  return (
    <ul className="mt-4 flex flex-col gap-2 border-t border-taupe pt-3 text-xs text-espresso/80 sm:flex-row sm:flex-wrap sm:gap-x-6">
      {statuses.map((s) => (
        <li key={s} className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
            <StatusMark cx={7} cy={7} status={s} size={0.95} />
          </svg>
          {statusLabel(s)}
        </li>
      ))}
      <li className="flex items-center gap-2">
        <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true" className="shrink-0">
          <rect
            x="0"
            y="2"
            width="18"
            height="8"
            fill={chartTokens.referenceBand}
            fillOpacity={chartTokens.referenceBandOpacity}
          />
        </svg>
        Reference range
      </li>
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
  );
}
