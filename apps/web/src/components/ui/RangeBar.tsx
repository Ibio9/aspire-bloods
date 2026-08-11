import { useEffect, useState } from 'react';
import {
  asMarkerStatus,
  chart as chartTokens,
  hueTint,
  NO_STATUS_PAINT,
  statusBands,
  severityThresholdFor,
  formatOptimalRange,
  type MarkerStatusInput,
  type OptimalRangeDTO,
} from '@aspire-bloods/shared';
import { statusLabel } from '../../lib/markerCopy';

interface RangeBarProps {
  value: number;
  low: number;
  high: number;
  /**
   * Nullable because the wire is. Callers already decline to draw a bar for a
   * result that was never placed against its range — this type says so, and the
   * label below survives it either way rather than throwing inside an
   * `aria-label`.
   */
  status: MarkerStatusInput;
  /**
   * Where significantly-out begins for this marker, in the same units as the
   * value. Absent, the shared default multiplier is applied to the range's own
   * width — see severityThresholdFor.
   */
  severityThreshold?: number | null;
  /** The advisory optimal band. Omitted, and nothing drawn, when the marker has no established one. */
  optimal?: OptimalRangeDTO | null;
}

/**
 * Where a result sits relative to its reference range.
 *
 * The track is the traffic light: green across the lab's reference range,
 * shading out through yellow to orange and then red toward the extremes. Every
 * boundary on it comes from THIS result's own range and this marker's own
 * severity threshold — the green segment is exactly `low`–`high`, and the
 * yellow ends exactly where the status changes to significantly out. There is
 * no fixed scale anywhere in here.
 *
 * Three things stop the colour from being the whole story, in the order they
 * are read: the numbers printed under the ends of the bar, the hairline ticks
 * at the reference bounds (which is where the shading turns, marked so it is
 * still locatable in greyscale), and the accessible label spelling the result,
 * the range and the status out in words.
 *
 * Where the marker has an established optimal range, a second, hatched band is
 * drawn over the track. Two bands, told apart by texture rather than tone, and
 * both labelled: the patient has to be able to say which one is the lab's
 * without decoding a colour.
 */
