import { useEffect, useState } from 'react';
import { CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { status as statusTokens, brand, formatDate, type MarkerStatus } from '@aspire-bloods/shared';
import { formatAxisDate } from '../../lib/patientPortal';

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

const STATUS_LABEL: Record<MarkerStatus, string> = {
  IN_RANGE: 'in range',
  HIGH: 'above range',
  LOW: 'below range',
  SIGNIFICANT_HIGH: 'significantly above range',
  SIGNIFICANT_LOW: 'significantly below range',
};

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

const STATUS_MAP: Record<MarkerStatus, keyof typeof statusTokens> = {
  IN_RANGE: 'inRange',
  HIGH: 'high',
  LOW: 'low',
  SIGNIFICANT_HIGH: 'significantHigh',
  SIGNIFICANT_LOW: 'significantLow',
};

function CustomDot(props: any) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  const color = payload.status === 'IN_RANGE' ? brand.bronze : statusTokens[STATUS_MAP[payload.status as MarkerStatus]].hex;
  return (
    <g>
      {/* Invisible circle widens the touch/click target well past the visible marker — the
          visible dot stays small and precise, the tappable area doesn't. */}
      <circle cx={cx} cy={cy} r={16} fill="transparent" />
      <circle cx={cx} cy={cy} r={5} fill={color} stroke={brand.white} strokeWidth={1.5} />
    </g>
  );
}

/** Value, unit, date, status and source — everything needed to read a point without leaving it. */
function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const point: TrendPoint = payload[0].payload;
  const token = statusTokens[STATUS_MAP[point.status]];
  return (
    <div className="rounded-card border border-taupe bg-white px-4 py-3 text-xs shadow-popover">
      <p className="tabular text-base font-semibold leading-none text-espresso">
        {point.value}
        {point.unit && <span className="ml-1 text-xs font-normal text-espresso/70">{point.unit}</span>}
      </p>
      <p className="mt-1.5 text-espresso/80">{formatDate(point.sampleDate)}</p>
      <p className="mt-1.5 font-medium" style={{ color: token.hex }}>
        {token.label}
      </p>
      <p className="tabular mt-1.5 text-espresso/70">
        Range {point.referenceLow}–{point.referenceHigh}
      </p>
      {point.sourceLabel && <p className="mt-1.5 text-espresso/70">{point.sourceLabel}</p>}
      {point.converted && (
        <p className="mt-1.5 text-espresso/70">
          Converted from {point.originalValue} {point.originalUnit}
        </p>
      )}
    </div>
  );
}

export function TrendChart({ data, crossSourceComparable = true }: { data: TrendPoint[]; crossSourceComparable?: boolean }) {
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
  const reducedMotion = useReducedMotion();
  const singlePoint = data.length === 1;

  // Draws once, quickly, the first time this data set appears — then never re-animates, even if
  // the component re-renders for unrelated reasons (parent state changes, resize, etc). Empty
  // deps means this timeout is set exactly once per mount. Skipped entirely when there's no line
  // to draw (cross-source-incomparable data is shown as static disconnected points).
  const [animate, setAnimate] = useState(crossSourceComparable && !reducedMotion);
  useEffect(() => {
    if (reducedMotion || !crossSourceComparable) return;
    const t = setTimeout(() => setAnimate(false), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const summary = data.map((d) => `${formatDate(d.sampleDate)}: ${d.value}, ${STATUS_LABEL[d.status]}`).join('; ');

  return (
    <div>
      {singlePoint && (
        <p className="mb-3 text-xs text-espresso/80">
          This is your first result for this marker. The shaded band is the reference range it's measured
          against. A trend line appears once you've had a second test.
        </p>
      )}
      {!crossSourceComparable && (
        <p className="mb-3 text-xs text-espresso/80">
          These results come from sources that aren't directly comparable for this marker, so they are shown as
          separate points rather than one trend line.
        </p>
      )}
      {/* Taller than the old 256px and with room at the right for the last
          tick label — most patients read this on a phone, where a squat
          chart with clipped labels is the failure mode. */}
      <div
        className="h-72 w-full sm:h-80"
        role="img"
        aria-label={`Trend chart for ${data.length} result${data.length === 1 ? '' : 's'}. ${summary}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 20, left: 0, bottom: 4 }}>
            <CartesianGrid stroke={brand.taupe} strokeOpacity={0} />
            <XAxis
              dataKey="sampleDate"
              // ISO never reaches an axis. The compact "Aug 26" form is purely
              // for width — the tooltip gives the full "5 August 2026".
              tickFormatter={formatAxisDate}
              tick={{ fontSize: 11, fill: brand.espresso }}
              axisLine={{ stroke: brand.taupe }}
              tickLine={false}
              minTickGap={16}
              // At 375px a 5-point series would otherwise overlap its own
              // labels; Recharts drops ticks rather than letting them collide.
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[domainMin, domainMax]}
              tick={{ fontSize: 12, fill: brand.espresso }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            {/* With a single point x1 === x2, which is a zero-width area and
                renders nothing — so the band is drawn across the full plot
                instead. The patient still sees the range their one result is
                measured against, which is the entire point of the band. */}
            {singlePoint ? (
              <ReferenceArea
                y1={data[0].referenceLow}
                y2={data[0].referenceHigh}
                fill={brand.taupe}
                fillOpacity={0.35}
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
                  fill={brand.taupe}
                  fillOpacity={0.35}
                  strokeOpacity={0}
                />
              ))
            )}
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ stroke: brand.taupe, strokeWidth: 1 }}
            />
            <Line
              type={crossSourceComparable ? 'monotone' : undefined}
              dataKey="value"
              stroke={crossSourceComparable ? brand.bronze : 'transparent'}
              strokeWidth={2}
              dot={<CustomDot />}
              activeDot={{ r: 7 }}
              isAnimationActive={animate}
              animationDuration={600}
              animationEasing="ease-out"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
