import { useEffect, useState } from 'react';
import {
  bandRampStops,
  formatOptimalRange,
  formatReferenceBound,
  formatReferenceRange,
  chart as chartTokens,
  OPTIMAL_FILL,
  severityThresholdFor,
  statusBands,
  TRANSITION_SHARE,
  type MarkerStatusInput,
  type OptimalRangeDTO,
} from '@aspire-bloods/shared';
import { statusLabel } from '../../lib/markerCopy';
import {
  RANGE_BAR_UNAVAILABLE,
  rangeBarScale,
  type RangeBarScale as Scale,
  type RangeBarUndrawable,
} from '../../lib/rangeScale';

interface RangeBarProps {
  /**
   * All three are nullable because the wire is: a qualitative result carries no
   * numeric value, and a marker can reach a screen with one or both reference
   * bounds missing. Callers guard where they can, but typing these as plain
   * numbers never stopped a null arriving — it only stopped the component from
   * being written to survive one. `rangeBarScale` refuses each case by name and
   * the bar says which in words.
   */
  value: number | null | undefined;
  low: number | null | undefined;
  high: number | null | undefined;
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
 * The traffic light: green across the lab's reference range, gold outside it,
 * red beyond the significantly-out thresholds — each region FLAT, and each
 * handing over to the next across a blend CENTRED ON the boundary between them.
 * The same instrument as the trend chart's bands, from the same derivation
 * (`bandRampStops`), so the bar and the chart speak one visual language: a
 * boundary is where the colour changes, and it sits at the midpoint of the
 * change rather than at its edge. Every boundary comes from THIS result's own
 * range and this marker's own severity threshold. There is no fixed scale
 * anywhere in here.
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

  // Sweeps in from the middle of the band to its true position once, on mount — a two-step
  // render (start position, then true position after a frame) so the browser has something to
  // transition between. motion-safe: strips the transition entirely under reduced-motion, so it
  // lands straight at the true position instead of "moving slowly."
  // Before the refusal below, because a hook that runs on some renders and not
  // others is not a hook.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const optimalBand = optimal ? formatOptimalRange(optimal.low, optimal.high, optimal.unit) : null;
  const label =
    accessibleLabel(value, low, high, status) +
    (optimalBand ? `. Optimal range ${optimalBand}, ${optimal!.within ? 'within optimal' : 'outside optimal'}` : '');

  // NOTHING DRAWN, AND THE FACT SAID INSTEAD — with the sentence naming WHICH
  // fact. A reference range rendered as a sliver at one end of a bar is not a
  // scale; neither is a result with no range, a range with no width, or a
  // result with no numeric value. All four used to share one sentence about
  // being far outside the reference range, which was true of exactly one of
  // them. See RANGE_BAR_UNAVAILABLE.
  if (scale.outOfScale) {
    return <UnavailableBar reason={scale.undrawable} value={value} low={low} high={high} unit={unit} label={label} />;
  }

  // Past the refusal, and only past it, these are real numbers — the scale
  // carries the ones it was built from, so the bar and its axis cannot be
  // reading two different versions of the same result.
  const { pct, low: lowN, high: highN, value: valueN } = scale;
  const clamp = clampPct;
  const bandLeft = clamp(pct(lowN));
  const bandRight = clamp(pct(highN));

  // NOT CLAMPED. `rangeBarScale` guarantees the value is inside the scale with
  // headroom at both ends, so a clamp here could only ever hide a scale that
  // had stopped containing its own value — which is precisely the bug this
  // component was rebuilt around.
  const pointLeft = pct(valueN);

  // ONE GRADIENT ACROSS THE WHOLE TRACK, rather than five abutting segments.
  // The five regions used to be five positioned elements, which is what a
  // per-band ramp needed; a ramp that lives AT the boundaries is one continuous
  // statement from end to end, and drawing it as one is what makes it
  // impossible for two neighbours to disagree by a rounding at the seam.
  const track = trackGradient(scale, lowN, highN, severityThreshold);