export function RangeBar({ value, low, high, status, severityThreshold = null, optimal = null }: RangeBarProps) {
  const width = high - low || 1;
  const threshold = severityThresholdFor(low, high, severityThreshold);
  // The domain has to hold the whole yellow shoulder on both sides, or the bar
  // would show a green band with nothing either side of it and the gradient
  // would have nowhere to happen. It also has to hold the value itself and the
  // optimal band, which can legitimately sit outside the reference band (a
  // desirable ceiling below the lab's, say) and would otherwise be clipped to
  // the edge and read as reaching further than it does.
  const optionalBounds = [optimal?.low, optimal?.high].filter((v): v is number => typeof v === 'number');
  // Wide enough to show a real shoulder either side, capped so the reference
  // band stays the thing the eye lands on. Uncapped, a marker whose severity
  // threshold dwarfs its range (ferritin's is 270 against a 180-wide band)
  // squeezed the green segment into a fifth of the bar, which inverts what
  // the bar is for.
  const pad = Math.min(Math.max(width * 0.4, threshold * 0.6), width * 0.9);
  const rawMin = Math.min(low - pad, value - width * 0.1, ...optionalBounds);
  // Same rule as the trend chart: no shading below zero for a marker that
  // cannot be negative.
  const nonNegative = Math.min(low, value, ...optionalBounds) >= 0;
  const domainMin = nonNegative ? Math.max(0, rawMin) : rawMin;
  const domainMax = Math.max(high + pad, value + width * 0.1, ...optionalBounds);
  const domain = domainMax - domainMin || 1;

  const pct = (v: number) => ((v - domainMin) / domain) * 100;
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  const bandLeft = pct(low);
  const bandWidth = pct(high) - pct(low);
  const pointLeft = clamp(pct(value));

  // The five regions, in value order, clipped to what is actually on screen.
  // Each is drawn as its own segment so the boundaries land on real numbers
  // rather than on percentages of a bar.
  const segments = statusBands(low, high, severityThreshold)
    .map((b) => {
      const from = clamp(pct(b.from ?? domainMin));
      const to = clamp(pct(b.to ?? domainMax));
      return { ...b, from, to, width: Math.max(0, to - from) };
    })
    .filter((s) => s.width > 0);

  // Same rule as the trend chart: the open side of a one-sided band stops at
  // the reference bound (or the value, if it sits beyond it), not at the end
  // of the bar — a band running the full width says "everything is optimal",
  // which is not what "below 5.0" means.
  const optimalLeft = optimal ? clamp(pct(optimal.low ?? Math.max(domainMin, Math.min(low, value)))) : 0;
  const optimalRight = optimal ? clamp(pct(optimal.high ?? Math.min(domainMax, Math.max(high, value)))) : 0;
  const optimalWidth = Math.max(0, optimalRight - optimalLeft);

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

  const optimalBand = optimal ? formatOptimalRange(optimal.low, optimal.high, optimal.unit) : null;

  return (
    <div
      className="w-full"
      role="img"
      aria-label={
        `Result ${value}, reference range ${low} to ${high}, status: ${statusLabel(status)}` +
        (optimalBand ? `. Optimal range ${optimalBand}, ${optimal!.within ? 'within optimal' : 'outside optimal'}` : '')
      }
    >
      {/* The dot has to overhang the track, and the track has to clip its own
          segments to a rounded-input pill — two things one element can't do, so the
          clipping box is inset inside a wrapper the dot is free to overflow. */}
      <div className="relative h-2.5" aria-hidden="true">
      <div className="absolute inset-0 overflow-hidden rounded-full bg-cream-300">
        {segments.map((s) => (
          <div
            key={s.status}
            className="absolute inset-y-0"
            style={{
              left: `${s.from}%`,
              width: `${s.width}%`,
              // In range is flat; the four out-of-range segments are the
              // transition itself, so each one is a gradient rather than a
              // block — which is what puts orange between yellow and red
              // without ever making orange a state of its own.
              background: gradientFor(s.status),
            }}
          />
        ))}
        {optimal && optimalWidth > 0 && (
          // Hatched, so it is told apart from the lab band by texture and not
          // by tone alone. Sits on top; the track still reads underneath it.
          <div
            className="absolute inset-y-0"
            style={{
              left: `${optimalLeft}%`,
              width: `${optimalWidth}%`,
              backgroundImage: `repeating-linear-gradient(45deg, ${chartTokens.optimalEdge} 0 1.5px, transparent 1.5px 5px)`,
              opacity: 0.9,
            }}
          />
        )}
        {/* The two boundaries the whole bar turns on, marked. Without these
            the only thing saying where the reference range ends is the colour
            change, which is exactly what must never be true here. */}
        {[bandLeft, bandLeft + bandWidth].map((left, i) => (
          <div
            key={i}
            className="absolute inset-y-0 w-px bg-espresso/60"
            style={{ left: `${clamp(left)}%` }}
          />
        ))}
      </div>
        {/* The result itself. NOT in its own state's colour any more: the mark
            sits on a track made of that colour, so a green dot on the green
            segment and a pale gold one on the gold segment were marks drawn in
            the shade they were standing on. It is the rangemark token instead —
            white on dark, espresso on light, always inside the opposite ring —
            and its job is position. Status is still carried four times over by
            the segment it lands on, the chevron, the word and the card's wash.
            See tokens.ts for the measured contrast behind the theme split. */}
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-rangemark-ring bg-rangemark shadow motion-safe:transition-[left] motion-safe:duration-500 motion-safe:ease-out"
          style={{ left: `${displayLeft}%` }}
        />
      </div>
      {/* The two bounds ARE the data — a bare number with no words around it —
          so they are set in the mono face like every other number in the
          product. They carried `.tabular` alone, which gave them tabular
          figures in the body face: right about the figures, wrong about the
          family, and directly under a value that is in mono. */}
      <div className="mt-1.5 flex justify-between text-xs text-espresso" aria-hidden="true">
        <span className="numeric">{low}</span>
        <span className="numeric">{high}</span>
      </div>
      {optimalBand && (
        <p className="mt-2 flex items-center gap-2 text-xs text-espresso/80" aria-hidden="true">
          <span
            className="inline-block h-2.5 w-5 shrink-0 rounded-full"
            style={{
              backgroundImage: `repeating-linear-gradient(45deg, ${chartTokens.optimalEdge} 0 1.5px, transparent 1.5px 5px)`,
              backgroundColor: chartTokens.optimalBand,
              opacity: 0.75,
            }}
          />
          {/* "Optimal" is a word and the band is data, so the family changes
              at the boundary between them rather than across the whole line. */}
          <span>
            Optimal <span className="numeric">{optimalBand}</span>
          </span>
        </p>
      )}
    </div>
  );
}

