import { useEffect, useState, type ReactNode } from 'react';
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

/**
 * =============================================================================
 *  WHERE A RESULT SITS, DRAWN AS AN ARC (Aug 2026)
 * =============================================================================
 *
 * This replaces the horizontal range bar on the marker detail page, on a result
 * card, on the Overview's attention list and in the first-sign-in walkthrough.
 * It is the same instrument bent round: the same scale (`lib/rangeScale.ts`),
 * the same five states, the same `bandRampStops` derivation, the same boundary
 * treatment, the same never-clamped mark, the same refusals in words. What
 * changed is the shape it is drawn in and where the number goes.
 *
 * ── AN ARC, NOT A RING, AND THAT IS THE WHOLE FIRST DECISION ────────────────
 *
 * A full circle says the scale WRAPS — that the top of the range meets the
 * bottom of it and a value can go round again. A blood result between two
 * bounds does no such thing. An arc has an unambiguous start and an
 * unambiguous end, and the gap between them is where the two ends of the scale
 * are printed, which is exactly where a reader looks for them.
 *
 * It sweeps CLOCKWISE FROM THE LOWER LEFT TO THE LOWER RIGHT, 270° with a 90°
 * gap at the bottom: low at the start, high at the end, the same left-to-right
 * reading order the bar had, carried round the top.
 *
 * ── THE RAMP IS ONE CONIC GRADIENT, WHICH IS THE ARC'S OWN LINEAR ──────────
 *
 * The bar drew its five regions as a single `linear-gradient` and the note on
 * it is worth repeating because the reason survives the change of shape: one
 * gradient means two neighbouring regions CANNOT disagree by a rounding at the
 * seam and leave a hairline of card showing through, and it means a boundary
 * genuinely sits at the MIDDLE of its own blend rather than at the edge of one.
 *
 * A `conic-gradient` is the same statement in polar coordinates — it
 * interpolates around an angle exactly as a linear one interpolates along an
 * axis — so `bandRampStops` maps onto it directly: a stop at `pct` along the
 * scale is a stop at `pct × 0.75` of the circle, because the arc is three
 * quarters of one. Nothing is resampled, nothing is approximated into segments,
 * and the bar and the gauge are provably the same colours at the same places.
 *
 * The ring is then cut out of that gradient with a radial MASK rather than
 * drawn as a stroked shape, which is what lets the whole thing be one element
 * with one paint. The 90° gap is part of the gradient rather than part of the
 * mask (a hard stop at 75%, no interpolation across it), so no mask compositing
 * is needed and the component works wherever `mask-image` does.
 *
 * ── IT IS FLUID, AND EVERY NUMBER IN HERE IS A SHARE OF THE BOX ────────────
 *
 * Geometry in pixels would need a size prop at every call site and would clip
 * the moment a card got narrower than the number somebody typed. The box is
 * `width: 100%` with `aspect-ratio: 1` under a `max-width`, and every radius,
 * inset and label position below is a fraction of it — so the same component is
 * a 240px instrument on a marker page and a 128px one on a card without a
 * second set of measurements to keep in step.
 */

/** Where the arc starts, in screen degrees (clockwise from +x, y down). Lower left. */
const ARC_START_DEG = 135;
/** How far it sweeps. 270° leaves a 90° gap at the bottom. */
const ARC_SWEEP_DEG = 270;
/** The share of a full turn the arc occupies — what maps a scale percentage onto a conic stop. */
const ARC_SHARE = ARC_SWEEP_DEG / 360;
/**
 * CSS `conic-gradient(from …)` measures from 12 o'clock; screen degrees here are
 * measured from 3 o'clock. Ninety degrees is the whole of the difference and it
 * is written down once rather than folded into a literal nobody can check.
 */
const CONIC_FROM_DEG = ARC_START_DEG + 90;

/**
 * THE GEOMETRY, AS FRACTIONS OF THE BOX. One SVG user-space unit is one percent
 * of the box, so these are also the numbers the overlay is drawn in.
 */
const GEO = {
  /** Centre. */
  c: 50,
  /** The ring's outer radius. The remaining 11% is the gutter the labels live in. */
  outer: 39,
  /** How thick the ring is. */
  stroke: 5.5,
  /** How far outside the ring a label's centre sits. */
  labelGap: 3.5,
} as const;
const RING_INNER = GEO.outer - GEO.stroke;
/** The centreline of the ring — where the mark rides and where the optimal arc is stroked. */
const RING_MID = GEO.outer - GEO.stroke / 2;