  // The optimal region, as the part of the reference range that is also
  // optimal — see the note above. A one-sided band ("below 33") takes the
  // reference bound as its open end, which is what makes it a narrowing.
  const optimalFrom = optimal ? Math.max(lowN, optimal.low ?? lowN) : 0;
  const optimalTo = optimal ? Math.min(highN, optimal.high ?? highN) : 0;
  const optimalLeft = optimal ? clamp(pct(optimalFrom)) : 0;
  const optimalRight = optimal ? clamp(pct(optimalTo)) : 0;
  const optimalWidth = Math.max(0, optimalRight - optimalLeft);
  // Only an edge that is NOT already a reference bound gets a hairline — the
  // bound has one of its own, and two rules on one pixel is a heavier line
  // rather than a second mark.
  const optimalEdges = optimal
    ? [
        ...(optimalFrom > lowN ? [optimalLeft] : []),
        ...(optimalTo < highN ? [optimalRight] : []),
      ]
    : [];

  const displayLeft = settled ? pointLeft : bandLeft + (bandRight - bandLeft) / 2;

  return (
    /**
     * ── THE BAR NEVER PAINTS OUTSIDE ITSELF (Aug 2026) ─────────────────────
     *
     * `MARK_GUTTER` reserves the mark's own overhang on both sides, and it is
     * measured rather than chosen: the dot is `h-3.5 w-3.5` (14px) centred with
     * `-translate-x-1/2`, so at 0% or 100% exactly half of it — 7px — is drawn
     * outside the track.
     *
     * That is not hypothetical and it is what "the bar runs past the card's
     * edges, and it is inconsistent from card to card" was. `rangeBarScale`
     * guarantees `MARK_HEADROOM` (6%) at the TOP end and deliberately yields it
     * at the bottom: a quantity that cannot be negative gets a hard floor at
     * zero, so a value of 0 lands at 0% and the dot hangs 7px into the card's
     * padding. Whether it did depended on the value, which is exactly why one
     * card looked different from the next.
     *
     * Reserving the gutter is the fix rather than clamping the mark. Clamping
     * would move the mark off the position it is drawn to state, which is the
     * one thing this component may not do (see rangeScale.ts, rule 1). The
     * track loses 14px of width and gains the guarantee that every bar in a row
     * is the same length and none of them reaches its card's border.
     */
    <div className="w-full px-[7px]" role="img" aria-label={label}>
      {/* The dot has to overhang the track, and the track has to clip its own
          segments to a rounded-input pill — two things one element can't do, so the
          clipping box is inset inside a wrapper the dot is free to overflow. */}
      <div className="relative h-2.5" aria-hidden="true">
        <div className="absolute inset-0 overflow-hidden rounded-full" style={{ background: track }}>
          {optimal && optimalWidth > 0 && (
            // A DEEPENING OF THE SAME GREEN, not a second texture. The optimal
            // range is a narrowing of in-range and this is what a narrowing
            // looks like: one region, shaded a rung further in where the
            // narrower band sits.
            //
            // OPAQUE, and the SAME token the trend chart draws it with. It was
            // `hueTint.green.edge` at 24% here and a different green at 9% on
            // the chart — two alphas of two colours for one idea, which is how
            // the two instruments ended up disagreeing about what "optimal"
            // looks like.
            <div
              className="absolute inset-y-0"
              style={{ left: `${optimalLeft}%`, width: `${optimalWidth}%`, backgroundColor: OPTIMAL_FILL }}
            />
          )}
          {optimalEdges.map((left, i) => (
            <div
              key={`optimal-edge-${i}`}
              className="absolute inset-y-0 w-px"
              style={{ left: `${left}%`, backgroundColor: chartTokens.referenceEdge, opacity: chartTokens.referenceEdgeOpacity }}
            />
          ))}
          {/* The two boundaries the whole bar turns on, marked. Without these
              the only thing saying where the reference range ends is the colour
              change, which is exactly what must never be true here. */}
          {[bandLeft, bandRight].map((left, i) => (
            <div
              key={i}
              className="absolute inset-y-0 w-px"
              // NOT `bg-espresso`. The track is made of the band fills, which are
              // light in BOTH themes since the plot went light — and `espresso`
              // resolves to a near-white cream in dark, which on a pale green
              // segment is a tick nobody can see. Same static ink the chart's
              // own boundary hairline takes.
              style={{ left: `${left}%`, backgroundColor: chartTokens.referenceEdge, opacity: 0.75 }}
            />
          ))}
        </div>
        {/* The result itself. NOT in its own state's colour: the mark sits on a
            track made of that colour, so a green dot on the green segment and a
            pale gold one on the gold segment were marks drawn in the shade they
            were standing on. It is the rangemark token, whose job is POSITION.
            ONE COLOUR IN BOTH THEMES since the track went light in both —
            espresso, 4.02–6.05:1 on the five fills the bar paints, inside a ring
            of the plot's own tone. Status is still carried four times over by the
            segment it lands on, the chevron, the word and the card's wash. */}
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-rangemark-ring bg-rangemark shadow motion-safe:transition-[left] motion-safe:duration-500 motion-safe:ease-out"
          style={{ left: `${displayLeft}%` }}
        />
      </div>
      <ScaleAxis scale={scale} />
    </div>
  );
}

