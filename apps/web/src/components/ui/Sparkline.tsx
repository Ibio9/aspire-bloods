import { useId } from 'react';
import { chart as chartTokens, type MarkerStatus, type OptimalRangeDTO } from '@aspire-bloods/shared';
import { statusLabel } from '../../lib/markerCopy';

interface SparkPoint {
  sampleDate: string;
  value: number;
  status: MarkerStatus;
}

interface SparklineProps {
  points: SparkPoint[];
  referenceLow: number;
  referenceHigh: number;
  /** The advisory optimal band, drawn as a hatch inside the reference band. Omitted when the marker has no established one. */
  optimal?: OptimalRangeDTO | null;
  width?: number;
  height?: number;
  className?: string;
}

/** Status by shape, matching TrendChart's vocabulary at sparkline scale. */
function markPath(cx: number, cy: number, status: MarkerStatus, r: number): { shape: 'circle' | 'poly'; points?: string } {
  if (status === 'IN_RANGE') return { shape: 'circle' };
  const up = status === 'HIGH' || status === 'SIGNIFICANT_HIGH';
  return {
    shape: 'poly',
    points: up
      ? `${cx},${cy - r} ${cx + r},${cy + r * 0.65} ${cx - r},${cy + r * 0.65}`
      : `${cx},${cy + r} ${cx + r},${cy - r * 0.65} ${cx - r},${cy - r * 0.65}`,
  };
}

function markFill(status: MarkerStatus): string {
  if (status === 'IN_RANGE') return chartTokens.point;
  if (status === 'SIGNIFICANT_HIGH' || status === 'SIGNIFICANT_LOW') return chartTokens.pointFarOut;
  return chartTokens.pointOut;
}

/**
 * Direction of travel at a glance, for a list of forty markers. Hand-drawn
 * SVG rather than a Recharts instance per row — forty ResponsiveContainers
 * with their own resize observers is a lot of machinery to say "this line
 * goes up".
 *
 * Same three rules as the full trend chart, at a twelfth the size: no line
 * through fewer than two points, palette colours only, and status carried by
 * the final mark's shape rather than by a hue.
 */
export function Sparkline({
  points,
  referenceLow,
  referenceHigh,
  optimal = null,
  width = 96,
  height = 32,
  className = '',
}: SparklineProps) {
  const hatchId = `spark-hatch-${useId().replace(/:/g, '')}`;
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

  // The open side of a one-sided band stops at the reference bound (or the
  // furthest value beyond it), not at the edge of the sparkline — same rule
  // as the full trend chart, so the two never disagree about where a band ends.
  const optimalTop = optimal ? y(optimal.high ?? Math.min(domainMax, Math.max(referenceHigh, ...values))) : 0;
  const optimalHeight = optimal
    ? Math.max(1, y(optimal.low ?? Math.max(domainMin, Math.min(referenceLow, ...values))) - optimalTop)
    : 0;

  const direction =
    points.length < 2
      ? 'no earlier result'
      : last.value > points[points.length - 2].value
        ? 'rising'
        : last.value < points[points.length - 2].value
          ? 'falling'
          : 'unchanged';

  const mark = markPath(x(points.length - 1), y(last.value), last.status, 3.2);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      role="img"
      aria-label={`${points.length} result${points.length === 1 ? '' : 's'}, ${direction}, latest ${last.value}, ${statusLabel(last.status).toLowerCase()}`}
    >
      {optimal && (
        <defs>
          <pattern id={hatchId} width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width="5" height="5" fill={chartTokens.optimalBand} fillOpacity={chartTokens.optimalBandOpacity} />
            <line x1="0" y1="0" x2="0" y2="5" stroke={chartTokens.optimalEdge} strokeWidth="1.2" strokeOpacity="0.5" />
          </pattern>
        </defs>
      )}
      <rect
        x="0"
        y={bandTop}
        width={width}
        height={bandHeight}
        fill={chartTokens.referenceBand}
        fillOpacity={chartTokens.referenceBandOpacity}
      />
      {optimal && <rect x="0" y={optimalTop} width={width} height={optimalHeight} fill={`url(#${hatchId})`} />}
      {/* Never a path through fewer than two points. */}
      {points.length > 1 && (
        <path d={path} fill="none" stroke={chartTokens.line} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      )}
      {mark.shape === 'circle' ? (
        <circle
          cx={x(points.length - 1)}
          cy={y(last.value)}
          r="3.2"
          fill={markFill(last.status)}
          stroke={chartTokens.pointRing}
          strokeWidth="1.2"
        />
      ) : (
        <polygon points={mark.points} fill={markFill(last.status)} stroke={chartTokens.pointRing} strokeWidth="1.2" />
      )}
    </svg>
  );
}