/** A scale percentage (0–100) as a screen angle in degrees. */
function arcAngle(pct: number): number {
  return ARC_START_DEG + (pct / 100) * ARC_SWEEP_DEG;
}

/** A point at `deg` and `radius`, in the SVG's 0–100 user space. */
function polar(deg: number, radius: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  return { x: GEO.c + radius * Math.cos(rad), y: GEO.c + radius * Math.sin(rad) };
}

const clampPct = (v: number) => Math.min(100, Math.max(0, v));

interface ArcGaugeProps {
  /**
   * All three are nullable because the wire is: a qualitative result carries no
   * numeric value, and a marker can reach a screen with one or both reference
   * bounds missing. `rangeBarScale` refuses each case by name and the gauge says
   * which in words — typing these as plain numbers never stopped a null
   * arriving, it only stopped the component being written to survive one.
   */
  value: number | null | undefined;
  low: number | null | undefined;
  high: number | null | undefined;
  status: MarkerStatusInput;
  /** Where significantly-out begins, in the result's own units. See severityThresholdFor. */
  severityThreshold?: number | null;
  /** The advisory optimal band. Omitted, and nothing drawn, when the marker has no established one. */
  optimal?: OptimalRangeDTO | null;
  /** Used in the centre, and in the sentence that stands in for a gauge that cannot be drawn. */
  unit?: string | null;
  /**
   * What goes in the middle. The gauge does not compose this itself because the
   * two call sites disagree about what the headline is: on a marker page it is
   * the hero value with its unit and the status word under it, and on a card the
   * value is set at the card's own size. What the gauge guarantees is that
   * whatever is passed is centred inside the inner circle and never overflows
   * the ring — see the padding on the centre well below.
   */
  children?: ReactNode;
  /** How wide the gauge may grow. It is fluid below this and square at every width. */
  maxWidth?: number;
  /**
   * Whether the two reference bounds print their VALUES beside their ticks.
   *
   * Off on a result card, and that is a deliberate drop rather than an
   * oversight: at ~150px a marker card has room for the two SCALE ENDS or the
   * two BOUNDS and not both, and the ends are the ones that cannot be inferred
   * from anything else on the card. The bounds keep their ticks — so the
   * boundary is still marked and still locatable in greyscale — and the card
   * states the reference range in words below. The full gauge prints all four.
   */
  boundLabels?: boolean;
  /** Diameter of the result mark, in px. Fixed rather than fluid: it is the thing being read. */
  markPx?: number;
  /**
   * Whether the mark sweeps round the arc to its position on mount.
   *
   * OFF ON A CARD, and that is inherited from the bar rather than new: a marker
   * list draws up to 165 of these at once, and 165 marks all sweeping on mount
   * is not restraint, it is a page that appears to be loading. One instrument on
   * a page about one result can afford the movement; a grid cannot.
   */
  sweepOnMount?: boolean;
  className?: string;
}

/**
 * ── WHAT THE ARC INHERITS FROM THE BAR, UNCHANGED ──────────────────────────
 *
 * THE SCALE IS NOT THE REFERENCE RANGE. `rangeBarScale` builds a scale that
 * always contains the value with headroom and always contains the reference
 * range, rounds its ends outward to a ladder somebody would have chosen, and
 * hands back the labels for those ends so nothing here can print a number
 * describing a different scale. A result three times its upper limit is drawn
 * three times out, at its true position on a longer scale, and the two figures
 * in the gap say so. That rule was hard won — see the three live failures
 * recorded at the top of lib/rangeScale.ts — and bending it round a circle
 * changes nothing about it.
 *
 * THE MARK IS NEVER CLAMPED. There is no end to pin it to: the scale is built to
 * contain it.
 *
 * THE MARK IS NOT A STATUS COLOUR. It is `rangemark` — its job is POSITION, and
 * it rides on a ring made of the status colours, so a mark drawn in its own
 * state's colour is a mark drawn in the shade it is standing on. Status is
 * carried four times over by the segment it lands on, the chevron, the word and
 * the card's own wash.
 *
 * FIVE REASONS NOT TO DRAW, ONE SENTENCE EACH. See RANGE_BAR_UNAVAILABLE.
 */
