import { useEffect, useState, type ReactNode } from 'react';
import {
  formatOptimalRange,
  formatReferenceBound,
  formatReferenceRange,
  chart as chartTokens,
  hueTint,
  OPTIMAL_FILL,
  type MarkerStatusInput,
  type OptimalRangeDTO,
} from '@aspire-bloods/shared';
import { statusLabel } from '../../lib/markerCopy';
import {
  GAUGE_BOUNDARIES,
  GAUGE_SLICES,
  gaugePlacement,
  RANGE_BAR_UNAVAILABLE,
  type GaugePlacement,
  type RangeBarUndrawable,
} from '../../lib/rangeScale';

/**
 * =============================================================================
 *  WHERE A RESULT SITS, DRAWN AS AN ARC (Aug 2026)
 * =============================================================================
 *
 * This replaces the horizontal range bar on the marker detail page, on a result
 * card, on the Overview's attention list and in the first-sign-in walkthrough:
 * the same five states, the same five fills, the same two hinge colours, the
 * same boundary-centred blends, the same never-clamped mark, the same refusals
 * in words.
 *
 * ── AND THE RING IS FIXED, NOT MAPPED TO THE VALUE (Aug 2026) ──────────────
 *
 * Green always occupies the central slice, gold always flanks it, red always
 * sits at both ends, and none of that moves with the result. `lib/rangeScale.ts`
 * holds the geometry and the reasoning; the short version is that a ring is read
 * as a SHAPE rather than as an axis, so a green that slid toward the start of
 * the arc for one card and toward the end for the next made the one thing a
 * reader takes in without reading any numbers mean something different on every
 * card in the grid.
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
 * ── THE RAMP IS ONE CONIC GRADIENT, AND IT IS A CONSTANT ──────────────────
 *
 * The bar drew its five regions as a single `linear-gradient` and the reason
 * survives the change of shape: one gradient means two neighbouring regions
 * CANNOT disagree by a rounding at the seam and leave a hairline of card showing
 * through, and a boundary genuinely sits at the MIDDLE of its own blend rather
 * than at the edge of one. A `conic-gradient` is the same statement in polar
 * coordinates.
 *
 * Since the geometry stopped depending on the value, the gradient stopped
 * depending on it too — `RING_GRADIENT` is computed once at module scope. That
 * is not a performance note. It is the change itself, stated as code: a gradient
 * that cannot take an argument cannot vary between two cards on one grid.
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
 * a 300px instrument on a marker page and a 176px one on a card without a
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
  /**
   * How far the plot-surface well stands proud of the ring, on each side. Wide
   * enough that the ground round the colour is unambiguously the ground the
   * colour was solved on, narrow enough that the instrument is still a ring
   * rather than a disc: 1.2 of the box's 100 units, against a 5.5 stroke.
   */
  well: 1.2,
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
  /**
   * How wide the gauge may grow. It is fluid below this and square at every
   * width, so this is a ceiling rather than a size.
   *
   * ── IT WENT UP, AND THE TEXT DID NOT COME DOWN (Aug 2026) ────────────────
   * The value was overflowing its own ring — "24.6 mIU/L" at the card size was
   * wrapping its unit onto a second line inside a 148px circle, and the marker
   * page's 52px hero was filling the interior corner to corner. The instrument
   * grew round the number rather than the number shrinking to fit it: 240 → 300
   * on a marker page, 148 → 176 on a card. The value is the thing being read
   * and the ring is the thing describing it, so when the two disagree about
   * space it is the ring that gives.
   */
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
 * ── WHAT SURVIVES, AND WHAT IT COST ────────────────────────────────────────
 *
 * THE MARK IS STILL NEVER CLAMPED, and on a fixed ring that takes work rather
 * than falling out of the geometry: the two outer bands are unbounded in value
 * and finite in angle, so the placement saturates toward the end of the arc and
 * never arrives. A mark pinned to the end of an instrument has stopped carrying
 * information and is indistinguishable from one that legitimately sits there.
 *
 * WHAT IT COST is that distance inside those two outer bands is no longer to
 * scale — ORDER is preserved, magnitude is compressed. "How far out am I" is
 * answered by the figure in the middle of the gauge and by the status word
 * rather than by the geometry. The trade is argued at the top of
 * lib/rangeScale.ts and pinned by its property test.
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
  maxWidth = 300,
  boundLabels = true,
  markPx = 14,
  sweepOnMount = true,
  className = '',
}: ArcGaugeProps) {
  const placement = gaugePlacement({ low, high, value, severityThreshold });

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

  if (!placement.drawable) {
    return (
      <UnavailableGauge reason={placement.undrawable} value={value} low={low} high={high} unit={unit} label={label}>
        {children}
      </UnavailableGauge>
    );
  }

  const { low: lowN, high: highN } = placement;
  const markPct = placement.at * 100;
  /**
   * WHERE THE SWEEP STARTS: the middle of the green, which is the middle of the
   * ring. It used to be the midpoint of the two reference bounds, which on a
   * value-mapped ring was a different place on every card; on a fixed ring it is
   * the same place on every card, which is what makes a grid of them settle
   * together rather than each from its own starting point.
   */
  const markDeg = arcAngle(!sweepOnMount || settled ? markPct : 50);

  /**
   * The optimal region as the part of the reference range that is ALSO optimal —
   * a narrowing of in-range drawn as a deepening of the same green, never a
   * second texture. A one-sided band ("below 33") takes the reference bound as
   * its open end, which is what makes it a narrowing rather than a second
   * opinion.
   *
   * It maps through the IN_RANGE slice rather than through a numeric axis, which
   * is the same change the mark made: optimal is a narrowing of in-range by
   * definition, so it belongs inside the green and now cannot be drawn anywhere
   * else however the value moves.
   */
  const inRange = GAUGE_SLICES.IN_RANGE;
  const intoGreen = (v: number) => (inRange[0] + ((v - lowN) / (highN - lowN)) * (inRange[1] - inRange[0])) * 100;
  const optimalFrom = optimal ? Math.max(lowN, optimal.low ?? lowN) : 0;
  const optimalTo = optimal ? Math.min(highN, optimal.high ?? highN) : 0;
  const optimalA = optimal ? intoGreen(optimalFrom) : 0;
  const optimalB = optimal ? intoGreen(optimalTo) : 0;
  const hasOptimal = Boolean(optimal) && optimalB > optimalA;
  // Only an edge that is not already a reference bound gets a hairline: the
  // bound has one of its own, and two rules on one pixel is a heavier line
  // rather than a second mark.
  const optimalEdges = optimal
    ? [...(optimalFrom > lowN ? [optimalA] : []), ...(optimalTo < highN ? [optimalB] : [])]
    : [];

  const axis = axisLabels(placement, boundLabels);

  return (
    <div
      className={`arc-gauge relative mx-auto w-full ${className}`}
      style={{ maxWidth, aspectRatio: '1 / 1' }}
      role="img"
      aria-label={label}
    >
      {/* ── THE WELL. The ring sits in a groove of `PLOT_SURFACE`, in BOTH
          THEMES, and this is a correctness fix rather than a decorative one.

          The five band fills are solved against that one surface and are
          byte-identical in the two themes. What was NOT identical was the ground
          around them: an arc floating on a near-black card is the same gold read
          against a ground five stops darker than the one it was measured on, and
          the eye takes most of the difference out of the gold — which is exactly
          "the yellow reads as a dark, off yellow in dark mode".

          It is the range bar's own track, restored. The bar drew its five
          segments on `PLOT_SURFACE` in both themes for this reason and the arc
          dropped it along with the rectangle. Slightly wider than the ring on
          both sides, so the colour sits IN it rather than on it, and drawn as
          the same masked annulus so the two are concentric by construction. */}
      <div
        className="arc-gauge__well absolute"
        aria-hidden="true"
        style={{
          inset: `${GEO.c - GEO.outer - GEO.well}%`,
          background: WELL_GRADIENT,
          WebkitMaskImage: WELL_MASK,
          maskImage: WELL_MASK,
        }}
      />

      {/* THE RING. One conic gradient, cut to an annulus by a radial mask. The
          gap at the bottom is a hard stop inside the gradient rather than a
          second mask, so nothing here depends on `mask-composite`. */}
      <div
        className="arc-gauge__ring absolute"
        aria-hidden="true"
        style={{
          inset: `${GEO.c - GEO.outer}%`,
          background: RING_GRADIENT,
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
        {/* THE FOUR BOUNDARIES, MARKED — and they are at fixed angles now, so
            these hairlines are in the same place on every gauge in the product.
            Without them the only thing saying where the reference range ends is
            the colour change, which is exactly what must never be true here.

            TWO WEIGHTS, AND THE DIFFERENCE IS PROVENANCE. The reference bounds
            are what a LABORATORY stated and are drawn solid; the two
            significantly-out thresholds are DERIVED here (a multiple of the
            range's own width, unless the marker sets one) and are drawn at the
            lighter weight the trend chart already gives them. Drawing a number
            we computed at the same weight as a number a laboratory reported
            would be this product lending its own arithmetic the lab's authority.

            Static ink and not `espresso`, which resolves to a near-white cream
            in dark and is invisible on a pale green segment. */}
        {[GAUGE_BOUNDARIES.lowThreshold, GAUGE_BOUNDARIES.highThreshold].map((at, i) => (
          <line
            key={`threshold-${i}`}
            {...radialLine(at * 100)}
            stroke={chartTokens.referenceEdge}
            strokeOpacity={chartTokens.referenceEdgeOpacity}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {[GAUGE_BOUNDARIES.low, GAUGE_BOUNDARIES.high].map((at, i) => (
          <line
            key={`bound-${i}`}
            {...radialLine(at * 100)}
            stroke={chartTokens.referenceEdge}
            strokeOpacity={0.75}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
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
      {/* THE CENTRE WELL. 22% each side leaves 56% of the box for content, a
          little wider than the inner circle's inscribed square (47%) — which is
          deliberate rather than sloppy: a line of text is a horizontal band
          across the middle, where the circle is at its widest, and the corners
          of the box the band would overflow are whitespace. Tightening it to
          the inscribed square costs real room and buys nothing a reader sees. */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center" style={{ padding: '22%' }}>
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
 * and IT PRINTS NO FIGURES AT ALL. At the width a marker card gives it, two
 * figures round a 176px arc sit closer to the value in the middle than they do
 * to the hairlines they name — and unlike the SCALE ENDS the old version
 * printed, the reference bounds ARE recoverable from the card: it states its
 * range in words, in figures, two lines below.
 *
 * The four boundaries keep their HAIRLINES, so each is still marked, still at
 * the middle of its own blend, still at the same fixed angle as on every other
 * gauge in the product, and still locatable with the colour taken away.
 */
export function MiniArcGauge({
  value,
  low,
  high,
  status,
  severityThreshold = null,
  children,
}: Omit<ArcGaugeProps, 'optimal' | 'unit' | 'maxWidth' | 'boundLabels' | 'markPx' | 'sweepOnMount' | 'className'>) {
  const placement = gaugePlacement({ low, high, value, severityThreshold });
  const label = accessibleLabel(value, low, high, status);

  // Said rather than drawn — the same rule as the full gauge, and the same four
  // reasons. The card's short sentence rather than the long one, and the value
  // still printed above it: a card that drops both the picture and the number
  // is a card with a hole in it.
  if (!placement.drawable) {
    return (
      <div role="img" aria-label={label}>
        {children}
        <p className={`text-xs leading-snug text-espresso/85 ${children ? 'mt-2' : ''}`}>
          {RANGE_BAR_UNAVAILABLE[placement.undrawable].short}
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
      maxWidth={176}
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
 * THE FIGURES ROUND THE ARC — AND THERE ARE TWO OF THEM NOW, NOT FOUR.
 *
 * ── WHAT WAS DROPPED, AND WHY IT WAS RIGHT TO DROP IT (Aug 2026) ──────────
 *
 * The gauge used to print FOUR: the two reference bounds, and the two ends of
 * the numeric scale it was drawn on. The ends were load-bearing then — the ring
 * WAS a number line, and "the printed ends are the scale" was the contract that
 * stopped a value three times its upper limit being drawn against a label
 * reading "41".
 *
 * The ring is not a number line any more. Its two ends mean "significantly
 * below" and "significantly above", which are STATES rather than quantities, and
 * printing a figure at each end would be labelling a position that no longer
 * corresponds to it — the exact class of falsehood the four labels existed to
 * prevent, arrived at from the other side. They are gone.
 *
 * ── AND THE TWO THRESHOLDS ARE MARKED BUT NOT NUMBERED ────────────────────
 *
 * Where gold meets red is a real boundary and gets a hairline, but the value at
 * it is DERIVED here — a multiple of the range's own width, unless the marker
 * carries an explicit one — and printing it beside two figures a laboratory
 * actually stated would give this product's arithmetic the laboratory's
 * authority. The state is named in words by the status label instead, which is
 * what it is.
 *
 * So: the two reference bounds, at the two fixed angles where green meets gold.
 * Same place on every gauge in the product, which is the whole point of the ring
 * being fixed — and with fixed positions there is no collision case left to
 * referee, so the rule that used to decide which of two colliding labels
 * survived has gone with the labels it was about.
 */
function axisLabels(
  placement: Extract<GaugePlacement, { drawable: true }>,
  boundLabels: boolean,
): { key: string; at: number; text: string; kind: 'end' | 'bound' }[] {
  if (!boundLabels) return [];
  return [
    { key: 'bound-low', at: GAUGE_BOUNDARIES.low * 100, text: formatReferenceBound(placement.low), kind: 'bound' },
    { key: 'bound-high', at: GAUGE_BOUNDARIES.high * 100, text: formatReferenceBound(placement.high), kind: 'bound' },
  ];
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

/**
 * The WELL's own annulus — the same construction one step wider on each side,
 * so the two are concentric by arithmetic rather than by two numbers agreeing.
 */
const WELL_OUTER = GEO.outer + GEO.well;
const WELL_INNER = RING_INNER - GEO.well;
const WELL_MASK = [
  'radial-gradient(closest-side circle at 50% 50%,',
  `transparent ${(((WELL_INNER - 0.4) / WELL_OUTER) * 100).toFixed(2)}%,`,
  `#000 ${(((WELL_INNER + 0.4) / WELL_OUTER) * 100).toFixed(2)}%,`,
  '#000 99%,',
  'transparent 100%)',
].join(' ');

/**
 * The well is a conic gradient rather than a flat colour for one reason: it has
 * to STOP where the arc stops. A flat annulus would close the 90° gap at the
 * bottom and turn the arc into a full circle in a pale ring — which says the
 * scale wraps, the one thing the arc's shape exists to deny. Same hard stop at
 * the same fraction of the turn as `RING_GRADIENT`, so the two ends line up.
 */
const WELL_GRADIENT = (() => {
  const end = (ARC_SHARE * 100).toFixed(3);
  const ground = chartTokens.plotSurface;
  return `conic-gradient(from ${CONIC_FROM_DEG}deg, ${ground} 0%, ${ground} ${end}%, transparent ${end}%, transparent 100%)`;
})();

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
 * THE WHOLE RING, AS ONE CONIC GRADIENT — AND IT IS A CONSTANT.
 *
 * Five flat regions with a blend centred on each of the four boundaries between
 * them, in the same five fills and the same two hinge colours the trend chart's
 * own history and both PDFs use. Three things follow from building it as ONE
 * gradient, and each was a bug the per-segment version could have:
 *
 *  · THE BOUNDARY IS AT THE MIDDLE OF ITS BLEND, so the hairline that marks it
 *    runs through the middle of the colour change rather than along the edge of
 *    one, and a result sitting exactly on a limit is drawn half in each.
 *  · IT IS ONE ELEMENT, so two neighbouring regions cannot disagree by a
 *    rounding at the seam and leave a hairline of card showing through.
 *  · IT IS COMPUTED ONCE, at module scope, because it no longer depends on the
 *    value. That is not a performance note — it is the whole change, stated as
 *    code: a gradient that cannot take an argument cannot vary between two cards
 *    on one grid.
 *
 * ── WHAT THIS REPLACED ────────────────────────────────────────────────────
 *
 * It used to be `bandRampStops` placed by VALUE and converted through a numeric
 * scale — correct, and correct in a way that moved the green. See the note at
 * the top of lib/rangeScale.ts for the failure; the short version is that a
 * fixed geometry cannot have it.
 *
 * ── THE BLEND WIDTHS ARE CLAMPED PER BOUNDARY, NOT PER BAND ───────────────
 *
 * Each boundary takes the smallest of a nominal half-width and HALF THE GAP to
 * the boundary either side of it. Half the gap is exactly "stop at the midpoint
 * between two boundaries" — two neighbours each reaching at most halfway can
 * meet and can never overlap — and taking the SAME figure on both sides is what
 * keeps a boundary in the middle of its own blend. Clamping per band instead
 * lets a blend go lopsided, which puts the hairline off-centre in the gradient
 * it is marking. That is the identical rule `bandRampStops` applies in value
 * space, applied here in angle space.
 */
const RING_GRADIENT = (() => {
  const [green, olive, gold, orange, red] = (['green', 'olive', 'yellow', 'orange', 'red'] as const).map(
    (hue) => hueTint[hue].fill,
  );
  const b = GAUGE_BOUNDARIES;
  /**
   * How wide a blend would be if nothing bound it, as a fraction of the arc.
   * Wider than any gap here, so every one of the four is decided by its
   * neighbours rather than by this — which is the harmless direction: it means
   * each blend is as wide as it can be without two of them touching.
   */
  const NOMINAL = 0.2;
  const edges = [0, b.lowThreshold, b.low, b.high, b.highThreshold, 1];
  const halfWidth = (i: number) => Math.min(NOMINAL, (edges[i] - edges[i - 1]) / 2, (edges[i + 1] - edges[i]) / 2);

  const stops: [number, string][] = [];
  const at = (position: number, colour: string) => stops.push([position, colour]);
  // Low to high: flat red, hinge to gold at the threshold, flat gold, hinge to
  // green at the bound, flat green, and the mirror of all of it on the way out.
  const w1 = halfWidth(1);
  const w2 = halfWidth(2);
  const w3 = halfWidth(3);
  const w4 = halfWidth(4);
  at(0, red);
  at(b.lowThreshold - w1, red);
  at(b.lowThreshold, orange);
  at(b.lowThreshold + w1, gold);
  at(b.low - w2, gold);
  at(b.low, olive);
  at(b.low + w2, green);
  at(b.high - w3, green);
  at(b.high, olive);
  at(b.high + w3, gold);
  at(b.highThreshold - w4, gold);
  at(b.highThreshold, orange);
  at(b.highThreshold + w4, red);
  at(1, red);

  const end = (ARC_SHARE * 100).toFixed(3);
  const body = stops.map(([position, colour]) => `${colour} ${(position * 100 * ARC_SHARE).toFixed(3)}%`).join(', ');
  // The 90° gap is a HARD STOP rather than a fade: two stops at the same
  // position do not interpolate, which is what keeps the arc from ending in the
  // grey shoulder a fade toward `transparent` would take it through.
  return `conic-gradient(from ${CONIC_FROM_DEG}deg, ${body}, transparent ${end}%, transparent 100%)`;
})();
