import { brand, type MarkerStatus } from '@aspire-bloods/shared';
import { statusHex, statusLabel } from '../../lib/markerCopy';

interface SparkPoint {
  sampleDate: string;
  value: number;
  status: MarkerStatus;
}

interface SparklineProps {
  points: SparkPoint[];
  referenceLow: number;
  referenceHigh: number;
  width?: number;
  height?: number;
  className?: string;
}

/**
 * Direction of travel at a glance, for a list of forty markers. Hand-drawn
 * SVG rather than a Recharts instance per row — forty ResponsiveContainers
 * with their own resize observers is a lot of machinery to say "this line
 * goes up".
 *
 * The taupe band is the reference range, so the line's position within it
 * reads without a legend. The final point takes its status colour; every
 * earlier point is left plain, because the only status being asserted here
 * is the current one.
 */
export function Sparkline({ points, referenceLow, referenceHigh, width = 96, height = 32, className = '' }: SparklineProps) {
  if (points.length === 0) return null;

  const values = points.map((p) => p.value);
  const lo = Math.min(...values, referenceLow);
  const hi = Math.max(...values, referenceHigh);
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.15;
  const domainMin = lo - pad;
  const domainMax = hi + pad;
  const domain = domainMax - domainMin || 1;

  const y = (v: number) => height - ((v - domainMin) / domain) * height;
  const x = (i: number) => (points.length === 1 ? width / 2 : (i / (points.length - 1)) * width);

  const bandTop = y(referenceHigh);
  const bandHeight = Math.max(1, y(referenceLow) - y(referenceHigh));
  const last = points[points.length - 1];
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');

  const direction =
    points.length < 2 ? 'no earlier result' : last.value > points[points.length - 2].value ? 'rising' : last.value < points[points.length - 2].value ? 'falling' : 'unchanged';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      role="img"
      aria-label={`${points.length} result${points.length === 1 ? '' : 's'}, ${direction}, latest ${last.value}, ${statusLabel(last.status)}`}
    >
      <rect x="0" y={bandTop} width={width} height={bandHeight} fill={brand.taupe} fillOpacity={0.35} />
      {points.length > 1 && <path d={path} fill="none" stroke={brand.bronze} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />}
      <circle cx={x(points.length - 1)} cy={y(last.value)} r="3" fill={statusHex(last.status)} stroke={brand.white} strokeWidth="1.2" />
    </svg>
  );
}
