import { useEffect, useId, useState } from 'react';
import {
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
} from 'recharts';
import {
  asMarkerStatus,
  chart as chartTokens,
  statusBands,
  statusPaint,
  bandRampStops,
  TRANSITION_SHARE,
  OPTIMAL_FILL,
  referenceRangePeriods,
  periodStepBoundaries,
  formatOptimalRange,
  formatReferenceBound,
  formatReferenceRange,
  formatDate,
  type MarkerStatus,
  type MarkerStatusInput,
  type OptimalRangeDTO,
} from '@aspire-bloods/shared';
import { formatAxisDate } from '../../lib/patientPortal';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { statusColor, statusLabel } from '../../lib/markerCopy';

/**
 * One marker over time.
 *
 * Three things this chart refuses to do, each of which it used to:
 *
 *  - Draw a line through fewer than two points. A single result has no
 *    direction, and a flat segment through one point reads as "steady", which
 *    is a claim nobody has the data to make.
 *  - Draw a line between results that aren't comparable. Two values that
 *    needed a unit conversion we don't hold are two separate facts, not a
 *    trajectory, so they render as unconnected points.
 *  - Say anything evaluative. The bands show where the lab's reference range
 *    sits and nothing more. None of them is labelled good, healthy, bad,
 *    concerning or danger, and none ever will be.
 *
 * WHAT THE BANDS ARE. The reference range renders as a soft green region.
 * Immediately above and below it, yellow. Beyond the point where the status
 * itself changes to significantly out, red — with orange as the transition
 * between the two, which is the whole of orange's job here and is never a
 * state a result can be in. Every one of those boundaries is derived from THAT
 * point's own reference range and severity threshold: a marker whose range is
 * 20–42 gets bands sized for 20–42, and the band a value falls in is always
 * the band its own status says it is in. Nothing here is a fixed scale.
 *
 * ------------------------------------------------------------------------
 * THE BANDS ARE CONTEXT AND THE LINE IS CONTENT (redesigned Aug 2026)
 * ------------------------------------------------------------------------
 *
 * They used to be four opaque, saturated slabs spanning the plot edge to edge,
 * each meeting the next at a hard step, with a near-solid rule drawn over every
 * boundary and a thin line somewhere behind it all. Everything anybody disliked
 * about this chart followed from that one thing: at equal weight and full
 * strength, five regions of colour ARE the picture, and the reader's own result
 * is a detail on top of them. It read as a fill tool rather than as shading.
 *
 * Four changes, and they are one change:
 *
 *  1. WEIGHT — AND IT IS A COLOUR, NOT AN ALPHA (Aug 2026). A band is an
 *     OPAQUE fill; nothing behind one shows through it, on the rect or in the
 *     gradient stops. The ladder is unchanged and unequal — in range carries
 *     the least, out-of-range more, significantly-out most — but it is carried
 *     by how far each fill stands off the plot surface (`BAND_CONTRAST`)
 *     rather than by how much of it is let through. Translucency was the
 *     ceiling on how much colour a band could hold: at 15% alpha the in-range
 *     band carried 15% of whatever green it was given, which is what "washed
 *     out" was, and it is why re-picking the hue never fixed it.
 *  2. THE RAMP, AND IT IS AT THE BOUNDARY (Aug 2026). Each band is FLAT across
 *     itself and blends into its neighbour over a zone CENTRED ON the boundary
 *     between them (`bandRampStops`): flat green, then green→olive→gold across
 *     the reference bound with the bound at the midpoint, then flat gold, then
 *     gold→orange→red across the significantly-out threshold, then flat red.
 *     A value one unit inside the range and one unit outside it are not
 *     clinically different, and a hard edge at the bound says they are; a ramp
 *     across a whole band says the opposite falsehood, that the middle of
 *     "above range" is a transition. The dotted boundary hairline runs through
 *     the MIDDLE of its gradient rather than along its edge.
 *  3. HAIRLINES. The boundaries are 1px strokes at low opacity — and the
 *     reference bounds are LABELLED INLINE on the left axis, so "where does my
 *     range actually start" is answered on the chart instead of in the key.
 *  4. AXES. Round tick values only, four of them, no gridlines, no box — and a
 *     tick that would print on top of a reference bound is dropped, because the
 *     bound is the number that means something.
 *
 * WHY THAT IS STILL SAFE. Colour is the last thing carrying status, never the
 * first — and softening it takes nothing away from the layers that do. The
 * point's SHAPE still says it (level dot, triangle, doubled triangle), the
 * tooltip still says it in words, every band still carries a visible boundary
 * line, and the key below still names every band and every mark in text. Turn
 * the whole thing greyscale and nothing is lost, which matters most for exactly
 * this pair, since red and green are the commonest confusion there is.
 */

/**
 * A calendar date as an epoch value, for a time-scaled axis.
 *
 * Read as UTC midnight deliberately: a sample date is a calendar date, not an
 * instant, and parsing it in local time shifts it a day west of Greenwich —
 * the same reason packages/shared/format.ts reads the parts directly.
 */
function epochOf(sampleDate: string): number {
  return Date.parse(`${sampleDate.slice(0, 10)}T00:00:00Z`);
}

const DAY_MS = 86_400_000;

interface TrendPoint {
  sampleDate: string;
  value: number;
  unit?: string;
  /**
   * Nullable because the wire is. A point with no status is dropped before
   * anything is drawn — see the filter in TrendChart.
   */
  status: MarkerStatusInput;
  referenceLow: number;
  referenceHigh: number;
  /**
   * Where significantly-out begins for this marker, in the value's own units.
   * Absent on an older payload, in which case the shared default multiplier is
   * applied to the range width — see severityThresholdFor.
   */
  severityThreshold?: number;
  sourceLabel?: string;
  converted?: boolean;
  originalValue?: number;
  originalUnit?: string;
}

/** A point with its date resolved to a number, which is what everything below reads. */
type PlottedPoint = TrendPoint & { t: number };

// ---------------------------------------------------------------------------
// A NUMBER SOMEBODY WOULD HAVE CHOSEN.
//
// The y-axis used to read 0, 8, 16, 24, 31.9 — because Recharts, handed a
// domain, divides it into equal parts and prints whatever falls out, and the
// top of the domain is the data plus a computed pad. 31.9 is not a quantity
// anybody picked, it is an artefact of the padding arithmetic showing through,
// and a reader who sees one immediately (and correctly) stops trusting the
// numbers beside it.
//
// So the ticks are chosen from the 1 / 2 / 2.5 / 5 ladder at the marker's own
// order of magnitude and placed INSIDE the domain rather than at its ends. The
// domain is untouched by this: the bands are geometry derived from the
// reference range and must not move because an axis label wanted to be round.
// ---------------------------------------------------------------------------