/**
 * WHAT IS SAID WHEN NOTHING CAN BE DRAWN.
 *
 * One sentence naming the reason, then whatever figures actually exist. The
 * figures are conditional because the reasons are: a result with no numeric
 * value has no value to print, and a result with no reference range has no
 * range to print — and this block used to print both unconditionally under a
 * sentence about being far outside the range, which produced "Result null,
 * reference range 0–0" on exactly the results least able to afford it.
 */
function UnavailableBar({
  reason,
  value,
  low,
  high,
  unit,
  label,
}: {
  reason: RangeBarUndrawable;
  value: number | null | undefined;
  low: number | null | undefined;
  high: number | null | undefined;
  unit: string | null;
  label: string;
}) {
  const hasValue = isNumber(value);
  const hasRange = isNumber(low) && isNumber(high);
  return (
    <p className="text-xs leading-relaxed text-espresso/85" role="img" aria-label={label}>
      {RANGE_BAR_UNAVAILABLE[reason].long}
      {hasValue && (
        <>
          {' '}
          Result{' '}
          <span className="numeric">
            {value}
            {unit ? ` ${unit}` : ''}
          </span>
          .
        </>
      )}
      {hasRange && (
        <>
          {' '}
          Reference range <span className="numeric">{formatReferenceRange(low, high, unit)}</span>.
        </>
      )}
    </p>
  );
}

function isNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * The one accessible sentence both bars use, and it survives every shape the
 * wire can produce — a missing value and a missing range are stated rather than
 * interpolated, because `Result null, reference range NaN–NaN` is what an
 * unguarded template literal reads out.
 */
