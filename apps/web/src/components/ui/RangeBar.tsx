import { useEffect, useState } from 'react';
import {
  asMarkerStatus,
  formatOptimalRange,
  formatReferenceBound,
  formatReferenceRange,
  hueTint,
  NO_STATUS_PAINT,
  statusBands,
  type MarkerStatusInput,
  type OptimalRangeDTO,
} from '@aspire-bloods/shared';
import { statusLabel } from '../../lib/markerCopy';
import { rangeBarScale } from '../../lib/rangeScale';

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
  /** Only used in the sentence that stands in for a bar that cannot be drawn to scale. */
  unit?: string | null;
}

/**
 * Where a result sits relative to its reference range.
 *
 * ── THE SCALE IS NOT THE REFERENCE RANGE, AND THE LABELS SAY SO ────────────
 *
 * The numbers under the ends of this bar used to be `low` and `high` — the
 * reference bounds — whatever scale had actually been drawn. The geometry
 * already stretched to hold an out-of-range value, so the picture was right and
 * the axis on it was false, which is the worst of the three available
 * combinations: a bar that is obviously wrong gets ignored, and a bar that is
 * quietly wrong gets believed. Two live examples, failing in opposite
 * directions:
 *
 *   · 122 against 0–41 drew the mark hard against the right-hand end, under a
 *     label reading "41". A patient reads that as "just at the top of my
 *     range". They are at three times the upper limit.
 *   · 65 against 125–375 drew the mark inside a bar labelled 125 to 375 — a
 *     range the value is entirely below.
 *
 * So the scale comes from `rangeBarScale` (lib/rangeScale.ts), the printed ends
 * ARE that scale, and the reference bounds are marked and labelled WITHIN it.
 * The mark is never clamped: the scale is built to contain the value with
 * headroom, so there is no edge for it to be pinned to. Where the value is so
 * far out that the reference range would be a sliver, nothing is drawn and the
 * bar says so in words — see `outOfScale`.
 *
 * ── THE TRACK ──────────────────────────────────────────────────────────────
 *
 * The traffic light: green across the lab's reference range, shading out
 * through yellow to orange and then red toward the extremes. Every boundary on
 * it comes from THIS result's own range and this marker's own severity
 * threshold. There is no fixed scale anywhere in here.
 *
 * Three things stop the colour from being the whole story, in the order they
 * are read: the figures under the bar, the hairline ticks at the reference
 * bounds (which is where the shading turns, marked so it is still locatable in
 * greyscale), and the accessible label spelling the result, the range and the
 * status out in words.
 *
 * ── OPTIMAL IS A NARROWING OF IN-RANGE, AND IS DRAWN AS ONE ────────────────
 *
 * It used to be a hatched band with its own legend line, over a green
 * reference band — two green regions in two textures, reading as two competing
 * systems. It is one region now: the part of the reference range that is also
 * optimal, drawn as a deepening of the same green with a hairline where it
 * starts. Nothing about it is a second vocabulary.
 *
 * It is drawn as the INTERSECTION with the reference range, deliberately.
 * "Optimal" here means a narrowing of in-range; a published band whose ceiling
 * sits above the lab's has no narrowing to draw beyond that point, and a green
 * region painted over the yellow segment would be the two-systems problem
 * again, in a worse form. The band's own figures are stated in words beside the
 * bar by the caller, so nothing is lost.
 */
