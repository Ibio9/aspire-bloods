import { useEffect, useState } from 'react';
import { status as statusTokens, type MarkerStatus } from '@aspire-bloods/shared';

interface RangeBarProps {
  value: number;
  low: number;
  high: number;
  status: MarkerStatus;
}

const STATUS_MAP: Record<MarkerStatus, keyof typeof statusTokens> = {
  IN_RANGE: 'inRange',
  HIGH: 'high',
  LOW: 'low',
  SIGNIFICANT_HIGH: 'significantHigh',
  SIGNIFICANT_LOW: 'significantLow',
};

/** Shows where a result sits relative to its reference range — the healthy band is shaded taupe, the point takes a status color only when out of range. */
export function RangeBar({ value, low, high, status }: RangeBarProps) {
  const width = high - low || 1;
  const pad = width * 0.4;
  const domainMin = Math.min(low - pad, value - width * 0.1);
  const domainMax = Math.max(high + pad, value + width * 0.1);
  const domain = domainMax - domainMin || 1;

  const pct = (v: number) => ((v - domainMin) / domain) * 100;
  const bandLeft = pct(low);
  const bandWidth = pct(high) - pct(low);
  const pointLeft = Math.min(100, Math.max(0, pct(value)));

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

  return (
    <div className="w-full" role="img" aria-label={`Result ${value}, reference range ${low} to ${high}, status: ${statusLabel}`}>
      <div className="relative h-2 rounded-full bg-cream-300" aria-hidden="true">
        <div
          className="absolute h-2 rounded-full bg-taupe"
          style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }}
        />
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow motion-safe:transition-[left] motion-safe:duration-500 motion-safe:ease-out"
          style={{ left: `${displayLeft}%`, backgroundColor: dotColor }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-xs tabular text-espresso" aria-hidden="true">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}