function accessibleLabel(
  value: number | null | undefined,
  low: number | null | undefined,
  high: number | null | undefined,
  status: MarkerStatusInput,
): string {
  const result = isNumber(value) ? `Result ${value}` : 'Result not available';
  const range = isNumber(low) && isNumber(high) ? `reference range ${formatReferenceRange(low, high)}` : 'no reference range';
  return `${result}, ${range}, status: ${statusLabel(status)}`;
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
 * WHERE THEY COLLIDE, THE ONE THAT SURVIVES IS THE ONE THAT IS STILL TRUE OF
 * THE END. Two labels in the same place is unreadable, so one has to go, and
 * which one is not a matter of taste:
 *
 *  · IDENTICAL TEXT — drop the scale end. This is the common case rather than
 *    an edge one: a marker whose range starts at zero on a scale that also
 *    starts at zero has two labels reading "0" in the same place, so dropping
 *    one loses nothing at all. The bound label IS the end.
 *  · DIFFERENT TEXT — drop the BOUND'S NUMBER and keep its tick. A reference
 *    range of 1–1,000,000 draws a scale from 0, which puts the bound "1" at
 *    0.00005% of the bar: dropping the end would leave "1" sitting at the far
 *    left of a bar that starts at 0, which is the original bug in miniature —
 *    a reference bound standing in for a scale end. The end has to be printed,
 *    because "the printed ends are the scale" is the whole contract; the bound
 *    keeps its tick, and every surface that draws this bar prints the reference
 *    range in words beside it.
 */
function ScaleAxis({ scale }: { scale: Extract<Scale, { outOfScale: false }> }) {
  /**
   * How close two labels may be, as a percentage of the bar, before they are
   * treated as one. Roughly four mono digits at the narrowest place this bar is
   * used (a ~200px card column); wider than that and the allowance is generous,
   * which is the harmless direction.
   */
  const COLLIDE = 14;
  const bounds = [
    { at: clampPct(scale.pct(scale.low)), text: formatReferenceBound(scale.low) },
    { at: clampPct(scale.pct(scale.high)), text: formatReferenceBound(scale.high) },
  ];
  // The ends come off the scale itself rather than being formatted here, so
  // there is no second derivation to disagree with the geometry.
  const ends = [
    { at: 0, text: scale.minLabel },
    { at: 100, text: scale.maxLabel },
  ];
  const collides = (a: { at: number }, b: { at: number }) => Math.abs(a.at - b.at) < COLLIDE;

  const shownEnds = ends.filter((end) => !bounds.some((b) => collides(b, end) && b.text === end.text));
  const numberedBounds = bounds.map((b) => ({
    ...b,
    numbered: !ends.some((end) => collides(b, end) && b.text !== end.text),
  }));

  return (
    <div className="relative mt-1.5 h-8 text-xs" aria-hidden="true">
      {shownEnds.map((end) => (
        <span
          key={`end-${end.at}`}
          className="numeric absolute top-[9px] whitespace-nowrap text-espresso/80"
          style={{ left: `${end.at}%`, transform: anchorAt(end.at) }}
        >
          {end.text}
        </span>
      ))}
      {numberedBounds.map((b, i) => (
        <span
          // Indexed, not keyed by text: two bounds can print the same string
          // (1 and 1.0001 both read "1" at the precision a bound is read at),
          // and two children under one key is a rendering fault rather than a
          // duplicate label.
          key={`bound-${i}`}
          className="absolute top-0 flex flex-col items-center whitespace-nowrap"
          style={{ left: `${b.at}%`, transform: anchorAt(b.at) }}
        >
          {/* The tick. Three pixels of hairline joining the number to the
              boundary it names, so it is attached to a mark on the track rather
              than merely level with one. */}
          <span className="h-[5px] w-px bg-espresso/60" />
          {b.numbered && <span className="numeric mt-[3px] text-espresso">{b.text}</span>}
        </span>
      ))}
    </div>
  );
}

const clampPct = (v: number) => Math.min(100, Math.max(0, v));

/**
 * WHERE A LABEL IS ANCHORED, AND WHY THE THRESHOLDS ARE WIDE.
 *
 * A centred label at 3% of a 200px bar starts 10px to the LEFT of the bar — the
 * same overflow the mark had, in the axis. The two ends were already special-
 * cased at 0.5%/99.5%, which only covers a label sitting exactly ON an end.
 *
 * 8% either side. At 200px that is 16px of run-up, comfortably more than half
 * of the widest label the ladder produces, and the cost is that a label near an
 * end is aligned to its tick rather than centred under it — which is what the
 * two scale ends already do and reads as deliberate. The TICK still marks the
 * exact position; only the number beside it shifts.
 */
const anchorAt = (at: number) => (at <= 8 ? 'translateX(0)' : at >= 92 ? 'translateX(-100%)' : 'translateX(-50%)');

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
 * ONE DIFFERENCE FROM THE FULL BAR, and it is size: the result is a POINTER
 * above the track rather than a dot on it, so it is still findable where it
 * sits on a segment of its own colour.
 *
 * IT CARRIES THE SAME GRADIENT NOW (Aug 2026), and the objection that kept it
 * flat has gone with the thing it was an objection to. That objection was
 * right: at 8px tall and a third of a card wide, a ramp running the WHOLE
 * width of a segment is a smear with no locatable boundary in it. The ramp
 * lives at the boundary now — one blend about 26px wide on a 15rem bar, with
 * the reference bound at its midpoint and its own hairline through the middle
 * of it — so what used to be a smear is the one part of the bar a reader is
 * looking for. Flat regions either side, exactly as on the chart.
 *
 * ── AND IT PRINTS ITS OWN ENDS, WHICH IS WHAT IT WAS MISSING ───────────────
 *
 * It used to print no figures at all, on the reasoning that the card already
 * says the reference range in words underneath and repeating it here would be
 * the same fact twice in a space with none to spare. That reasoning was about
 * the wrong two numbers. The bar is NOT drawn on the reference range — it is
 * drawn on `rangeBarScale`'s wider scale, and the card's own "Lab reference
 * range 3.8–5.8" two lines below was the only pair of numbers anywhere near
 * it. So a value of 3.4 against 3.8–5.8 drew its mark correctly, at 23% of a
 * scale running 2 to 8, under a card that appeared to say the bar ran from 3.8
 * to 5.8 — the mark then reads as a value INSIDE the range, which is the exact
 * failure the full bar was rebuilt to stop making. A bar with no axis does not
 * read as a bar with no axis. It reads as a bar whose axis is whatever figures
 * are nearest.
 *
 * So the two ends are printed, muted and small, and the reference bounds keep
 * their ticks on the track — which is where the card's written range attaches
 * itself. Four labels will not fit at 15rem, so the bounds are marked here and
 * named below, and nothing on the card is now the ends of a bar it is not.
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
  const label = accessibleLabel(value, low, high, status);

  // Said rather than drawn — the same rule as the full bar, and the same four
  // reasons. The value, the range and the status are all directly below this on
  // the card, so one short line is enough to explain the absence.
  if (scale.outOfScale) {
    return (
      <p className="text-xs leading-snug text-espresso/85" role="img" aria-label={label}>
        {RANGE_BAR_UNAVAILABLE[scale.undrawable].short}
      </p>
    );
  }

  const { pct, low: lowN, high: highN, value: valueN } = scale;
  const clamp = clampPct;
  const bandLeft = clamp(pct(lowN));
  const bandRight = clamp(pct(highN));
  // Not clamped, for the same reason as the full bar: the scale contains it.
  const pointLeft = pct(valueN);

  const track = trackGradient(scale, lowN, highN, severityThreshold);

  return (
    // Same reserved gutter as the full bar, at this mark's own half-width: the
    // pointer is a 12px triangle centred with `-translate-x-1/2`, so 6px of it
    // is drawn outside the track at either end. See the note on the full bar.
    <div className="w-full px-[6px]" role="img" aria-label={label}>
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
      <div className="relative h-2 overflow-hidden rounded-full" aria-hidden="true" style={{ background: track }}>
        {/* The two reference bounds, marked. Without these the only thing
            saying where the range ends is the colour change, which is exactly
            what must never be true here — at this size most of all. */}
        {[bandLeft, bandRight].map((left, i) => (
          <div
            key={i}
            className="absolute inset-y-0 w-px"
            // Static ink, not `espresso` — see the full bar's ticks above.
            style={{ left: `${left}%`, backgroundColor: chartTokens.referenceEdge, opacity: 0.75 }}
          />
        ))}
      </div>
      {/* THE ENDS OF THE SCALE THAT WAS ACTUALLY DRAWN. Two figures, one line,
          muted — enough to say what the track spans and not enough to compete
          with the value below it. Taken straight off the scale, so they cannot
          describe a different one. */}
      <div className="mt-1 flex items-baseline justify-between text-xs text-espresso/80" aria-hidden="true">
        <span className="numeric">{scale.minLabel}</span>
        <span className="numeric">{scale.maxLabel}</span>
      </div>
    </div>
  );
}

