import { useEffect, useState } from 'react';
import {
  status as statusTokens,
  chart as chartTokens,
  formatOptimalRange,
  type MarkerStatus,
  type OptimalRangeDTO,
} from '@aspire-bloods/shared';

interface RangeBarProps {
  value: number;
  low: number;
  high: number;
  status: MarkerStatus;
  /** The advisory optimal band. Omitted, and nothing drawn, when the marker has no established one. */
  optimal?: OptimalRangeDTO | null;
}

const STATUS_MAP: Record<MarkerStatus, keyof typeof statusTokens> = {
  IN_RANGE: 'inRange',
  HIGH: 'high',
  LOW: 'low',
  SIGNIFICANT_HIGH: 'significantHigh',
  SIGNIFICANT_LOW: 'significantLow',
};

/**
 * Where a result sits relative to its reference range — the lab's band shaded
 * taupe, the point taking a status colour only when out of range.
 *
 * Where the marker has an established optimal range, a second, hatched band is
 * drawn over the first. Two bands, visibly different in texture rather than
 * only in tone, and both labelled underneath: the patient has to be able to
 * say which one is the lab's without decoding a colour.
 */
export function RangeBar({ value, low, high, status, optimal = null }: RangeBarProps) {
  const width = high - low || 1;
  const pad = width * 0.4;
  // The optimal band can sit outside the reference band (a desirable ceiling
  // below the lab's, say), so the domain has to make room for it or it would
  // be clipped to the edge and read as reaching further than it does.
  const optionalBounds = [optimal?.low, optimal?.high].filter((v): v is number => typeof v === 'number');
  const domainMin = Math.min(low - pad, value - width * 0.1, ...optionalBounds);
  const domainMax = Math.max(high + pad, value + width * 0.1, ...optionalBounds);
  const domain = domainMax - domainMin || 1;

  const pct = (v: number) => ((v - domainMin) / domain) * 100;
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  const bandLeft = pct(low);
  const bandWidth = pct(high) - pct(low);
  const pointLeft = clamp(pct(value));

  // Same rule as the trend chart: the open side of a one-sided band stops at
  // the reference bound (or the value, if it sits beyond it), not at the end
  // of the bar — a band running the full width says "everything is optimal",
  // which is not what "below 5.0" means.
  const optimalLeft = optimal ? clamp(pct(optimal.low ?? Math.max(domainMin, Math.min(low, value)))) : 0;
  const optimalRight = optimal ? clamp(pct(optimal.high ?? Math.min(domainMax, Math.max(high, value)))) : 0;
  const optimalWidth = Math.max(0, optimalRight - optimalLeft);

  const dotColor = status === 'IN_RANGE' ? statusTokens.inRange.hex : statusTokens[STATUS_MAP[status]].hex;

  // Sweeps in from the middle of the band to its true position once, on mount — a two-step
  // render (start position, then true position after a frame) so the browser has something to
  // transition between. motion-safe: strips the transition entirely under reduced-motion, so it
  // lands straight at the true position instead of "moving slowly."
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const displayLeft = settled ? pointLeft : bandLeft + bandWidth / 2;

  const statusLabel = statusTokens[status === 'IN_RANGE' ? 'inRange' : STATUS_MAP[status]].label;
  const optimalBand = optimal ? formatOptimalRange(optimal.low, optimal.high, optimal.unit) : null;

  return (
    <div
      className="w-full"
      role="img"
      aria-label={
        `Result ${value}, reference range ${low} to ${high}, status: ${statusLabel}` +
        (optimalBand ? `. Optimal range ${optimalBand}, ${optimal!.within ? 'within optimal' : 'outside optimal'}` : '')
      }
    >
      <div className="relative h-2.5 rounded-full bg-cream-300" aria-hidden="true">
        <div className="absolute h-2.5 rounded-full bg-taupe" style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }} />
        {optimal && optimalWidth > 0 && (
          // Hatched, so it is told apart from the lab band by texture and not
          // by tone alone. Sits on top; the lab band still reads underneath it.
          <div
            className="absolute h-2.5 rounded-full"
            style={{
              left: `${optimalLeft}%`,
              width: `${optimalWidth}%`,
              backgroundImage: `repeating-linear-gradient(45deg, ${chartTokens.optimalEdge} 0 1.5px, transparent 1.5px 5px)`,
              backgroundColor: chartTokens.optimalBand,
              opacity: 0.75,
            }}
          />
        )}
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow motion-safe:transition-[left] motion-safe:duration-500 motion-safe:ease-out"
          style={{ left: `${displayLeft}%`, backgroundColor: dotColor }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-xs tabular text-espresso" aria-hidden="true">
        <span>{low}</span>
        <span>{high}</span>
      </div>
      {optimalBand && (
        <p className="mt-2 flex items-center gap-2 text-xs text-espresso/75" aria-hidden="true">
          <span
            className="inline-block h-2.5 w-5 shrink-0 rounded-full"
            style={{
              backgroundImage: `repeating-linear-gradient(45deg, ${chartTokens.optimalEdge} 0 1.5px, transparent 1.5px 5px)`,
              backgroundColor: chartTokens.optimalBand,
              opacity: 0.75,
            }}
          />
          <span className="tabular">Optimal {optimalBand}</span>
        </p>
      )}
    </div>
  );
}
