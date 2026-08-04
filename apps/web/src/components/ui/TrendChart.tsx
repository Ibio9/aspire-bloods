import { useEffect, useState } from 'react';
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
  return (
    <g>
      {/* Invisible circle widens the touch/click target well past the visible marker — the
          visible dot stays small and precise, the tappable area doesn't. */}
      <circle cx={cx} cy={cy} r={16} fill="transparent" />
      <circle cx={cx} cy={cy} r={5} fill={color} stroke={brand.white} strokeWidth={1.5} />
    </g>
  );
}

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

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const latest = data[data.length - 1];
  const values = data.map((d) => d.value);
  const domainPad = (latest.referenceHigh - latest.referenceLow || 1) * 0.3;
  const domainMin = Math.min(latest.referenceLow, ...values) - domainPad;
  const domainMax = Math.max(latest.referenceHigh, ...values) + domainPad;
  const reducedMotion = useReducedMotion();

  // Draws once, quickly, the first time this data set appears — then never re-animates, even if
  // the component re-renders for unrelated reasons (parent state changes, resize, etc). Empty
  // deps means this timeout is set exactly once per mount.
  const [animate, setAnimate] = useState(!reducedMotion);
  useEffect(() => {
    if (reducedMotion) return;
    const t = setTimeout(() => setAnimate(false), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = data
    .map((d) => `${d.sampleDate}: ${d.value}, ${STATUS_LABEL[d.status]}`)
    .join('; ');

  return (
    <div
      className="h-64 w-full"
      role="img"
      aria-label={`Trend chart for ${data.length} result${data.length === 1 ? '' : 's'}. Reference range ${latest.referenceLow} to ${latest.referenceHigh}. ${summary}`}
    >
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
            cursor={{ stroke: brand.taupe, strokeWidth: 1 }}
            contentStyle={{ borderColor: brand.taupe, borderRadius: 6, fontSize: 13 }}
            formatter={(value) => [String(value), 'Value']}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={brand.bronze}
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
  );
}