/**
 * THE WHOLE TRACK, AS ONE CSS GRADIENT — the bar's half of the language the
 * trend chart's bands speak.
 *
 * Five flat regions with a blend centred on each of the four boundaries between
 * them, from the one derivation both instruments share (`bandRampStops`).
 *
 * AND IT IS THE SAME FIVE COLOURS THE CHART DRAWS NOW (Aug 2026). This used to
 * ask `bandRampStops` for the `track` role while the chart asked for `plot`,
 * because a chart band was composited at an alpha and a bar segment was
 * painted — so a marker card showed a green bar directly under a chart drawn in
 * a different green, at a different weight, with no ladder on the bar at all
 * (the old track colours ran 2.05, 1.86, 1.68, 2.01, 2.65 off the card: gold
 * FAINTER than in-range). Bands are opaque everywhere, there is one palette,
 * and the ladder — in range lightest, significantly out strongest — is on the
 * bar for the first time.
 *
 * Three things follow from building the track as one gradient, and each of them
 * was a bug the per-segment version could have:
 *
 *  · THE BOUNDARY IS AT THE MIDDLE OF ITS BLEND, so the hairline that marks it
 *    runs through the middle of the colour change rather than along the edge of
 *    one — and a result sitting exactly on the limit is drawn half in each.
 *  · IT IS ONE ELEMENT, so two neighbouring regions cannot disagree by a
 *    rounding at the seam and leave a hairline of card showing through.
 *  · THE TRANSITION IS A SHARE OF THE SCALE, not of the reference range, so it
 *    is the same width on a bar drawn for a 3.9–5.1 range as on one drawn for
 *    30–400.
 *
 * Stops are placed by VALUE and converted through the scale's own `pct`, so the
 * colour at a point on the bar and the figure printed under that point cannot
 * describe two different scales. Clamped to the bar at both ends: the two outer
 * bands are open-ended, and CSS holds the first and last stop's colour out to
 * the edges, which is exactly the flat red that is wanted there.
 */