/**
 * THE CARD-SIZED VERSION of the bar above, and deliberately the same
 * instrument rather than a second one.
 *
 * It replaces the mini sparkline that used to sit at the foot of a marker
 * card. A sparkline at that size answers "which way is it going", which is a
 * question about history; the question a card of forty markers actually gets
 * asked is "where does this one sit", which is a question about position, and
 * the bar is the thing that answers it. The history is still one click away on
 * the marker's own page, where there is room to plot it honestly.
 *
 * Three differences from the full bar, all of them size:
 *  · FLAT SEGMENTS, no gradient. At 8px tall and a third of a card wide, a
 *    yellow-to-orange gradient is a smear; the boundaries have to be legible
 *    at a glance or the bar is decoration.
 *  · No axis numbers. The reference range is printed under the value on the
 *    card in words, so repeating it here would be the same fact twice in a
 *    space that has none to spare.
 *  · The result is a POINTER above the track rather than a dot on it, so it is
 *    still findable where it sits on a segment of its own colour.
 *
 * Everything else is identical, and that is the point: the same statusBands()
 * boundaries derived from this result's own reference range and this marker's
 * own severity threshold, the same three hues, the same reference-bound ticks.
 * Somebody who has read the big one recognises this one immediately.
 */
export function MiniRangeBar({
  value,
  low,
  high,
  status,
  severityThreshold = null,
}: Omit<RangeBarProps, 'optimal'>) {
  const width = high - low || 1;
  const threshold = severityThresholdFor(low, high, severityThreshold);
  // Same domain rule as the full bar: wide enough to show a real shoulder
  // either side, capped so the reference band stays the thing the eye lands
  // on. A marker whose severity threshold dwarfs its range would otherwise
  // squeeze the green segment into a fifth of the bar, which inverts what the
  // bar is for.
  const pad = Math.min(Math.max(width * 0.4, threshold * 0.6), width * 0.9);
  const rawMin = Math.min(low - pad, value - width * 0.1);
  const nonNegative = Math.min(low, value) >= 0;
  const domainMin = nonNegative ? Math.max(0, rawMin) : rawMin;
  const domainMax = Math.max(high + pad, value + width * 0.1);
  const domain = domainMax - domainMin || 1;

  const pct = (v: number) => ((v - domainMin) / domain) * 100;
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  const bandLeft = clamp(pct(low));
  const bandRight = clamp(pct(high));
  const pointLeft = clamp(pct(value));

  const segments = statusBands(low, high, severityThreshold)
    .map((b) => {
      const from = clamp(pct(b.from ?? domainMin));
      const to = clamp(pct(b.to ?? domainMax));
      return { ...b, from, width: Math.max(0, to - from) };
    })
    .filter((s) => s.width > 0);

  return (
    <div
      className="w-full"
      role="img"
      aria-label={`Result ${value}, reference range ${low} to ${high}, status: ${statusLabel(status)}`}
    >
      {/* The pointer's own row, so the triangle has somewhere to live without
          overlapping the track or being clipped by it.

          AN SVG TRIANGLE RATHER THAN A CSS BORDER TRICK, and the reason is the
          ring. The full bar's dot takes the rangemark fill inside the opposite
          ring, and this mark has to be the same instrument at a smaller size —
          but a triangle made of borders has no stroke to be a ring with. Drawn
          as a path it takes the same two tokens, so both bars mark the result
          the same way: a light mark in a dark ring on the dark theme, the
          reverse on the light one, and neither of them coloured by status. */}
      <div className="relative h-2" aria-hidden="true">
        <svg
          className="absolute top-0 -translate-x-1/2 fill-rangemark stroke-rangemark-ring"
          style={{ left: `${pointLeft}%` }}
          width="12"
          height="8"
          viewBox="0 0 12 8"
          aria-hidden="true"
        >
          <path d="M6 7 1 1.2h10L6 7Z" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-cream-300" aria-hidden="true">
        {segments.map((s) => (
          <div
            key={s.status}
            className="absolute inset-y-0"
            style={{ left: `${s.from}%`, width: `${s.width}%`, backgroundColor: flatFillFor(s.status) }}
          />
        ))}
        {/* The two reference bounds, marked. Without these the only thing
            saying where the range ends is the colour change, which is exactly
            what must never be true here — at this size most of all. */}
        {[bandLeft, bandRight].map((left, i) => (
          <div key={i} className="absolute inset-y-0 w-px bg-espresso/60" style={{ left: `${left}%` }} />
        ))}
      </div>
    </div>
  );
}