export function ArcGauge({
  value,
  low,
  high,
  status,
  severityThreshold = null,
  optimal = null,
  unit = null,
  children,
  maxWidth = 240,
  boundLabels = true,
  markPx = 14,
  sweepOnMount = true,
  className = '',
}: ArcGaugeProps) {
  const scale = rangeBarScale({ low, high, value, severityThreshold });

  /**
   * The mark sweeps ALONG THE ARC to its true position once, on mount — a
   * two-step render so the browser has something to transition between.
   *
   * It is a rotation rather than a pair of coordinates, which is the one place
   * the arc is genuinely better than the bar rather than merely different: the
   * bar transitioned `left`, and transitioning `left` and `top` here would move
   * the mark across the CHORD between two points on the circle, cutting through
   * the middle of the gauge. Rotating a wrapper about the centre moves it round
   * the ring, which is the path it is actually describing.
   *
   * Before the refusal below, because a hook that runs on some renders and not
   * others is not a hook.
   */
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const optimalBand = optimal ? formatOptimalRange(optimal.low, optimal.high, optimal.unit) : null;
  const label =
    accessibleLabel(value, low, high, status) +
    (optimalBand ? `. Optimal range ${optimalBand}, ${optimal!.within ? 'within optimal' : 'outside optimal'}` : '');

  if (scale.outOfScale) {
    return (
      <UnavailableGauge reason={scale.undrawable} value={value} low={low} high={high} unit={unit} label={label}>
        {children}
      </UnavailableGauge>
    );
  }

  const { pct, low: lowN, high: highN, value: valueN } = scale;
  const boundPct = [clampPct(pct(lowN)), clampPct(pct(highN))];
  // NOT CLAMPED — see the note above.
  const markPct = pct(valueN);
  const restingPct = (boundPct[0] + boundPct[1]) / 2;
  const markDeg = arcAngle(!sweepOnMount || settled ? markPct : restingPct);

  const ring = ringGradient(scale, lowN, highN, severityThreshold);

  /**
   * The optimal region as the part of the reference range that is ALSO optimal —
   * a narrowing of in-range drawn as a deepening of the same green, never a
   * second texture. A one-sided band ("below 33") takes the reference bound as
   * its open end, which is what makes it a narrowing rather than a second
   * opinion. Same reasoning, same token and same intersection as the bar's.
   */
  const optimalFrom = optimal ? Math.max(lowN, optimal.low ?? lowN) : 0;
  const optimalTo = optimal ? Math.min(highN, optimal.high ?? highN) : 0;
  const optimalA = optimal ? clampPct(pct(optimalFrom)) : 0;
  const optimalB = optimal ? clampPct(pct(optimalTo)) : 0;
  const hasOptimal = Boolean(optimal) && optimalB > optimalA;
  // Only an edge that is not already a reference bound gets a hairline: the
  // bound has one of its own, and two rules on one pixel is a heavier line
  // rather than a second mark.
  const optimalEdges = optimal
    ? [...(optimalFrom > lowN ? [optimalA] : []), ...(optimalTo < highN ? [optimalB] : [])]
    : [];

  const axis = axisLabels(scale, boundLabels);

  return (
    <div
      className={`arc-gauge relative mx-auto w-full ${className}`}
      style={{ maxWidth, aspectRatio: '1 / 1' }}
      role="img"
      aria-label={label}
    >
      {/* THE RING. One conic gradient, cut to an annulus by a radial mask. The
          gap at the bottom is a hard stop inside the gradient rather than a
          second mask, so nothing here depends on `mask-composite`. */}
      <div
        className="arc-gauge__ring absolute"
        aria-hidden="true"
        style={{
          inset: `${GEO.c - GEO.outer}%`,
          background: ring,
          // Feathered by a hair at both edges — a hard stop in a mask is an
          // aliased circle, and this is a curve at every size.
          WebkitMaskImage: RING_MASK,
          maskImage: RING_MASK,
        }}
      />

      {/* Everything drawn ON the ring: the optimal narrowing, its edges, and
          the two reference-bound ticks. SVG rather than rotated divs because a
          radial hairline is a line between two points and nothing else, and
          `non-scaling-stroke` keeps it one device pixel at every gauge size. */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden="true">
        {hasOptimal && (
          <path
            d={arcPath(optimalA, optimalB, RING_MID)}
            fill="none"
            stroke={OPTIMAL_FILL}
            strokeWidth={GEO.stroke}
          />
        )}
        {optimalEdges.map((at, i) => (
          <line key={`optimal-edge-${i}`} {...radialLine(at)} stroke={chartTokens.referenceEdge} strokeOpacity={chartTokens.referenceEdgeOpacity} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {/* THE TWO BOUNDARIES THE WHOLE GAUGE TURNS ON, MARKED. Without these
            the only thing saying where the reference range ends is the colour
            change, which is exactly what must never be true here. Static ink
            and not `espresso`, which resolves to a near-white cream in dark and
            is invisible on a pale green segment. */}
        {boundPct.map((at, i) => (
          <line key={`bound-${i}`} {...radialLine(at)} stroke={chartTokens.referenceEdge} strokeOpacity={0.75} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>

      {/* THE RESULT. A wrapper spanning the ring, rotated about the centre, with
          the mark sitting at its twelve o'clock — so the transition is a sweep
          round the arc rather than a chord across it. */}
      <div
        className={`absolute ${
          sweepOnMount ? 'motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out' : ''
        }`}
        aria-hidden="true"
        style={{ inset: `${GEO.c - GEO.outer}%`, transform: `rotate(${markDeg + 90}deg)` }}
      >
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-full border-2 border-rangemark-ring bg-rangemark shadow"
          style={{
            // The ring's centreline, measured down from the top of this box:
            // the box is the ring's outer circle, so the centreline sits half a
            // stroke in.
            top: `calc(${(GEO.stroke / 2 / GEO.outer) * 50}% - ${markPx / 2}px)`,
            width: markPx,
            height: markPx,
          }}
        />
      </div>

      {/* THE CENTRE WELL. Padded to roughly the inner circle's inscribed square,
          so a long value wraps inside the ring instead of running under it. */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center" style={{ padding: '24%' }}>
        {children}
      </div>

      {/* THE FIGURES. The two SCALE ENDS sit at the arc's own feet, in the gap —
          which is the argument for the gap being at the bottom: the place the
          scale stops is the place its ends are printed. The two REFERENCE
          BOUNDS sit outside their own ticks. Told apart by tone and by the tick,
          never by a hue, the same rule the trend chart's axis follows. */}
      {axis.map((l) => (
        <span
          key={l.key}
          aria-hidden="true"
          className={`numeric absolute whitespace-nowrap text-xs leading-none ${
            l.kind === 'end' ? 'text-espresso/80' : 'text-espresso'
          }`}
          style={{
            left: `${polar(arcAngle(l.at), GEO.outer + GEO.labelGap).x}%`,
            top: `${polar(arcAngle(l.at), GEO.outer + GEO.labelGap).y}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {l.text}
        </span>
      ))}
    </div>
  );
}

/**
 * THE CARD-SIZED GAUGE, and deliberately the same instrument rather than a
 * second one.
 *
 * Three differences and no others: it is smaller, its mark is smaller with it,
 * and IT DOES NOT PRINT THE REFERENCE BOUNDS' VALUES. That last one is the only
 * judgement call in here and it is the same call the card bar made — at the
 * width a marker card gives it, four figures round an arc collide, and of the
 * two pairs the SCALE ENDS are the ones that cannot be recovered from anything
 * else on the card. The card prints its reference range in words two lines
 * below; nothing prints the scale but this.
 *
 * The bounds keep their TICKS, so the boundary is still marked, still at the
 * middle of its own blend, and still locatable with the colour taken away.
 */
export function MiniArcGauge({
  value,
  low,
  high,
  status,
  severityThreshold = null,
  children,
}: Omit<ArcGaugeProps, 'optimal' | 'unit' | 'maxWidth' | 'boundLabels' | 'markPx' | 'sweepOnMount' | 'className'>) {
  const scale = rangeBarScale({ low, high, value, severityThreshold });
  const label = accessibleLabel(value, low, high, status);

  // Said rather than drawn — the same rule as the full gauge, and the same five
  // reasons. The card's short sentence rather than the long one, and the value
  // still printed above it: a card that drops both the picture and the number
  // is a card with a hole in it.
  if (scale.outOfScale) {
    return (
      <div role="img" aria-label={label}>
        {children}
        <p className={`text-xs leading-snug text-espresso/85 ${children ? 'mt-2' : ''}`}>
          {RANGE_BAR_UNAVAILABLE[scale.undrawable].short}
        </p>
      </div>
    );
  }

  return (
    <ArcGauge
      value={value}
      low={low}
      high={high}
      status={status}
      severityThreshold={severityThreshold}
      maxWidth={148}
      boundLabels={false}
      markPx={10}
      sweepOnMount={false}
    >
      {children}
    </ArcGauge>
  );
}

/**
 * WHAT IS SAID WHEN NOTHING CAN BE DRAWN.
 *
 * One sentence naming the reason, then whatever figures actually exist. The
 * figures are conditional because the reasons are: a result with no numeric
 * value has no value to print, and a result with no reference range has no
 * range to print — this block used to print both unconditionally under a
 * sentence about being far outside the range, which produced "Result null,
 * reference range 0–0" on exactly the results least able to afford it.
 *
 * ⚠ IT RENDERS THE CENTRE CONTENT FIRST, and that is not decoration. Since the
 * value moved INTO the gauge (Aug 2026), a refusal that dropped its children
 * would drop the reader's own result off the card along with the picture of it —
 * a marker whose range is too narrow to draw would show a sentence explaining
 * the absence of a gauge and no number anywhere. The refusal is about the
 * SCALE; the value is not in question and is stated either way.
 */
function UnavailableGauge({
  reason,
  value,
  low,
  high,
  unit,
  label,
  children,
}: {
  reason: RangeBarUndrawable;
  value: number | null | undefined;
  low: number | null | undefined;
  high: number | null | undefined;
  unit: string | null;
  label: string;
  children?: ReactNode;
}) {
  const hasValue = isNumber(value);
  const hasRange = isNumber(low) && isNumber(high);
  return (
    <div role="img" aria-label={label}>
      {children}
      <p className={`text-xs leading-relaxed text-espresso/85 ${children ? 'mt-3' : ''}`}>
        {RANGE_BAR_UNAVAILABLE[reason].long}
        {/* Not repeated where the centre already carries it — the centre content
            IS the value on every surface that passes one. */}
        {hasValue && !children && (
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
    </div>
  );
}

function isNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * The one accessible sentence the gauge uses, and it survives every shape the
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
 * THE FOUR FIGURES, AND WHICH OF THEM SURVIVE A COLLISION.
 *
 * The ends say how far the arc reaches — the SCALE, which exists only because
 * the value needed room. The two inner ones are the reference bounds, which are
 * a clinical threshold and the reason anybody is looking.
 *
 * WHERE THEY COLLIDE, THE ONE THAT SURVIVES IS THE ONE STILL TRUE OF THE END —
 * the identical rule the bar's axis ran on, and it is not a matter of taste:
 *
 *  · IDENTICAL TEXT — drop the scale end. A marker whose range starts at zero
 *    on a scale that also starts at zero has two labels reading "0" in the same
 *    place, so dropping one loses nothing. The bound label IS the end.
 *  · DIFFERENT TEXT — drop the BOUND'S NUMBER and keep its tick. A reference
 *    range of 1–1,000,000 draws a scale from 0, which puts the bound "1" at
 *    0.00005% of the arc: dropping the end would leave "1" standing at the foot
 *    of an arc that starts at 0, which is the original bug in miniature. The end
 *    has to be printed, because "the printed ends are the scale" is the whole
 *    contract.
 */
function axisLabels(
  scale: Extract<Scale, { outOfScale: false }>,
  boundLabels: boolean,
): { key: string; at: number; text: string; kind: 'end' | 'bound' }[] {
  /**
   * How close two labels may be, as a percentage of the scale, before they are
   * treated as one. The bar used 14 against a ~200px track; an arc of the same
   * diameter has roughly π/2 times the run for the same percentage, so the same
   * figure is comfortably generous here — which is the harmless direction.
   */
  const COLLIDE = 14;
  const bounds = [
    { at: clampPct(scale.pct(scale.low)), text: formatReferenceBound(scale.low) },
    { at: clampPct(scale.pct(scale.high)), text: formatReferenceBound(scale.high) },
  ];
  const ends = [
    { at: 0, text: scale.minLabel },
    { at: 100, text: scale.maxLabel },
  ];
  const collides = (a: { at: number }, b: { at: number }) => Math.abs(a.at - b.at) < COLLIDE;

  const out: { key: string; at: number; text: string; kind: 'end' | 'bound' }[] = [];
  ends.forEach((end, i) => {
    // A bound that is not being printed cannot stand in for an end, so the
    // suppression only applies when the bound labels are actually drawn.
    if (boundLabels && bounds.some((b) => collides(b, end) && b.text === end.text)) return;
    out.push({ key: `end-${i}`, at: end.at, text: end.text, kind: 'end' });
  });
  if (boundLabels) {
    bounds.forEach((b, i) => {
      if (ends.some((end) => collides(b, end) && b.text !== end.text)) return;
      // Indexed, not keyed by text: two bounds can print the same string, and
      // two children under one key is a rendering fault rather than a duplicate.
      out.push({ key: `bound-${i}`, at: b.at, text: b.text, kind: 'bound' });
    });
  }
  return out;
}

/**
 * The annulus, as a mask. Percentages in a radial gradient are shares of the
 * gradient's own radius, and `closest-side` on a square element makes that
 * radius exactly half the box — so this is resolution-independent and needs no
 * size prop. Feathered by a percent at both edges because a hard stop in a mask
 * is an aliased circle.
 */
const RING_MASK = [
  'radial-gradient(closest-side circle at 50% 50%,',
  `transparent ${(((RING_INNER - 0.4) / GEO.outer) * 100).toFixed(2)}%,`,
  `#000 ${(((RING_INNER + 0.4) / GEO.outer) * 100).toFixed(2)}%,`,
  '#000 99%,',
  'transparent 100%)',
].join(' ');

/** A hairline crossing the ring at `at` percent of the scale. */
function radialLine(at: number): { x1: number; y1: number; x2: number; y2: number } {
  const deg = arcAngle(at);
  const a = polar(deg, RING_INNER);
  const b = polar(deg, GEO.outer);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

/** An arc of the ring's centreline, from `fromPct` to `toPct`, drawn clockwise. */
function arcPath(fromPct: number, toPct: number, radius: number): string {
  const a = polar(arcAngle(fromPct), radius);
  const b = polar(arcAngle(toPct), radius);
  const largeArc = ((toPct - fromPct) / 100) * ARC_SWEEP_DEG > 180 ? 1 : 0;
  return `M ${a.x.toFixed(3)} ${a.y.toFixed(3)} A ${radius} ${radius} 0 ${largeArc} 1 ${b.x.toFixed(3)} ${b.y.toFixed(3)}`;
}

/**
 * THE WHOLE RING, AS ONE CONIC GRADIENT — the arc's half of the language the
 * bar spoke in a straight line.
 *
 * Five flat regions with a blend centred on each of the four boundaries between
 * them, from the one derivation the range bar and the trend chart's own history
 * share (`bandRampStops`). Stops are placed by VALUE and converted through the
 * scale's own `pct`, so the colour at a point on the arc and the figure printed
 * at that point cannot describe two different scales.
 *
 * A scale percentage becomes a share of the CIRCLE by multiplying by
 * `ARC_SHARE`, and the 90° gap is the remainder, written as a HARD STOP: two
 * stops at the same position do not interpolate, so the arc ends at its own
 * colour and the gap is empty rather than fading through a grey shoulder.
 *
 * Clamped to the arc at both ends: the two outer bands are open-ended, and CSS
 * holds the first and last stop's colour out to the edges, which is exactly the
 * flat red that is wanted there.
 */
function ringGradient(
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
   * ONLY THE NEAREST STOP OUTSIDE THE ARC SURVIVES ON EACH SIDE.
   *
   * The two outer bands run off to infinity, so several of their stops land past
   * the ends of the scale and clamp to 0% or 100% — and where two clamp to the
   * same place, the one that paints the end is whichever the list happened to
   * leave last. Keeping the nearest gives the colour that is actually true at
   * that end, and CSS then holds it out to the edge.
   */
  const inside = all.filter((s) => s.value >= scale.min && s.value <= scale.max);
  const below = all.filter((s) => s.value < scale.min).pop();
  const above = all.find((s) => s.value > scale.max);
  const kept = [...(below ? [below] : []), ...inside, ...(above ? [above] : [])];

  const stops: { at: number; colour: string }[] = [];
  for (const stop of kept) {
    const at = clampPct(scale.pct(stop.value));
    // Two adjacent bands name the SAME stop at their shared boundary — that is
    // what makes the fill continuous — so the second copy is dropped rather than
    // emitted as a zero-length step.
    const previous = stops[stops.length - 1];
    if (previous && previous.colour === stop.colour && Math.abs(previous.at - at) < 1e-6) continue;
    stops.push({ at, colour: stop.colour });
  }

  const end = (ARC_SHARE * 100).toFixed(3);
  const last = stops[stops.length - 1]?.colour ?? 'transparent';
  const body = stops.map((s) => `${s.colour} ${(s.at * ARC_SHARE).toFixed(3)}%`).join(', ');
  return `conic-gradient(from ${CONIC_FROM_DEG}deg, ${body}, ${last} ${end}%, transparent ${end}%, transparent 100%)`;
}
