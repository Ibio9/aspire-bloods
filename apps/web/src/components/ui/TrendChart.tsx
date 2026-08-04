import { CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { status as statusTokens, brand, type MarkerStatus } from '@aspire-bloods/shared';

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
  return <circle cx={cx} cy={cy} r={5} fill={color} stroke={brand.white} strokeWidth={1.5} />;
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const point: TrendPoint = payload[0].payload;
  return (
    <div className="rounded-card border border-taupe bg-white px-3 py-2 text-xs shadow-card">
      <p className="tabular font-medium text-espresso">{point.value}</p>
      {point.sourceLabel && <p className="mt-0.5 text-espresso/80">{point.sourceLabel}</p>}
      {point.converted && (
        <p className="mt-0.5 text-espresso/80">
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
  const domainPad = (Math.max(...allHighs) - Math.min(...allLows) || 1) * 0.3;
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

  return (
    <div>
      {!crossSourceComparable && (
        <p className="mb-3 text-xs text-espresso/80">
          These results come from sources that aren't directly comparable for this marker — shown as separate points
          rather than one trend line.
        </p>
      )}
      <div className="h-64 w-full" role="img" aria-label={`Trend chart with ${data.length} result${data.length === 1 ? '' : 's'}, latest value ${data[data.length - 1].value} ${data[data.length - 1].unit ?? ''}`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={brand.taupe} strokeOpacity={0} />
            <XAxis
              dataKey="sampleDate"
              tick={{ fontSize: 12, fill: brand.espresso }}
              axisLine={{ stroke: brand.taupe }}
              tickLine={false}
            />
            <YAxis
              domain={[domainMin, domainMax]}
              tick={{ fontSize: 12, fill: brand.espresso }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            {bandSegments.map((seg, i) => (
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
            ))}
            <Tooltip content={<ChartTooltip />} />
            <Line
              type={crossSourceComparable ? 'monotone' : undefined}
              dataKey="value"
              stroke={crossSourceComparable ? brand.bronze : 'transparent'}
              strokeWidth={2}
              dot={<CustomDot />}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