function trackGradient(
  scale: Extract<Scale, { outOfScale: false }>,
  low: number,
  high: number,
  severityThreshold: number | null | undefined,
): string {
  const threshold = severityThresholdFor(low, high, severityThreshold);
  const halfWidth = ((scale.max - scale.min) * TRANSITION_SHARE) / 2;
  const all = statusBands(low, high, severityThreshold).flatMap((band) =>
    bandRampStops(band.status, { low, high, threshold, halfWidth }),
  );

  /**
   * ONLY THE NEAREST STOP OUTSIDE THE BAR SURVIVES ON EACH SIDE.
   *
   * The two outer bands run off to infinity, so several of their stops land
   * past the ends of the scale and clamp to 0% or 100% — and where two clamp to
   * the same place, the one that paints the end is whichever the list happened
   * to leave last. Keeping the nearest gives the colour that is actually true
   * at that end, and CSS then holds it out to the edge, which is the flat red
   * that is wanted there. The same rule the trend chart applies to a band rect
   * it has had to clamp, and for the same reason.
   */
  const inside = all.filter((s) => s.value >= scale.min && s.value <= scale.max);
  const below = all.filter((s) => s.value < scale.min).pop();
  const above = all.find((s) => s.value > scale.max);
  const kept = [...(below ? [below] : []), ...inside, ...(above ? [above] : [])];

  const stops: { at: number; colour: string }[] = [];
  for (const stop of kept) {
    const at = clampPct(scale.pct(stop.value));
    // Two adjacent bands name the SAME stop at their shared boundary — that is
    // what makes the fill continuous — so the second copy is dropped rather
    // than emitted as a zero-length step.
    const previous = stops[stops.length - 1];
    if (previous && previous.colour === stop.colour && Math.abs(previous.at - at) < 1e-6) continue;
    stops.push({ at, colour: stop.colour });
  }
  return `linear-gradient(to right, ${stops.map((s) => `${s.colour} ${s.at.toFixed(3)}%`).join(', ')})`;
}