export function RangeBar({ value, low, high, status, severityThreshold = null, optimal = null, unit = null }: RangeBarProps) {
  const scale = rangeBarScale({ low, high, value, severityThreshold });
  const { pct } = scale;
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  const bandLeft = clamp(pct(low));
  const bandRight = clamp(pct(high));

  // NOT CLAMPED. `rangeBarScale` guarantees the value is inside the scale with
  // headroom at both ends, so a clamp here could only ever hide a scale that
  // had stopped containing its own value — which is precisely the bug this
  // component was rebuilt around.
  const pointLeft = pct(value);

  // The five regions, in value order, clipped to what is actually on screen.
  // Each is drawn as its own segment so the boundaries land on real numbers
  // rather than on percentages of a bar. The two outer bands are open-ended —
  // "significantly above" has no ceiling — which is what the clamp is for.
  const segments = statusBands(low, high, severityThreshold)
    .map((b) => {
      const from = clamp(pct(b.from ?? scale.min));
      const to = clamp(pct(b.to ?? scale.max));
      return { ...b, from, to, width: Math.max(0, to - from) };
    })
    .filter((s) => s.width > 0);

  // The optimal region, as the part of the reference range that is also
  // optimal — see the note above. A one-sided band ("below 33") takes the
  // reference bound as its open end, which is what makes it a narrowing.
  const optimalFrom = optimal ? Math.max(low, optimal.low ?? low) : 0;
  const optimalTo = optimal ? Math.min(high, optimal.high ?? high) : 0;
  const optimalLeft = optimal ? clamp(pct(optimalFrom)) : 0;
  const optimalRight = optimal ? clamp(pct(optimalTo)) : 0;
  const optimalWidth = Math.max(0, optimalRight - optimalLeft);
  // Only an edge that is NOT already a reference bound gets a hairline — the
  // bound has one of its own, and two rules on one pixel is a heavier line
  // rather than a second mark.
  const optimalEdges = optimal
    ? [
        ...(optimalFrom > low ? [optimalLeft] : []),
        ...(optimalTo < high ? [optimalRight] : []),
      ]
    : [];

  // Sweeps in from the middle of the band to its true position once, on mount — a two-step
  // render (start position, then true position after a frame) so the browser has something to
  // transition between. motion-safe: strips the transition entirely under reduced-motion, so it
  // lands straight at the true position instead of "moving slowly."
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const displayLeft = settled ? pointLeft : bandLeft + (bandRight - bandLeft) / 2;

  const optimalBand = optimal ? formatOptimalRange(optimal.low, optimal.high, optimal.unit) : null;
  const label =
    `Result ${value}, reference range ${formatReferenceRange(low, high)}, status: ${statusLabel(status)}` +
    (optimalBand ? `. Optimal range ${optimalBand}, ${optimal!.within ? 'within optimal' : 'outside optimal'}` : '');

  // NOTHING DRAWN, AND THE FACT SAID INSTEAD. A reference range rendered as a
  // sliver at one end of a bar is not a scale, and a value drawn at an edge is
  // the failure this component exists to have stopped making.
  if (scale.outOfScale) {
    return (
      <p className="text-xs leading-relaxed text-espresso/85" role="img" aria-label={label}>
        This result is too far outside the reference range to draw on a scale that shows both. Result{' '}
        <span className="numeric">
          {value}
          {unit ? ` ${unit}` : ''}
        </span>
        , reference range <span className="numeric">{formatReferenceRange(low, high, unit)}</span>.
      </p>
    );
  }

  return (
    <div className="w-full" role="img" aria-label={label}>
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
            // A DEEPENING OF THE SAME GREEN, not a second texture. The optimal
            // range is a narrowing of in-range and this is what a narrowing
            // looks like: one region, shaded a step further in where the
            // narrower band sits.
            <div
              className="absolute inset-y-0"
              style={{
                left: `${optimalLeft}%`,
                width: `${optimalWidth}%`,
                backgroundColor: hueTint.green.edge,
                opacity: 0.24,
              }}
            />
          )}
          {optimalEdges.map((left, i) => (
            <div
              key={`optimal-edge-${i}`}
              className="absolute inset-y-0 w-px"
              style={{ left: `${left}%`, backgroundColor: hueTint.green.edge, opacity: 0.6 }}
            />
          ))}
          {/* The two boundaries the whole bar turns on, marked. Without these
              the only thing saying where the reference range ends is the colour
              change, which is exactly what must never be true here. */}
          {[bandLeft, bandRight].map((left, i) => (
            <div key={i} className="absolute inset-y-0 w-px bg-espresso/60" style={{ left: `${left}%` }} />
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
      <ScaleAxis scale={scale} low={low} high={high} />
    </div>
  );
}

/**
 * THE FIGURES UNDER THE BAR, AND WHICH OF THEM ARE WHICH.
 *
 * Four labels at most, and they answer two different questions. The ends say
 * how far the bar reaches — the SCALE, which exists only because the value
 * needed room. The two inner ones are the reference bounds, which are a
 * clinical threshold and are the reason anybody is looking.
 *
 * Told apart by weight and by a mark, never by a hue — the same rule the trend
 * chart's axis follows. A bound carries a short tick up to the track it belongs
 * to and is set in the text colour; a scale end is muted and unmarked.
 *
 * WHERE THEY COLLIDE, THE BOUND WINS AND THE SCALE END GOES. This is the common
 * case rather than an edge one: a marker whose range starts at zero on a scale
 * that also starts at zero has two labels reading "0" in the same place, so
 * dropping the scale end loses nothing at all — the bound label IS the end.
 */
function ScaleAxis({
  scale,
  low,
  high,
}: {
  scale: ReturnType<typeof rangeBarScale>;
  low: number;
  high: number;
}) {
  /**
   * How close two labels may be, as a percentage of the bar, before they are
   * treated as one. Roughly four mono digits at the narrowest place this bar is
   * used (a ~200px card column); wider than that and the allowance is generous,
   * which is the harmless direction — a dropped scale end is a number the bound
   * beside it is already saying.
   */
  const COLLIDE = 14;
  const bounds = [
    { at: Math.max(0, Math.min(100, scale.pct(low))), text: formatReferenceBound(low) },
    { at: Math.max(0, Math.min(100, scale.pct(high))), text: formatReferenceBound(high) },
  ];
  const ends = [
    { at: 0, text: trimNumber(scale.min) },
    { at: 100, text: trimNumber(scale.max) },
  ].filter((end) => !bounds.some((b) => Math.abs(b.at - end.at) < COLLIDE));

  const anchor = (at: number) => (at <= 0.5 ? 'translateX(0)' : at >= 99.5 ? 'translateX(-100%)' : 'translateX(-50%)');

  return (
    <div className="relative mt-1.5 h-8 text-xs" aria-hidden="true">
      {ends.map((end) => (
        <span
          key={`end-${end.at}`}
          className="numeric absolute top-[9px] whitespace-nowrap text-espresso/80"
          style={{ left: `${end.at}%`, transform: anchor(end.at) }}
        >
          {end.text}
        </span>
      ))}
      {bounds.map((b) => (
        <span
          key={`bound-${b.text}`}
          className="absolute top-0 flex flex-col items-center whitespace-nowrap"
          style={{ left: `${b.at}%`, transform: anchor(b.at) }}
        >
          {/* The tick. Three pixels of hairline joining the number to the
              boundary it names, so it is attached to a mark on the track rather
              than merely level with one. */}
          <span className="h-[5px] w-px bg-espresso/60" />
          <span className="numeric mt-[3px] text-espresso">{b.text}</span>
        </span>
      ))}
    </div>
  );
}

/** A scale end, with float noise off it. The ends come off a 1/2/2.5/5 ladder, so this only ever removes an artefact. */
function trimNumber(value: number): string {
  return String(Number(value.toFixed(6)));
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
 * Everything else is identical, and that is the point: THE SAME SCALE
 * (lib/rangeScale.ts), the same statusBands() boundaries derived from this
 * result's own reference range and this marker's own severity threshold, the
 * same three hues, the same reference-bound ticks. Somebody who has read the
 * big one recognises this one immediately — and, since the scale is shared, the
 * two can no longer disagree about where a result sits.
 */
export function MiniRangeBar({
  value,
  low,
  high,
  status,
  severityThreshold = null,
}: Omit<RangeBarProps, 'optimal' | 'unit'>) {
  const scale = rangeBarScale({ low, high, value, severityThreshold });
  const { pct } = scale;
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  const bandLeft = clamp(pct(low));
  const bandRight = clamp(pct(high));
  // Not clamped, for the same reason as the full bar: the scale contains it.
  const pointLeft = pct(value);

  const segments = statusBands(low, high, severityThreshold)
    .map((b) => {
      const from = clamp(pct(b.from ?? scale.min));
      const to = clamp(pct(b.to ?? scale.max));
      return { ...b, from, width: Math.max(0, to - from) };
    })
    .filter((s) => s.width > 0);

  const label = `Result ${value}, reference range ${formatReferenceRange(low, high)}, status: ${statusLabel(status)}`;

  // Said rather than drawn — the same rule as the full bar. The value, the
  // range and the status are all directly below this on the card, so one short
  // line is enough to explain the absence.
  if (scale.outOfScale) {
    return (
      <p className="text-xs leading-snug text-espresso/85" role="img" aria-label={label}>
        Too far outside the range to draw to scale
      </p>
    );
  }

  return (
    <div className="w-full" role="img" aria-label={label}>
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