/**
 * The flat fill for one segment of the compact bar. Three hues, no transition:
 * yellow either side of green, red at both extremes. Orange is absent on
 * purpose — it is the hinge between yellow and red in a gradient, and there is
 * no gradient here for it to be the hinge of.
 */
function flatFillFor(status: MarkerStatusInput): string {
  switch (asMarkerStatus(status)) {
    case 'SIGNIFICANT_LOW':
    case 'SIGNIFICANT_HIGH':
      return hueTint.red.track;
    case 'LOW':
    case 'HIGH':
      return hueTint.yellow.track;
    case 'IN_RANGE':
      return hueTint.green.track;
    default:
      return NO_STATUS_PAINT.bar;
  }
}

/**
 * The fill for one segment of the track, left to right in value order.
 *
 * In range is a flat green. The two mildly-out segments run from yellow at the
 * reference bound out to orange at the significantly-out threshold, and the
 * two significantly-out segments carry on from orange into red — so the colour
 * is continuous across the whole bar and orange is only ever the hinge between
 * the two, never a state.
 */
function gradientFor(status: MarkerStatusInput): string {
  const g = hueTint.green.track;
  const y = hueTint.yellow.track;
  const o = hueTint.orange.track;
  const r = hueTint.red.track;
  switch (asMarkerStatus(status)) {
    case 'SIGNIFICANT_LOW':
      return `linear-gradient(to right, ${r}, ${o})`;
    case 'LOW':
      return `linear-gradient(to right, ${o}, ${y})`;
    case 'IN_RANGE':
      return g;
    case 'HIGH':
      return `linear-gradient(to right, ${y}, ${o})`;
    case 'SIGNIFICANT_HIGH':
      return `linear-gradient(to right, ${o}, ${r})`;
    default:
      // The switch had no default and returned `undefined` for anything else,
      // which is not a background value: the segment rendered as the bare
      // track. The segments here are always generated by statusBands, so this
      // is unreachable by construction — and stated rather than assumed.
      return NO_STATUS_PAINT.bar;
  }
}
