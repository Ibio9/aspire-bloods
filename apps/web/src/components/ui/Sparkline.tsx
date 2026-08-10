import { useId } from 'react';
import {
  asMarkerStatus,
  chart as chartTokens,
  statusBands,
  statusPaint,
  bandGradientStops,
  type MarkerStatus,
  type MarkerStatusInput,
  type OptimalRangeDTO,
} from '@aspire-bloods/shared';
import { statusLabel } from '../../lib/markerCopy';

interface SparkPoint {
  sampleDate: string;
  value: number;
  /**
   * Nullable, because the wire is. The server sends only evaluated points, and
   * this filters again on arrival — see the note in the component.
   */
  status: MarkerStatusInput;
}

interface SparklineProps {
  points: SparkPoint[];
  referenceLow: number;
  referenceHigh: number;
  /** Where significantly-out begins for this marker. Absent, the shared default multiplier applies. */
  severityThreshold?: number | null;
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

/** The mark takes its own state's colour, matching the full trend chart's vocabulary. */
function markFill(status: MarkerStatus): string {
  return statusPaint(status).mark;
}

/**
 * Direction of travel at a glance, for a list of forty markers. Hand-drawn
 * SVG rather than a Recharts instance per row — forty ResponsiveContainers
 * with their own resize observers is a lot of machinery to say "this line
 * goes up".
 *
 * Same rules as the full trend chart, at a twelfth the size: no line through
 * fewer than two points, the same five bands derived from this marker's own
 * reference range and severity threshold, and status carried by the final
 * mark's SHAPE first — the row it sits in carries the status word beside it,
 * so nothing here depends on telling green from red.
 */
export function Sparkline({
  points: input,
  referenceLow,
  referenceHigh,
  severityThreshold = null,
  optimal = null,
  width = 96,
  height = 32,
  className = '',
}: SparklineProps) {
  const uid = useId().replace(/:/g, '');
  const hatchId = `spark-hatch-${uid}`;
  const gradId = `spark-band-${uid}`;

  /**
   * A point with no status has no place on a scale of its own reference range.
   *
   * The whole geometry here — which band a value falls in, which shape the
   * final mark takes, what the accessible label says — is derived from the
   * point's status, so a point that was never compared against the range has
   * nothing to contribute and is not plotted. The server already sends only
   * evaluated points (see listAllMarkersForPatient); this is the second lock on
   * the same door, and it is the one that was missing: an unevaluated point
   * reaching `statusLabel` took the whole marker list down with it.
   */
  const points = input.filter((p): p is SparkPoint & { status: MarkerStatus } => asMarkerStatus(p.status) !== null);
  if (points.length === 0) return null;

  const values = points.map((p) => p.value);
  const lo = Math.min(...values, referenceLow);
  const hi = Math.max(...values, referenceHigh);
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.15;
  const domainMin = lo - pad;
  const domainMax = hi + pad;
  const domain = domainMax - domainMin || 1;

  const y = (v: number) => height - ((v - domainMin) / domain) * height;

  // Spaced by real time, not by index. Evenly spaced points say every gap was
  // the same length, so a marker retested at three months and then a year
  // later drew as a steady slope — the same misreading the full trend chart
  // was making, and this row is the first thing anyone scans. UTC midnight
  // because a sample date is a calendar date, not an instant.
  const times = points.map((p) => Date.parse(`${p.sampleDate.slice(0, 10)}T00:00:00Z`));
  const tFirst = Math.min(...times);
  const tSpan = Math.max(...times) - tFirst;
  // Inset by the mark's own radius: the latest point sits at the right-hand
  // end, and drawn at x = width its outer half was clipped off by the viewBox.
  const inset = 3.8;
  const plotW = width - inset * 2;
  const x = (i: number) => (tSpan > 0 ? inset + ((times[i] - tFirst) / tSpan) * plotW : width / 2);

  // The same five regions the full chart draws, clipped to the sparkline's own
  // domain. Derived from this marker's reference range and severity threshold,
  // never a fixed scale — so a 96px-wide sparkline and a full-size trend chart
  // for the same marker put their boundaries in exactly the same places.
  const bands = statusBands(referenceLow, referenceHigh, severityThreshold)
    .map((b) => {
      const top = Math.max(0, y(b.to ?? domainMax));
      const bottom = Math.min(height, y(b.from ?? domainMin));
      return { status: b.status, top, height: bottom - top };
    })
    .filter((b) => b.height > 0.25);

  // The reference bounds, marked. At this size a hairline is all there is
  // room for, and the row's own status word carries the meaning regardless.
  const boundaries = [y(referenceHigh), y(referenceLow)].filter((v) => v >= 0 && v <= height);

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
      <defs>
        {optimal && (
          <pattern id={hatchId} width="5" height="5" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width="5" height="5" fill={chartTokens.optimalBand} fillOpacity={chartTokens.optimalBandOpacity} />
            <line x1="0" y1="0" x2="0" y2="5" stroke={chartTokens.optimalEdge} strokeWidth="1.2" strokeOpacity="0.5" />
          </pattern>
        )}
        {/* Top-to-bottom on screen is high-value-to-low-value, so the stops are
            the reverse of the value-order pair. In range is flat. */}
        {bands.map((b) => {
          const [atLowEnd, atHighEnd] = bandGradientStops(b.status);
          return (
            <linearGradient key={b.status} id={`${gradId}-${b.status}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={atHighEnd} />
              <stop offset="100%" stopColor={atLowEnd} />
            </linearGradient>
          );
        })}
      </defs>
      {bands.map((b) => (
        <rect key={b.status} x="0" y={b.top} width={width} height={b.height} fill={`url(#${gradId}-${b.status})`} />
      ))}
      {boundaries.map((yPos, i) => (
        <line key={i} x1="0" y1={yPos} x2={width} y2={yPos} stroke={chartTokens.referenceEdge} strokeWidth="0.75" strokeOpacity="0.85" />
      ))}
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
