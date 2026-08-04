import { CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { status as statusTokens, brand, type MarkerStatus } from '@aspire-bloods/shared';

interface TrendPoint {
  sampleDate: string;
  value: number;
  status: MarkerStatus;
  referenceLow: number;
  referenceHigh: number;
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

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const latest = data[data.length - 1];
  const values = data.map((d) => d.value);
  const domainPad = (latest.referenceHigh - latest.referenceLow || 1) * 0.3;
  const domainMin = Math.min(latest.referenceLow, ...values) - domainPad;
  const domainMax = Math.max(latest.referenceHigh, ...values) + domainPad;

  return (
    <div className="h-64 w-full">
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
          <ReferenceArea y1={latest.referenceLow} y2={latest.referenceHigh} fill={brand.taupe} fillOpacity={0.35} strokeOpacity={0} />
          <Tooltip
            contentStyle={{ borderColor: brand.taupe, borderRadius: 6, fontSize: 13 }}
            formatter={(value) => [String(value), 'Value']}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={brand.bronze}
            strokeWidth={2}
            dot={<CustomDot />}
            activeDot={{ r: 6 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