/** The smallest step from the 1/2/2.5/5 ladder that is at least `rough`. */
function niceStep(rough: number): number {
  if (!Number.isFinite(rough) || rough <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 2.5 ? 2.5 : normalised <= 5 ? 5 : 10;
  return step * magnitude;
}

/** How many decimals a value needs to print exactly, capped where a lab result stops caring. */
function decimalsOf(value: number): number {
  const text = String(value);
  const dot = text.indexOf('.');
  return dot < 0 ? 0 : Math.min(3, text.length - dot - 1);
}

/**
 * Round tick values within [min, max] — four of them where the span allows,
 * which is fewer than the six or seven Recharts reaches for by default. A trend
 * chart is read for its shape; the axis is there to give that shape a scale,
 * and every extra label is furniture competing with the data.
 */
/**
 * HOW CLOSE A TICK MAY GET TO A REFERENCE BOUND BEFORE IT IS DROPPED, as a
 * share of the y domain.
 *
 * It was 2%, which is not a distance on screen — it is a distance in the
 * marker's own units, and the two are only related through the plot's height.
 * On a marker whose domain spans ~500 units over a ~200px plot, 2% is 10 units
 * and therefore 4px: a round tick at 400 and a reference bound at 375 cleared
 * it comfortably and then printed on top of each other.
 *
 * 8%. On the SHORTEST plot this chart is ever drawn at (the `h-64` case, less
 * the margins and the x-axis, so roughly 200px) that is 16px — comfortably
 * more than the 12px `BoundaryLabels` uses to resolve its own collisions,
 * because these two labels are not merely near each other, they are in the
 * same gutter and one of them has a lead rule attached.
 *
 * 6% was tried first and is the arithmetic answer (12px, the same figure);
 * rendered, it left ALT's tick at 50 sitting directly on its reference bound
 * at 41, which is the collision this exists to prevent. Nothing is lost by the
 * extra room: dropping a tick reruns the ladder at a finer step, so the axis
 * ends up with the same number of labels somewhere else.
 *
 * The BOUND always wins, never the tick: a tick value is where the scale
 * happens to be marked and a bound is a clinical threshold.
 */
const TICK_BOUND_GAP = 0.08;

function niceTicks(min: number, max: number, target = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
  const step = niceStep((max - min) / target);
  const decimals = Math.max(0, Math.ceil(-Math.log10(step)) + 1);
  const ticks: number[] = [];
  const first = Math.ceil(min / step - 1e-9) * step;
  for (let i = 0; i < 40; i += 1) {
    const value = first + i * step;
    if (value > max + step * 1e-9) break;
    // Rebuilt from the step each time rather than accumulated, so 0.1 + 0.1 +
    // 0.1 does not print as 0.30000000000000004 on somebody's blood result.
    ticks.push(Number(value.toFixed(decimals)));
  }
  return ticks.length >= 2 ? ticks : [];
}

/**
 * Status as a shape, not a hue.
 *
 * Direction is legible at 10px and survives greyscale, a colour-blind reader
 * and a printed page — none of which a fill colour does. Severity is the
 * doubled mark, the same doubled-chevron idea the status badges use, so the
 * vocabulary is one vocabulary across the product.
 */
const STATUS_SHAPE: Record<MarkerStatus, 'circle' | 'up' | 'down' | 'double-up' | 'double-down'> = {
  IN_RANGE: 'circle',
  HIGH: 'up',
  LOW: 'down',
  SIGNIFICANT_HIGH: 'double-up',
  SIGNIFICANT_LOW: 'double-down',
};

/**
 * A point's own state's colour — the same green/gold/red family the band under
 * it uses, several steps stronger. It is the mark's OUTLINE rather than its
 * fill; see StatusMark.
 */
function markFill(status: MarkerStatus): string {
  return statusPaint(status).mark;
}

/**
 * A mark drawn as an OUTLINE ON THE PLOT'S OWN GROUND, not a filled blob.
 *
 * Inverted (Aug 2026). It used to be a solid lozenge of the status colour with
 * a ring of the surface around it, which is a fair amount of saturated colour
 * repeated once per result — on a series of six, six more coloured objects on
 * a plot that already has three coloured regions in it. Filled with the plot's
 * own surface and stroked in the status colour, the same information arrives as
 * a drawn shape: the outline carries the hue, the interior is a hole in the
 * band, and the trend line visibly passes BEHIND the point rather than stopping
 * at it — because the interior is genuinely opaque ground rather than a colour
 * that happens to sit on top.
 *
 * `paintOrder: stroke` still applies and still for the reason below: a stroke
 * straddles its path, and on a 5px triangle that eats half the shape from the
 * inside.
 */
/**
 * ── AND OFF THE PLOT IT IS A DIFFERENT COLOUR, WHICH IS NOT A CHOICE ───────
 *
 * The same glyph is drawn in three places: on the plot over its own band, in
 * the tooltip, and in the key — and the last two are on a CARD. `--c-hue-*-mark`
 * is solved against the BAND (see MARK_SHIFT_DARK), and since the out-of-range
 * band became a real yellow the dark mark for it steps toward the ground rather
 * than away from it. #45370f clears its own gold band at 3.28:1 and measures
 * 1.28:1 on the card, which is a triangle nobody can see in the key.
 *
 * So `surface` says which ground this instance is standing on, and the mark
 * takes the STATUS TEXT colour there instead — which is the token already
 * solved for a card, and already what the tooltip colours the status word with
 * one line below the glyph. On the plot nothing changes.
 */
function StatusMark({
  cx,
  cy,
  status,
  size = 1,
  ring = 1,
  surface = 'plot',
}: {
  cx: number;
  cy: number;
  status: MarkerStatusInput;
  size?: number;
  /** The VISIBLE width of the outline, in pixels — see paintOrder below. */
  ring?: number;
  /** Where this instance is drawn. `card` is the key and the tooltip. */
  surface?: 'plot' | 'card';
}) {
  const known = asMarkerStatus(status);
  // No status, no mark. Every shape here — level dot, triangle, doubled
  // triangle — is a claim about where the value sits, and that is precisely
  // what is unknown. Unreachable once the series is filtered below; stated so
  // the lookup cannot be the thing that throws.
  if (!known) return null;
  const r = 5 * size;
  const common = {
    // The plot's ground, not the card's: the point sits inside the inset panel,
    // and filling it with the card colour would make every mark read as a
    // slightly lighter patch than the surface it is punched out of. Off the
    // plot there is no ground to punch it out of, so the shape is hollow and
    // the card shows through it.
    fill: surface === 'plot' ? chartTokens.plotSurface : 'transparent',
    stroke: surface === 'plot' ? markFill(known) : statusColor(known),
    // Doubled, because `paint-order: stroke` draws the outline FIRST and then
    // fills over its inner half — so half of the declared width is what shows.
    strokeWidth: ring * 2,
    strokeLinejoin: 'round' as const,
    /**
     * THE OUTLINE GOES OUTSIDE THE MARK, NOT THROUGH IT.
     *
     * An SVG stroke straddles its path, so a 1.5px stroke on a 5px triangle
     * eats about half the triangle's own area from the inside — and that is not
     * a theoretical amount. A circle survives it (its area grows with r²); a
     * triangle at the same r has under half the area and does not.
     */
    paintOrder: 'stroke' as const,
  };
  const shape = STATUS_SHAPE[known];

  if (shape === 'circle') return <circle cx={cx} cy={cy} r={r} {...common} />;

  const up = shape === 'up' || shape === 'double-up';
  const tri = (offset: number) =>
    up
      ? `${cx},${cy - r - offset} ${cx + r},${cy + r * 0.6 - offset} ${cx - r},${cy + r * 0.6 - offset}`
      : `${cx},${cy + r + offset} ${cx + r},${cy - r * 0.6 + offset} ${cx - r},${cy - r * 0.6 + offset}`;

  if (shape === 'up' || shape === 'down') return <polygon points={tri(0)} {...common} />;

  // Significant: two stacked triangles, pointing the same way.
  return (
    <g>
      <polygon points={tri(r * 0.75)} {...common} />
      <polygon points={tri(-r * 0.55)} {...common} />
    </g>
  );
}

/**
 * THE MOST RECENT POINT IS THE ONE THE READER CAME FOR.
 *
 * Every point on this chart used to be drawn at exactly the same size, which
 * makes the series read as a set of equally interesting facts. It isn't: the
 * history is context for the latest result, in the same way the bands are
 * context for the line. So the last point is larger and carries a soft halo of
 * its own colour, and the ones behind it are smaller and quieter.
 *
 * Nothing about the SHAPE layer changes with the size — a triangle at 0.82 is
 * the same triangle, and the tooltip and the key say the same words about it.
 */
function CustomDot(props: {
  cx?: number;
  cy?: number;
  payload?: PlottedPoint;
  latestT?: number;
  /** The most recent value, printed beside its own point. See LatestValueLabel. */
  latestLabel?: string;
}) {
  const { cx, cy, payload, latestT, latestLabel } = props;
  if (cx == null || cy == null || !payload) return null;
  const known = asMarkerStatus(payload.status);
  const latest = payload.t === latestT;
  return (
    <g>
      {latest && known && (
        <circle cx={cx} cy={cy} r={13} fill={markFill(known)} fillOpacity={chartTokens.haloOpacity} />
      )}
      {/* Invisible circle widens the touch/click target well past the visible marker — the
          visible mark stays small and precise, the tappable area doesn't. */}
      <circle cx={cx} cy={cy} r={16} fill="transparent" />
      <StatusMark cx={cx} cy={cy} status={payload.status} size={latest ? 1.2 : 0.9} ring={latest ? 2.2 : 1.6} />
      {latest && latestLabel && <LatestValueLabel cx={cx} cy={cy} text={latestLabel} />}
    </g>
  );
}

/**
 * ---------------------------------------------------------------------------
 * THE MOST RECENT VALUE, PRINTED ON THE PLOT (Aug 2026).
 * ---------------------------------------------------------------------------
 *
 * Every point on this chart was an anonymous mark: to read what any of them
 * actually WAS you had to hover, which is a gesture that does not exist on a
 * phone and is not one anybody thinks to try on a page they came to read. The
 * latest result is the one the reader came for — it is already drawn larger and
 * haloed for exactly that reason — so it says its own number.
 *
 * ONE POINT, NOT ALL OF THEM. A number beside every mark is a table drawn on top
 * of a chart: it fights the line, it collides with itself on a tight series, and
 * it removes the reason the shape is there. The history stays a shape; the
 * latest result is a figure.
 *
 * NO BOX BEHIND IT. The label stands on an opaque band, so it needs to survive
 * whatever colour that band is — done with a STROKE in the plot's own ground
 * under `paint-order: stroke`, which is a halo the shape of the letters rather
 * than a chip that would be a second small rectangle on a plot that already has
 * a frame and five regions.
 *
 * PLACED ABOVE THE POINT, or below it when the point is near the ceiling, and
 * clamped into the plot on both sides — the latest point sits in the last 6% of
 * the domain, so a middle-anchored label would otherwise hang out over the axis
 * gutter.
 */
function LatestValueLabel({ cx, cy, text }: { cx: number; cy: number; text: string }) {
  const plot = usePlotArea();
  // Outside a chart there is no plot area to clamp against, and a label that
  // cannot be placed is better absent than placed wrongly.
  if (!plot) return null;
  // A crude width, and crude is the right amount of effort: it is only used to
  // keep the label inside the plot, and mono digits are near enough uniform.
  const halfWidth = text.length * 3.6 + 4;
  const below = cy - plot.y < plot.height * 0.2;
  const x = Math.min(Math.max(cx, plot.x + halfWidth), plot.x + plot.width - halfWidth);
  return (
    <text
      x={x}
      y={below ? cy + 26 : cy - 19}
      textAnchor="middle"
      className="numeric"
      fontSize={13}
      fontWeight={600}
      fill={chartTokens.boundLabel}
      stroke={chartTokens.plotSurface}
      strokeWidth={3.5}
      paintOrder="stroke"
      strokeLinejoin="round"
      // The value is already in the accessible summary and the tooltip; a third
      // reading of it is noise to a screen reader.
      aria-hidden="true"
    >
      {text}
    </text>
  );
}

/**
 * ---------------------------------------------------------------------------
 * THE PLOT AREA, AS AN INSET PANEL.
 * ---------------------------------------------------------------------------
 *
 * A hairline frame and a surface fractionally away from the card, so the
 * drawing sits INSIDE something rather than floating on the card.
 *
 * "No box, no frame" was the previous rule and it was right at the time: the
 * bands were saturated slabs tiling the plot edge to edge, so an outline round
 * them was a second outline round a filled rectangle. With the bands flat and
 * low-weight there is real ground showing between them and the card, and
 * ground needs an edge or it is just a lighter part of the card.
 *
 * NOT a ReferenceArea, deliberately. Recharts gives every ReferenceArea the
 * class the band geometry is measured through (e2e/chart-bands.spec.ts groups
 * `.recharts-reference-area-rect` by x-extent to count band periods), so a
 * full-width panel drawn as one would register as an extra period spanning the
 * whole plot and every assertion about stepping would be measuring a frame.
 */
function PlotPanel() {
  const plot = usePlotArea();
  if (!plot) return null;
  return (
    <rect
      x={plot.x}
      y={plot.y}
      width={plot.width}
      height={plot.height}
      fill={chartTokens.plotSurface}
      stroke={chartTokens.plotFrame}
      strokeOpacity={chartTokens.plotFrameOpacity}
      strokeWidth={1}
      // No shadow and no inner border: one hairline, drawn once.
      shapeRendering="crispEdges"
      aria-hidden="true"
    />
  );
}

/**
 * THE OPTIMAL RANGE, AS A NARROWING OF IN-RANGE AND NOT A SECOND SYSTEM.
 *
 * It used to be a hatched band with a dashed edge and its own line in the key,
 * drawn over a green reference band — two overlapping green regions in two
 * textures, which reads as two schemes making competing claims about the same
 * result. An optimal range is not a parallel concept: it is a NARROWING of the
 * lab's range, and it is drawn as one now. The same green, taken a rung deeper
 * on the band ladder, over the part of the reference range that is also
 * optimal, with a neutral hairline where the narrowing starts.
 *
 * DRAWN AS THE INTERSECTION WITH THE REFERENCE RANGE, and per period, which is
 * two decisions:
 *  · Intersection, because a published band whose ceiling sits above the lab's
 *    has no narrowing to draw past that point, and green painted over the gold
 *    segment would be the two-systems problem again in a worse form. The band's
 *    own figures are stated in words — in the tooltip and above the chart — so
 *    nothing is lost by not drawing them.
 *  · Per period, because the reference range can change partway through a
 *    series and the intersection changes with it.
 *
 * NOT a ReferenceArea, for the same reason PlotPanel is not: Recharts gives
 * every ReferenceArea the class e2e/chart-bands.spec.ts groups by x-extent to
 * count band periods, and a region that is not a status band must not be
 * counted as one.
 */
interface OptimalRegion {
  x1: number;
  x2: number;
  from: number;
  to: number;
  /** The edges of the narrowing that are NOT already a reference bound — a bound has a hairline of its own. */
  edges: number[];
}

function OptimalRegions({ regions }: { regions: OptimalRegion[] }) {
  const plot = usePlotArea();
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  if (!plot || !xScale || !yScale) return null;
  return (
    <g aria-hidden="true">
      {regions.map((region, i) => {
        const px = [xScale(region.x1), xScale(region.x2)];
        const py = [yScale(region.from), yScale(region.to)];
        if ([...px, ...py].some((v) => v == null || !Number.isFinite(v))) return null;
        const left = Math.max(plot.x, Math.min(px[0] as number, px[1] as number));
        const right = Math.min(plot.x + plot.width, Math.max(px[0] as number, px[1] as number));
        const top = Math.max(plot.y, Math.min(py[0] as number, py[1] as number));
        const bottom = Math.min(plot.y + plot.height, Math.max(py[0] as number, py[1] as number));
        if (right <= left || bottom <= top) return null;
        return (
          <g key={`optimal-${i}`}>
            <rect
              x={left}
              y={top}
              width={right - left}
              height={bottom - top}
              // Opaque, like every other band. This was `fillOpacity={0.09}`
              // over the in-range green — a fifth translucency in a chart that
              // now has none, and one whose result depended on what it happened
              // to be drawn over.
              fill={OPTIMAL_FILL}
            />
            {region.edges.map((value) => {
              const y = yScale(value);
              if (y == null || !Number.isFinite(y)) return null;
              return (
                <line
                  key={`optimal-edge-${value}`}
                  x1={left}
                  x2={right}
                  y1={y}
                  y2={y}
                  // The same neutral every other boundary in this chart is drawn
                  // in, at the lighter of the two weights: a reference bound is
                  // heavier because it is what the chart is about. A hue here
                  // would be the second system coming back as a line.
                  stroke={chartTokens.referenceEdge}
                  strokeOpacity={chartTokens.severityEdgeOpacity}
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

/**
 * THE REFERENCE BOUNDS, LABELLED ON THE AXIS — AND EVERY PERIOD'S, NOT JUST
 * THE LAST ONE'S.
 *
 * A boundary line with no number on it sends the reader to the key to find out
 * what it is, and the key cannot tell them — it can say "the reference range"
 * but not "3.5 to 5.3". Printing the values level with their own lines answers
 * it in place, and it is what lets the key drop its band entries entirely.
 *
 * ON THE LEFT, WITH THE SCALE, AND TOLD APART FROM IT (Aug 2026). They used to
 * print in the right-hand margin, which reads as a second axis facing the wrong
 * way. They belong beside the scale — and therefore have to be distinguishable
 * from it, because a tick value is where the scale happens to be marked and a
 * reference bound is a clinical threshold. Same face, same size, and the bound
 * is set in the text colour with a short lead rule running to its own hairline
 * while the ticks stay muted. Weight and a mark, never a hue: a coloured axis
 * label would be the status layer leaking into the furniture.
 *
 * ONLY THE CURRENT PERIOD'S BOUNDS GO ON THE AXIS, because the axis has one
 * left-hand gutter and a marker whose range has changed has two sets of bounds.
 * The earlier periods keep their labels at the right-hand end of their OWN
 * extent, just inside their step rule — which is also the only place they can
 * go and still say which period they belong to.
 */
interface BoundLabel {
  value: number;
  text: string;
}
interface LabelColumn {
  /** Where this period ends, in the x domain. Null for the last one, which is labelled on the axis. */
  endsAt: number | null;
  bounds: BoundLabel[];
}

/** Roughly how wide this text is at 11px in the mono face — enough to know whether it fits. */
function labelWidth(text: string): number {
  return text.length * 6.6;
}

function BoundaryLabels({ columns }: { columns: LabelColumn[] }) {
  const plot = usePlotArea();
  const yScale = useYAxisScale();
  const xScale = useXAxisScale();
  if (!plot || !yScale) return null;
  return (
    <g aria-hidden="true">
      {columns.map((column, ci) => {
        // Collisions are resolved per COLUMN. Two labels a few pixels apart in
        // the same column overlap into an unreadable smudge; the same two in
        // different columns are metres apart on screen and both fine.
        const placed: number[] = [];
        const onAxis = column.endsAt === null;
        const endX = onAxis ? null : xScale?.(column.endsAt as number);
        if (!onAxis && (endX == null || !Number.isFinite(endX))) return null;
        return (
          <g key={`bounds-${ci}`}>
            {column.bounds.map(({ value, text }) => {
              const y = yScale(value);
              if (y == null || !Number.isFinite(y)) return null;
              if (y < plot.y || y > plot.y + plot.height) return null;
              if (placed.some((other) => Math.abs(other - y) < 12)) return null;
              // A period too narrow to hold its own label goes unlabelled rather
              // than printing over its neighbour's band. The sentence below the
              // chart still names every range and its dates, which is why this
              // can be dropped without losing the fact.
              if (!onAxis && (endX as number) - labelWidth(text) - 4 < plot.x) return null;
              placed.push(y);
              return (
                <g key={text}>
                  {/* The lead rule. Four pixels of hairline from the label to
                      the frame, so the number is attached to a boundary rather
                      than merely level with one — which is the whole of what
                      separates it from a tick value at a glance. */}
                  {onAxis && (
                    <line
                      x1={plot.x - 5}
                      y1={y}
                      x2={plot.x}
                      y2={y}
                      stroke={chartTokens.boundLabel}
                      strokeWidth={1}
                      shapeRendering="crispEdges"
                    />
                  )}
                  <text
                    x={onAxis ? plot.x - 9 : (endX as number) - 4}
                    y={y}
                    dy="0.32em"
                    textAnchor="end"
                    fontSize={11}
                    fontFamily="var(--font-mono)"
                    fill={chartTokens.boundLabel}
                  >
                    {text}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

/** Value, unit, date, status and source — everything needed to read a point without leaving it. */
function ChartTooltip({
  active,
  payload,
  optimal,
}: {
  active?: boolean;
  payload?: { payload: TrendPoint }[];
  optimal?: OptimalRangeDTO | null;
}) {
  if (!active || !payload?.[0]) return null;
  const point = payload[0].payload;
  const withinOptimal =
    optimal == null
      ? null
      : (optimal.low == null || point.value >= optimal.low) && (optimal.high == null || point.value <= optimal.high);
  const unit = point.unit ? ` ${point.unit}` : '';

  return (
    // A CARD, not a browser tooltip: the product's own hairline and warm
    // espresso-derived shadow, at the popover level so it reads as lifted off
    // the chart rather than drawn on it.
    //
    // GLASS rather than a flat surface, the same material as the pinned results
    // control bar and the sidebar — so the plot underneath is diffused instead
    // of covered, which is what a tooltip on a chart should do: it is a reading
    // OF the chart and should not delete the part it is reading.
    <div className="glass min-w-[11rem] rounded-card border border-taupe px-4 py-3 text-xs shadow-popover">
      <p className="numeric text-[11px] uppercase tracking-eyebrow text-espresso/80">{formatDate(point.sampleDate)}</p>
      <p className="numeric tabular mt-1.5 text-lg font-semibold leading-none text-espresso">
        {point.value}
        {point.unit && <span className="ml-1 text-xs font-normal text-espresso/80">{point.unit}</span>}
      </p>
      {/* The status word takes its own state's colour. It is a label FOR that
          colour rather than content sitting in it, and it still leads with the
          mark's shape — so it reads identically with the colour removed. */}
      <p className="mt-2 flex items-center gap-1.5 font-medium" style={{ color: statusColor(point.status) }}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <StatusMark cx={6} cy={6} status={point.status} size={0.9} surface="card" />
        </svg>
        {statusLabel(point.status)}
      </p>
      {/* THAT point's range, not the marker's current one — the whole reason a
          changed reference range gets a step, a dashed rule and a sentence. */}
      {/* Formatted, never interpolated raw. These bounds have been through a
          unit conversion by the time they get here, and `{point.referenceLow}`
          printed one as 3.884960761896305 in a patient-facing tooltip. */}
      <p className="mt-2 border-t border-taupe/60 pt-2 text-espresso/80">
        Reference range{' '}
        <span className="numeric">
          {formatReferenceRange(point.referenceLow, point.referenceHigh)}
          {unit}
        </span>
      </p>
      {/* Advisory, and clearly separate from the status above it. */}
      {optimal && (
        <p className="tabular mt-1 text-espresso/80">
          Optimal {formatOptimalRange(optimal.low, optimal.high, optimal.unit)}
          <span> · {withinOptimal ? 'within optimal' : 'outside optimal'}</span>
        </p>
      )}
      {point.sourceLabel && <p className="mt-1 text-espresso/80">{point.sourceLabel}</p>}
      {point.converted && (
        <p className="mt-1 text-espresso/80">
          Converted from {point.originalValue} {point.originalUnit}
        </p>
      )}
    </div>
  );
}

export function TrendChart({
  data: input,
  crossSourceComparable = true,
  optimal = null,
  height = 'default',
}: {
  data: TrendPoint[];
  crossSourceComparable?: boolean;
  /** The advisory optimal band, or null when this marker has no established one — in which case nothing about optimal is drawn or said. */
  optimal?: OptimalRangeDTO | null;
  /**
   * `tall` is the marker detail page, where this card takes 60% of the row
   * rather than 50%. The extra height over `default` is not decoration: a trend
   * line in a squat plot area exaggerates every movement in it, which on a page
   * about someone's blood is the wrong kind of wrong.
   *
   * It used to run to 30rem at lg, which is where the marker page stopped
   * fitting on a 900px screen — the chart card sets the height of the row and
   * therefore of the card beside it, so 480px of plot plus the eyebrow, the key
   * and the padding pushed the pair past the fold on the exact laptop most
   * patients read this on. 22rem is the plot area at which a 60%-width card
   * still reads wider than it is tall (roughly 640×352 at 1440), which is the
   * proportion that was actually being protected. The pair clears a 1280 × 800 laptop as well, but the height that binds there is the LEFT card, not this one: see PREVIOUS_SHOWN.
   */
  height?: 'default' | 'tall';
}) {
  const reducedMotion = useReducedMotion();
  // Pattern ids are document-global; two marker charts on one page sharing an
  // id would make the second one's band reference the first one's pattern.
  const uid = useId().replace(/:/g, '');

  /**
   * Only points that were actually placed against a range are plotted.
   *
   * A point's status decides its mark's shape, its colour and the words for it
   * in the key and the accessible summary; a point with none has nothing to
   * give any of the three, and inventing one would be a claim about a
   * comparison nobody made. The server already refuses to send one
   * (getMarkerTrendForPatient), and the empty-data message below is the right
   * answer when that leaves nothing.
   */
  const data = input.filter((p) => asMarkerStatus(p.status) !== null);

  const singlePoint = data.length === 1;
  // Connecting a line means asserting these points belong on one trajectory.
  // Two conditions, both required: there are at least two of them, and they
  // are comparable with each other.
  const connected = data.length >= 2 && crossSourceComparable;

  /**
   * THE MOUNT, and it is short.
   *
   * The line draws itself in (Recharts animates the stroke's dash offset, which
   * is a draw rather than a fade) and the bands come up under it — in that
   * order, because the line is the subject. `animate` falls back to false once
   * it is done so that a re-render caused by a hover or a resize does not
   * replay it, and the whole thing is skipped outright under reduced motion:
   * `.trend-mount` is what carries the band fade, and it is only ever applied
   * when this is true. The keyframe in globals.css is guarded a second time.
   */
  const [animate, setAnimate] = useState(connected && !reducedMotion);
  useEffect(() => {
    if (reducedMotion || !connected) return;
    const t = setTimeout(() => setAnimate(false), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A marker whose only released result is textual ("Not detected") has no
  // plottable point at all. Rendering an axis around nothing is worse than
  // saying so plainly.
  if (data.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-espresso/80">
        This marker’s result isn’t a number, so there is nothing to plot. The result itself is shown above.
      </p>
    );
  }

  /**
   * THE TIME AXIS.
   *
   * This chart used to plot sampleDate as a category, which is Recharts'
   * default for a string key — every point evenly spaced regardless of when it
   * was actually taken. On a screening history that is not a cosmetic
   * simplification, it is a false claim about rate of change: results in
   * August 2025, November 2025 and August 2026 drew as three equal steps, so a
   * marker that moved sharply over three months and then held for nine
   * rendered as a steady drift across the whole year. The slope of the line —
   * the only thing a trend chart is for — meant nothing.
   *
   * Plotted against real time, the gaps are the gaps.
   */
  // Sorted, because everything below reads the series as a sequence in time:
  // the band periods, the step boundaries between them, and the line itself.
  // The server sends it in order today; a chart that silently draws a zigzag
  // if it ever stops is not worth the two comparisons saved.
  const rows: PlottedPoint[] = data.map((d) => ({ ...d, t: epochOf(d.sampleDate) })).sort((a, b) => a.t - b.t);
  const times = rows.map((r) => r.t);
  const tFirst = Math.min(...times);
  const tLast = Math.max(...times);
  // A single point (or several on one day) has no span to pad from; a week
  // either side gives it a plot area rather than a degenerate domain.
  const tPad = Math.max((tLast - tFirst) * 0.06, 7 * DAY_MS);
  const tMin = tFirst - tPad;
  const tMax = tLast + tPad;

  /**
   * The most recent value, as it is printed beside its own point.
   *
   * THE NUMBER ONLY, no unit. The unit is already stated once above the axis
   * (see the note there — printing it on every tick was the thing that removed),
   * and repeating it inside the plot on the one label there is would be the same
   * mistake at a smaller scale. `String(value)` rather than a formatter: this is
   * the same number the axis is scaled in and the tooltip repeats, and a
   * rounding applied here and nowhere else is a label that disagrees with the
   * point it is attached to.
   */
  const latestLabel = String(rows[rows.length - 1].value);

  const values = data.map((d) => d.value);
  const allLows = data.map((d) => d.referenceLow);
  const allHighs = data.map((d) => d.referenceHigh);

  // Axis scaling, deliberately not from zero. Anchoring at zero flattens a
  // marker whose normal range sits well above it (HbA1c 20–42) into a
  // straight line and hides every real movement; cropping tight to the data
  // does the opposite and makes ordinary variation look alarming. So the
  // domain is driven by the reference band plus the observed values, padded
  // by a share of the band's own width — the band stays visually meaningful
  // at whatever scale the marker happens to use.
  const bandSpan = Math.max(...allHighs) - Math.min(...allLows);
  const valueSpan = Math.max(...values) - Math.min(...values);
  // A single point (or a perfectly flat series) has no span of its own to
  // scale from — fall back to the band, then to the value itself, so one
  // result still renders inside a sensibly-proportioned chart instead of
  // collapsing the domain to a zero-height line.
  const referenceSpan = bandSpan || valueSpan || Math.abs(values[0] || 1);
  const domainPad = referenceSpan * 0.3;
  const rawMin = Math.min(...allLows, ...values) - domainPad;
  // Never below zero for a marker that cannot be negative. Padding used to
  // push a ferritin axis down to -96, which was a harmless empty gutter when
  // the plot area was blank and is not harmless now that the area is shaded:
  // it would draw a "significantly below range" band across a region no
  // result can ever occupy.
  const nonNegative = Math.min(...allLows, ...values) >= 0;
  const domainMin = nonNegative ? Math.max(0, rawMin) : rawMin;
  const domainMax = Math.max(...allHighs, ...values) + domainPad;

  /**
   * THE BANDS ARE DRAWN PER PERIOD, NOT PER POINT — and that distinction is
   * the whole of what was wrong here.
   *
   * A band was previously drawn for every row, running from that row's own x
   * to the next row's. Two consequences, both bad:
   *
   *  - A series on ONE reference range was drawn as N abutting copies of the
   *    same band. Harmless to look at, but it is N times the geometry for one
   *    fact, and it is what hid the second consequence.
   *  - The LAST row's band ran from its own x to tMax — which is the padding
   *    gutter, ~6% of the plot. So a marker whose range changed on the most
   *    recent result had that new range drawn as a 24px vertical sliver
   *    against a 510px plot, stacked beside the final point. Measured, on
   *    Fasting Insulin (2–25, 2–25, then 2–10): segment widths 235, 187, 24.
   *    Nothing on screen said the range had changed, so the sliver read as a
   *    rendering fault rather than as the fact it was standing for.
   *
   * Now: consecutive results sharing a reference range are ONE period, and a
   * period gets ONE band set. One range across the series therefore means one
   * segment spanning the whole plot, which is what "no step" should look like.
   *
   * WHERE THE STEP GOES. Midway between the last sample on the old range and
   * the first on the new one. We know the range changed between those two
   * draws and not when, so the midpoint is the only honest x for it — and it
   * also guarantees every period is at least half a sampling gap wide, which
   * is what makes a sliver impossible even when the change lands on the final
   * result. Anchoring the step ON the new point is what produced the gutter.
   *
   * WHETHER THE RANGE CHANGED AT ALL is `sameReferenceRange` (statusBands.ts)
   * and not a float compare, because the bounds arriving here have been through
   * a unit conversion. A fasting glucose reported as 3.9–5.5 mmol/L and then as
   * 70–99 mg/dL is ONE range written twice, and 99/18.0182 = 5.494444506110488
   * is not float-equal to 5.5 — so the chart stepped, drew the dashed rule, named
   * the change in the key, and printed a sentence claiming the laboratory had
   * changed a range it had not touched. Identity is now decided at the precision
   * the range is printed at, so a step exists exactly when the two printed ranges
   * differ. The BAND GEOMETRY still uses the exact numbers the server sent (the
   * period takes its first row's), so no band edge moves to suit a rounding.
   *
   * THE DERIVATION ITSELF IS IN packages/shared (`referenceRangePeriods` /
   * `periodStepBoundaries`), so it can be tested from explicit fixtures rather
   * than only through a browser measuring whatever the demo seed happens to
   * hold — and the demo deliberately holds no step at all now. See
   * apps/server/tests/referenceRangePeriods.test.ts.
   */
  const periods = referenceRangePeriods(rows);
  const stepBoundaries = periodStepBoundaries(periods);

  /**
   * ONE X EXTENT PER PERIOD, AND EVERYTHING IN THAT PERIOD IS DRAWN TO IT.
   *
   * The five bands, the four boundary hairlines, the step rule at each end and
   * the bound labels all read `x1`/`x2` from here. That is what makes "every band
   * steps together at the same x" structural rather than a coincidence of four
   * separate expressions agreeing — nothing in a period has an x of its own to
   * get wrong.
   *
   * The outer periods run out to the axis edges so the padding gutters aren't
   * bare: the range that applied at the first sample is the range that applied
   * just before it, and likewise at the end.
   */
  const bandSegments = periods.map((period, i) => ({
    x1: i === 0 ? tMin : stepBoundaries[i - 1],
    x2: i === periods.length - 1 ? tMax : stepBoundaries[i],
    low: period.low,
    high: period.high,
    threshold: period.threshold,
    bands: statusBands(period.low, period.high, period.rows[0].severityThreshold),
    // The boundaries that need a visible line: the reference bounds first
    // (heavier — this is the band the whole chart is about), then the two
    // points where out-of-range becomes significantly out.
    edges: [
      { y: period.low, weight: 'reference' as const },
      { y: period.high, weight: 'reference' as const },
      { y: period.low - period.threshold, weight: 'severity' as const },
      { y: period.high + period.threshold, weight: 'severity' as const },
    ],
  }));

  // Every period's own bounds. The CURRENT one (endsAt null) prints on the left
  // axis beside the scale, with a lead rule to its own hairline; the earlier
  // ones end at their step rule and print just inside it, which is the only
  // place they can go and still say which period they belong to.
  const labelColumns: LabelColumn[] = periods.map((period, i) => ({
    endsAt: i === periods.length - 1 ? null : stepBoundaries[i],
    bounds: [
      { value: period.high, text: formatReferenceBound(period.high) },
      { value: period.low, text: formatReferenceBound(period.low) },
    ],
  }));
  const boundaryLabels = labelColumns.flatMap((c) => c.bounds);

  /**
   * The scale, minus anything the inline boundary labels already say.
   *
   * A reference range is very often a round number — 135–145 for sodium is
   * exactly the sort of pair the tick ladder lands on too — and the two label
   * sets then print the same figure twice at the same height on opposite sides
   * of the plot, which reads as a second axis rather than as a range bound. The
   * boundary wins where they collide: it is the more specific fact, and it is
   * the one attached to a line.
   *
   * Never below two, so a marker whose range happens to swallow every tick
   * still has a scale on the left rather than an empty gutter.
   */
  const yTicks = (() => {
    const gap = (domainMax - domainMin) * TICK_BOUND_GAP;
    const clear = (ticks: number[]) => ticks.filter((t) => !boundaryLabels.some((b) => Math.abs(b.value - t) < gap));
    // Asking for more ticks and clearing again, rather than falling back to the
    // unfiltered set. The old fallback put the collision straight back: on a
    // marker whose bounds swallow most of a four-tick ladder, "keep them all"
    // means keeping the two that print over a bound.
    for (const target of [4, 6, 8, 10]) {
      const kept = clear(niceTicks(domainMin, domainMax, target));
      if (kept.length >= 2) return kept;
    }
    return [];
  })();
  const tickDecimals = yTicks.reduce((most, tick) => Math.max(most, decimalsOf(tick)), 0);

  /**
   * A reference range that changes partway through a series has to be SAID,
   * not just drawn.
   *
   * Two results measured against different ranges are two different questions
   * answered, and a reader comparing "in range" to "above range" across that
   * boundary is comparing the wrong things without knowing it. That is exactly
   * the sort of silent change that misleads someone reading their own trend,
   * so it gets a sentence as well as a step. Positional wording only: which
   * range applied from when, and nothing about what the change means.
   *
   * The bounds go through `formatReferenceRange` — the same rounding that decided
   * there was a step at all, so this sentence can never name two ranges that are
   * the same range, and can never print one of them as 3.884960761896305.
   */
  const rangeChangeNote =
    periods.length < 2
      ? null
      : periods
          .map((p, i) => {
            const range = formatReferenceRange(p.low, p.high, p.rows[0].unit);
            return i === 0
              ? `${range} up to ${formatDate(p.rows[p.rows.length - 1].sampleDate)}`
              : `${range} from ${formatDate(p.rows[0].sampleDate)}`;
          })
          .join(', then ');

  /**
   * HOW WIDE A TRANSITION IS ON THIS PLOT, in the marker's own units.
   *
   * A share of the DOMAIN and never of the reference range — see
   * TRANSITION_SHARE. That is what makes the blend at a bound the same handful
   * of pixels on a marker whose range is 3.9–5.1 as on one whose range is
   * 30–400, which is the only way the softness of an edge can be read as a
   * statement about the boundary rather than about the width of the band.
   */
  const transitionHalfWidth = ((domainMax - domainMin) * TRANSITION_SHARE) / 2;

  /**
   * THE BAND RECTS AND THEIR GRADIENTS, computed together because the stops are
   * placed by VALUE and the rect they are drawn on is CLAMPED to the domain.
   *
   * A band can reach past the domain — a marker whose range is 135–145 puts the
   * top of its above-range band at 160, well past a 148 axis — and the outermost
   * two are open-ended by design. `ifOverflow="hidden"` clips with a clip-path
   * rather than shortening the rect, so the rect has to be clamped for its
   * geometry to equal what is on screen; and a stop placed as a fraction OF THE
   * RECT would then land at the wrong value, which is how orange once ended up
   * in the middle of the above-range region rather than at the threshold where
   * orange means something.
   *
   * So every stop keeps its value and is converted onto the drawn rect at the
   * end.
   *
   * ONLY THE NEAREST STOP OUTSIDE THE RECT SURVIVES ON EACH SIDE, and that is
   * not tidiness. A gradient cannot be asked to extrapolate a colour, so a stop
   * past the rect has to be clamped to its edge — and where TWO of them clamp
   * to the same edge, the one that ends up painting it is whichever the sort
   * happened to leave last. Measured, on an HDL with a 1–999 range: the
   * above-range band's flat gold (at 1068) and the orange at its threshold (at
   * 3495) both clamped to the top of a plot that ends at 1250, and the ORANGE
   * won — so a chart whose visible region is entirely inside the flat gold part
   * of the band painted the transition-into-significant across the top of it.
   * Keeping the nearest one gives the colour that is actually true at the edge,
   * which in that case is the gold.
   */
  const withinRect = <T extends { value: number }>(stops: T[], y1: number, y2: number): T[] => {
    // NORMALISED, because a band that does not reach the domain at all
    // produces an INVERTED rect: a marker whose range is 0.5–1.5 puts its
    // significantly-above band at 3.0 on an axis that stops at 1.8, so the
    // clamps cross over and y1 > y2. `ifOverflow="hidden"` clips it away to
    // nothing, so what it is filled with is invisible — but "invisible" is not
    // a reason for the arithmetic to be nonsense, and an unnormalised compare
    // put every stop outside the extent and collapsed the gradient to one
    // colour repeated twice.
    const [lo, hi] = y1 <= y2 ? [y1, y2] : [y2, y1];
    const inside = stops.filter((s) => s.value >= lo && s.value <= hi);
    const below = stops.filter((s) => s.value < lo).pop();
    const above = stops.find((s) => s.value > hi);
    const kept = [...(below ? [below] : []), ...inside, ...(above ? [above] : [])];
    // A rect that contains no stop at all still needs two to be a gradient.
    return kept.length >= 2 ? kept : [...kept, ...kept].slice(0, 2);
  };
  const bandRects = bandSegments.flatMap((seg, i) =>
    seg.bands.map((band) => {
      const y1 = Math.max(band.from ?? domainMin, domainMin);
      const y2 = Math.min(band.to ?? domainMax, domainMax);
      const drawnSpan = y2 - y1 || 1;
      const stops = withinRect(
        bandRampStops(band.status, {
          low: seg.low,
          high: seg.high,
          threshold: seg.threshold,
          halfWidth: transitionHalfWidth,
        }),
        y1,
        y2,
      )
        .map((stop) => ({
          // SVG's y grows downward and a value grows upward, so a band's
          // HIGH-value end is the gradient's offset 0.
          offset: Math.max(0, Math.min(1, 1 - (stop.value - y1) / drawnSpan)),
          colour: stop.colour,
        }))
        .sort((a, b) => a.offset - b.offset);
      return {
        key: `band-${i}-${band.status}`,
        gradientId: `band-${uid}-${i}-${band.status}`,
        x1: seg.x1,
        x2: seg.x2,
        y1,
        y2,
        stops,
      };
    }),
  );

  // The optimal range as a narrowing of each period's own reference range — see
  // OptimalRegions. A one-sided band ("below 5.0 mmol/L") takes the reference
  // bound as its open end, which is what makes it a narrowing rather than a
  // region running off into territory no result can occupy.
  const optimalRegions: OptimalRegion[] = optimal
    ? bandSegments.flatMap((seg) => {
        const from = Math.max(seg.low, optimal.low ?? seg.low, domainMin);
        const to = Math.min(seg.high, optimal.high ?? seg.high, domainMax);
        if (!(to > from)) return [];
        return [
          {
            x1: seg.x1,
            x2: seg.x2,
            from,
            to,
            edges: [...(from > seg.low ? [from] : []), ...(to < seg.high ? [to] : [])],
          },
        ];
      })
    : [];

  const summary = data
    .map((d) => `${formatDate(d.sampleDate)}: ${d.value}, ${statusLabel(d.status).toLowerCase()}`)
    .join('; ');

  return (
    <div>
      {/* NOTHING ABOVE THE CHART in the ordinary case, and that is the change.
          A paragraph saying "these 4 results are directly comparable, so they
          are joined into one trend line" sat over every healthy series,
          explaining the absence of a problem — which is a sentence about the
          chart's implementation rather than about the patient's results, and
          it pushed the plot area down by two lines on a phone.

          The comparability logic is untouched and still gates whether a line
          is drawn at all (see `connected`). What changed is where the two
          cases that are actually worth saying get said: the first-result case
          is stated once, quietly, because a lone point with no line genuinely
          needs explaining; and the not-comparable case has moved into the key
          below, beside the marks it is about, where the rest of this chart's
          vocabulary already lives. */}
      {singlePoint && (
        <p className="mb-3 text-xs leading-relaxed text-espresso/80">
          This is your first result for this marker, so it is shown as a single point with no trend line.
        </p>
      )}

      {/* THE UNIT, ONCE, ON THE AXIS — not repeated on every tick.
          A y-axis reading "4 mmol/L, 6 mmol/L, 8 mmol/L" states the unit three
          times to say it once, and the repetition is the widest thing in the
          gutter. Mono, because it is part of the numeric data rather than
          prose. Absent where the marker has no unit, which is nine of them
          deliberately (CLAUDE.md). */}
      {rows[0]?.unit && (
        <p className="numeric mb-1 pl-1 text-xs text-espresso/80">{rows[0].unit}</p>
      )}

      {/* REAL PADDING ON ALL FOUR SIDES. The plot used to run to the card's own
          edges on three of them, which is most of what made it read as a
          picture pasted into a box rather than as a drawing on the card. The
          wrapper gives it room outside the SVG and the margins below give it
          room inside — the frame needs both, since a frame drawn hard against
          a card edge is a crop mark. */}
      <div
        className={`tabular w-full px-1 pb-1 sm:px-2 ${animate ? 'trend-mount ' : ''}${
          height === 'tall' ? 'h-64 sm:h-80 lg:h-[22rem]' : 'h-72 sm:h-80'
        }`}
        role="img"
        aria-label={
          `Trend chart for ${data.length} result${data.length === 1 ? '' : 's'}. ` +
          `Shaded bands mark the reference range and how far outside it a value sits. ${summary}`
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          {/* Room on every side. `right` used to be 46 to hold the bound labels
              in the margin; they are on the left axis now, so it is the same
              breathing space as the top instead of a gutter with numbers in
              it. `left` is 6 rather than 0 so the lead rules beside the bound
              labels are not clipped by the SVG's own edge. */}
          <ComposedChart data={rows} margin={{ top: 18, right: 18, left: 6, bottom: 10 }}>
            <defs>
              {/* ONE GRADIENT PER DRAWN BAND. Not one per status: the stops are
                  placed by VALUE and converted onto each rect's own clamped
                  extent, so two periods with different ranges cannot share a
                  definition — see `bandRects`.

                  EVERY STOP IS OPAQUE, and `stopOpacity` is stated at 1 rather
                  than left to default so that "a band never blends with what is
                  behind it" is written where somebody editing this would see
                  it. A gradient is still the right shape for the boundary
                  blend — the ramp is between two SOLID colours, green into
                  olive into gold, and the ladder is in those colours (see
                  BAND_CONTRAST) rather than in an alpha. Both bands either side
                  of a boundary name the same stop in the same colour, so the
                  fill is continuous across a boundary drawn as two shapes.

                  NO AREA GRADIENT. The fill under the line was a sixth region
                  of colour over five that were already competing, and the line
                  is the content. */}
              {bandRects.map((rect) => (
                <linearGradient key={rect.gradientId} id={rect.gradientId} x1="0" y1="0" x2="0" y2="1">
                  {rect.stops.map((stop, i) => (
                    <stop key={i} offset={stop.offset} stopColor={stop.colour} stopOpacity={1} />
                  ))}
                </linearGradient>
              ))}
            </defs>

            <XAxis
              dataKey="t"
              // Real time, not a category per sample — see the note above the
              // domain. Ticks are the sample dates themselves, so every tick
              // marks a real event rather than a round number the patient
              // never had a test on.
              type="number"
              scale="time"
              domain={[tMin, tMax]}
              ticks={times}
              // ISO never reaches an axis. The compact "Aug 26" form is purely
              // for width — the tooltip gives the full "5 August 2026".
              tickFormatter={(t: number) => formatAxisDate(new Date(t).toISOString().slice(0, 10))}
              // Axis labels are numeric data, so they are set in the mono
              // face like every other number in the product — the family comes
              // from the token, never a font name. The tabular figures come
              // from the `tabular` class on the wrapper below, which SVG text
              // inherits; Recharts' tick prop type doesn't carry
              // fontVariantNumeric, and an inline style on every tick would be
              // forty declarations to say one thing.
              tick={{ fontSize: 11, fill: chartTokens.axisText, fontFamily: 'var(--font-mono)' }}
              // ONE GROUND LINE AND NOTHING ELSE — no box, no vertical rules,
              // no gridlines. The bands already give the plot its structure;
              // a frame around them is a second structure competing with the
              // first, and a grid over them is a third.
              axisLine={{ stroke: chartTokens.axisLine, strokeOpacity: 0.5 }}
              tickLine={false}
              tickMargin={10}
              minTickGap={16}
              // At 375px a 5-point series would otherwise overlap its own
              // labels; Recharts drops ticks rather than letting them collide.
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[domainMin, domainMax]}
              // Round values only, and four of them — see niceTicks. The domain
              // is unchanged by this: an axis label does not get to move a band.
              ticks={yTicks.length > 0 ? yTicks : undefined}
              interval={0}
              tickFormatter={(v: number) => v.toFixed(tickDecimals)}
              tick={{ fontSize: 11, fill: chartTokens.axisText, fontFamily: 'var(--font-mono)' }}
              axisLine={false}
              tickLine={false}
              width={46}
            />

            {/* THE PLOT ITSELF, before anything is drawn in it: an inset panel
                with one hairline frame. Not a ReferenceArea — see PlotPanel. */}
            <PlotPanel />

            {/* The five status bands, behind everything else. A single point
                still gets a full-width band: its one segment runs from the
                axis minimum to the axis maximum, so the patient sees where
                their one result sits relative to its range.

                OPAQUE, AND THE LADDER IS IN THE COLOURS. The rects are
                clamped to the domain: `ifOverflow="hidden"` clips with a
                clip-path rather than shortening the rect, so an unclamped band
                is a rect the browser has cut a hole in, and clamping is what
                makes the geometry equal what is on screen. */}
            {bandRects.map((rect) => (
              <ReferenceArea
                key={rect.key}
                x1={rect.x1}
                x2={rect.x2}
                y1={rect.y1}
                y2={rect.y2}
                fill={`url(#${rect.gradientId})`}
                // Pinned at 1, and now for the plainest possible reason: a band
                // is opaque. Recharts' ReferenceArea defaults fillOpacity to
                // 0.5, so leaving it off would draw every band at half strength
                // over the plot — which it once did to every band on this chart,
                // and which is exactly the translucency this redesign removed.
                fillOpacity={1}
                strokeOpacity={0}
                ifOverflow="hidden"
                zIndex={100}
              />
            ))}

            <OptimalRegions regions={optimalRegions} />

            {/* Every band boundary, drawn — and drawn as a HAIRLINE now that
                the bands themselves are a wash. These used to be near-solid
                rules over saturated slabs, which made the edge of the reference
                range the strongest mark in the plot; the reader's own result
                should be. Still per segment rather than a ReferenceLine across
                the whole plot, so a boundary steps with the period it belongs
                to, and still the thing that keeps the bands legible with the
                colour taken away. */}
            {bandSegments.flatMap((seg, i) =>
              seg.edges.map((e, j) => (
                <ReferenceLine
                  key={`edge-${i}-${j}`}
                  segment={[
                    { x: seg.x1, y: e.y },
                    { x: seg.x2, y: e.y },
                  ]}
                  stroke={chartTokens.referenceEdge}
                  strokeOpacity={
                    e.weight === 'reference' ? chartTokens.referenceEdgeOpacity : chartTokens.severityEdgeOpacity
                  }
                  strokeWidth={1}
                  ifOverflow="hidden"
                  zIndex={200}
                />
              )),
            )}

            {/* The optimal range's own edges are drawn by OptimalRegions, per
                period and inside its own extent, rather than as two dashed
                ReferenceLines across the whole plot. A dashed rule spanning the
                plot is the mark this chart uses for "the reference range
                changed here", and two marks that differ only in their dash
                pattern while meaning completely different things is exactly the
                confusion the cursor was made solid to avoid. */}

            {/* The step itself, drawn. The bands already change height here,
                but a horizontal edge that jumps is easy to read as noise; a
                vertical rule at the same x says the jump is the point. Paired
                with the sentence under the chart and its own entry in the key,
                so the change is stated three ways and carried by none of them
                alone.

                ONE rule per change, at exactly the x the bands either side of it
                step at (both come from `stepBoundaries`), the full height of the
                plot, and every value describing it is a token — see
                chart.stepDashArray. The same three literals used to be written
                out here and again in the key's swatch, which is two places for
                one appearance to drift apart in. */}
            {stepBoundaries.map((x) => (
              <ReferenceLine
                key={`step-${x}`}
                x={x}
                stroke={chartTokens.referenceEdge}
                strokeDasharray={chartTokens.stepDashArray.join(' ')}
                strokeWidth={chartTokens.stepWidth}
                strokeOpacity={chartTokens.stepOpacity}
                zIndex={210}
              />
            ))}

            <BoundaryLabels columns={labelColumns} />

            <Tooltip
              content={<ChartTooltip optimal={optimal} />}
              // A guide, not the browser's default crosshair: one vertical
              // hairline at the point being read, in the chart's own neutral,
              // at a weight that does not compete with the line.
              //
              // SOLID, and the reason is the dashed rule below it. A chart
              // whose reference range changed already carries a dashed vertical
              // at the change point, and a dashed cursor differing from it only
              // in its dash pattern is two marks that look the same and mean
              // completely different things — one of them "the laboratory
              // changed your reference range here".
              cursor={{ stroke: chartTokens.cursor, strokeWidth: 1, strokeOpacity: 0.55 }}
            />
            <Line
              // STRAIGHT SEGMENTS, NEVER A CURVE. `monotone` draws a smooth
              // spline between the points, which is a claim about values
              // between two blood draws that nobody measured — on a series
              // three months apart it invents a shape for the whole quarter.
              // `linear` says only what is known: these results, joined.
              //
              // `connected` gates the whole line, not just its type — a single
              // point and an incomparable series both render as marks only.
              type="linear"
              dataKey="value"
              // ONE DEFINITE COLOUR, and it is bronze: the product's accent,
              // which says "this is your series" rather than borrowing a status
              // hue and implying a verdict on the trend.
              stroke={connected ? chartTokens.line : 'none'}
              // Round caps and joins: a line with mitred corners reads as a
              // plotted path, and a drawn stroke is what the rest of the
              // product's marks are. The WEIGHT is a token because it is half
              // of one decision with BAND_CONTRAST — the bands were raised and
              // the line was raised with them, rather than the bands being
              // dulled back down to leave room for it.
              strokeWidth={chartTokens.lineWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={<CustomDot latestT={tLast} latestLabel={latestLabel} />}
              activeDot={false}
              isAnimationActive={animate}
              animationDuration={620}
              animationEasing="ease-out"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {rangeChangeNote && (
        <p className="mt-3 text-xs leading-relaxed text-espresso/85">
          The lab’s reference range changed during this period: <span className="numeric">{rangeChangeNote}</span>. Each
          result is shown against the range that applied to it, and the dashed rule marks where the range changed.
        </p>
      )}

      <ChartKey
        statuses={[...new Set(data.map((d) => d.status))]}
        unjoined={!connected && !singlePoint}
        stepped={stepBoundaries.length > 0}
      />
    </div>
  );
}

/**
 * What the marks mean, in words.
 *
 * Not optional and not decoration. The chart carries status by shape and
 * reinforces it with colour; a shape with no key is a rebus, and a coloured
 * region with no name is the exact "colour alone" failure the rest of this
 * system spends its effort avoiding. Someone who cannot distinguish the green
 * band from the red one reads this list instead and loses nothing.
 *
 * Every phrase here is positional — "above the reference range", not "high
 * risk", not "unhealthy". The chart says where the lab's range sits; it does
 * not offer an opinion on being outside it.
 *
 * EVERY SWATCH IS THE MARK IT STANDS FOR, AT THE SIZE IT IS DRAWN — never a
 * coloured rectangle. The band entries that used to be here are gone entirely:
 * the reference bounds are printed on the axis now, in figures, level with
 * their own hairlines, which is a better answer than a swatch and one a
 * greyscale reader gets in full. See the note on `regions` below.
 */
function ChartKey({
  statuses,
  unjoined,
  stepped,
}: {
  statuses: MarkerStatusInput[];
  /**
   * The points are NOT joined because their sources aren't comparable for this
   * marker. That used to be a paragraph above the chart; it belongs here,
   * beside the marks it describes, because it is a statement about what the
   * marks mean — the same kind of statement as every other entry in this key.
   * False for a first result, which has its own line above the chart: one
   * point has nothing to be unjoined from.
   */
  unjoined: boolean;
  /** The reference range changed partway through, so the dashed rule needs naming. */
  stepped: boolean;
}) {
  /**
   * TWO COLUMNS, ONE LIST.
   *
   * The key was two stacked rows of wrapping flex items — fine at three
   * entries, and the band vocabulary is five. On the marker page's 60%-width
   * card each entry took a line of its own, so the key ran to eight lines
   * under a chart it is subordinate to.
   *
   * A grid pairs them instead: same entries, same wording, half the height,
   * and the columns line up rather than ragging the way wrapped flex items do.
   * Nothing is dropped and nothing is abbreviated — an entry that is not worth
   * the room is an entry that should not have been drawn on the chart.
   */
  const marks = statuses.map((s) => (
    <li key={`mark-${s}`} className="flex items-center gap-2">
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
        <StatusMark cx={7} cy={7} status={s} size={0.85} ring={2} surface="card" />
      </svg>
      <span className="min-w-0">{statusLabel(s)}</span>
    </li>
  ));

  /**
   * NO BAND ENTRIES, AND THAT IS THE CHANGE (Aug 2026).
   *
   * There were five, one per region, each a coloured swatch beside a sentence
   * — and a swatch is exactly what this key is not allowed to be made of, since
   * the point of it is that the chart survives having its colour removed. They
   * earned their place while the bands were the only thing saying where the
   * range sat. They do not now: every reference bound is PRINTED ON THE AXIS,
   * level with its own hairline, in figures. "3.5" beside the line at 3.5 is a
   * better answer to "where does my range start" than "Within the reference
   * range" beside a green rectangle, and it is one a greyscale reader gets in
   * full.
   *
   * AND NO OPTIMAL ENTRY EITHER (Aug 2026). "Optimal range (hatched)" beside a
   * hatched swatch was the second half of the two-competing-systems problem:
   * the hatch existed so the optimal band could be told apart from the
   * reference band, and the key existed to explain the hatch. With the optimal
   * range drawn as a NARROWING of the green rather than as a second region,
   * there is no second texture to name. It is named where it is read instead —
   * in the tooltip on the point, and in the line above the chart that already
   * says "Optimal 50–125 nmol/L · outside optimal".
   *
   * What remains is what neither the axis nor the copy can say: the point
   * states, in words and in the marks the chart actually draws; and the step,
   * which is a mark rather than a value.
   */
  const regions = [
    ...(stepped
      ? [
          <li key="stepped" className="flex items-center gap-2">
            {/* The rule itself, from the same tokens the plot draws it with, so
                the swatch cannot describe a mark the chart no longer makes. */}
            <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true" className="shrink-0">
              <line
                x1="9"
                y1="0"
                x2="9"
                y2="12"
                stroke={chartTokens.referenceEdge}
                strokeWidth={chartTokens.stepWidth}
                strokeDasharray={chartTokens.stepDashArray.join(' ')}
                strokeOpacity={chartTokens.stepOpacity}
              />
            </svg>
            <span className="min-w-0">Where the reference range changed</span>
          </li>,
        ]
      : []),
  ];

  return (
    <div className="mt-4 border-t border-taupe pt-3 text-xs text-espresso/80">
      <ul className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        {marks}
        {regions}
      </ul>
      {/* Full width rather than in a column: it is a sentence, not a label, and
          a sentence in a half-width column wraps to four lines and undoes the
          saving the grid just made. */}
      {unjoined && (
        <p className="mt-2 flex items-start gap-2">
          <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true" className="mt-0.5 shrink-0">
            <circle cx="3" cy="6" r="2" fill={chartTokens.point} />
            <circle cx="9" cy="6" r="2" fill={chartTokens.point} />
            <circle cx="15" cy="6" r="2" fill={chartTokens.point} />
          </svg>
          <span>Separate points, not joined: these came from sources that aren’t comparable for this marker</span>
        </p>
      )}
    </div>
  );
}
