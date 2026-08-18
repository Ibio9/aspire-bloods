import type { ReactNode } from 'react';
import { Line, usePlotArea, useXAxisScale, useYAxisScale } from 'recharts';
import { asMarkerStatus, chart as chartTokens, hueTint, SPARK, type MarkerStatusInput } from '@aspire-bloods/shared';
import { labelWidth, markFill, type LabelColumn, type LabelFace, type StatusLinePoint } from '../../lib/chartGeometry';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE PARTS BOTH TREND CHARTS ARE MADE OF (Aug 2026).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * There are two trend charts in the product and they are one instrument drawn
 * twice: TrendChart (one marker, real units) and MultiTrendChart (two or three
 * markers on one normalised axis, the Compare view). Everything a reader has to
 * learn how to read is in this file, so the two cannot teach two vocabularies:
 *
 *   THE LINE, carrying status along its own length through every region it
 *     passes, straight segments only, with a casing of light in whatever colour
 *     it is at that stretch.
 *   THE POINTS, every one of them the same white spark, most recent slightly
 *     larger and brighter, at every status without exception.
 *   THE BOUNDARY RULES, reference bounds solid and full weight, significantly
 *     out dashed and lighter, each labelled in the left gutter with a lead rule
 *     matching its own dash.
 *   THE SWATCHES, every one of them drawn from the plot's own tokens so a key
 *     cannot name a mark the chart did not make.
 *
 * ── WHY IT IS A FILE AND NOT A CONVENTION ─────────────────────────────────
 *
 * Compare was the last thing in the product still drawing the old banded
 * background: a green-to-red field behind the lines, so the loudest thing on
 * the plot was the context rather than the reader's own results. The
 * single-marker chart had already removed exactly that, for reasons written up
 * at length in TrendChart, and the two then sat one press apart drawing the
 * same idea in two incompatible ways. Restating the rules in a second file
 * would have set the next divergence going on the day it was written.
 *
 * ⚠ THE BANDS ARE NOT COMING BACK TO EITHER CHART. `bandRampStops`,
 * `BAND_CONTRAST` and `--c-hue-*-fill` all still exist and all still serve the
 * RANGE BARS and the arc gauge, which have no line to carry colour along. A
 * chart has one.
 */

// ---------------------------------------------------------------------------
// THE POINTS
//
// The arithmetic behind all of this - the epoch, the status colour, the gutter
// widths and the shape of a point - is in lib/chartGeometry.ts, which imports
// nothing that draws. What is in THIS file is the drawing.
// ---------------------------------------------------------------------------

/**
 * ONE RADIAL FALLOFF PER CHART, AND EVERY POINT SHARES IT.
 *
 * It used to be one gradient PER STATUS, because the halo was that point's own
 * status colour. Every point is the same white spark now, so there is one
 * definition - and one is the honest number: five gradients saying the same
 * thing was five chances for a point to spark in a colour the line was not. On
 * Compare that argument is stronger again, since three series share it.
 *
 * A gradient in the default `objectBoundingBox` units is measured against the
 * box of whatever it is painted on, so this one definition serves every point at
 * whatever radius each is drawn at: the latest point's halo is the same shape as
 * the rest, larger.
 *
 * The STRENGTH is not in here. The stops carry the RAMP as a share of the core
 * (SPARK.ramp) and the core alpha arrives per point as a fill-opacity, which
 * multiplies - which is what lets one definition serve both the most recent
 * point and the quieter ones behind it, and what puts the per-theme number in
 * exactly one place.
 */
export function SparkGradient({ id }: { id: string }) {
  return (
    <radialGradient id={id}>
      {SPARK.ramp.map(([offset, share]) => (
        <stop key={offset} offset={offset} stopColor={chartTokens.sparkHalo} stopOpacity={share} />
      ))}
    </radialGradient>
  );
}

/**
 * A POINT IS A WHITE SPARK. EVERY POINT, AT EVERY STATUS, ON BOTH CHARTS.
 *
 * A tight white core inside a wide soft falloff - lit from within rather than
 * filled and stroked, which is the difference between light and a dot with a
 * ring round it. The core is `SPARK.glyph.r` and the halo reaches 4.5x that, so
 * roughly a fifth of the spark's diameter is the bead and the rest is falloff.
 *
 * NOTHING VARIES BY STATUS. Not the colour, not the size, not the treatment.
 * The status is carried by the LINE, which changes colour along its own length
 * and passes through this point, and by the point's position against the
 * labelled boundary rules. Drawing it a third time in the point's own fill was
 * the same fact three times, and it cost the point the one thing it is uniquely
 * placed to say, which is exactly where it is.
 *
 * ⚠ AND ON COMPARE IT REPLACED THE SERIES SHAPES (Aug 2026). That chart drew a
 * circle, a square or a diamond at every point, in the series' identity colour,
 * which is a THIRD mark vocabulary on a plot that already had two. The shape
 * survives as the legend token beside each marker's name (see SeriesMark); what
 * tells two LINES apart on the plot is the dash they are drawn with.
 *
 * ── THE ONE PERMITTED VARIATION ───────────────────────────────────────────
 *
 * The most recent point is slightly larger and sparks brighter. Every point was
 * once drawn identically, which makes a series read as a set of equally
 * interesting facts; it isn't, the history is context for the latest result.
 * That is a difference in DEGREE - the same mark, more of it - where the old
 * shape vocabulary was a difference in KIND.
 *
 * ── THE HALO IS BEHIND THE CORE AND SCALED TO IT ──────────────────────────
 *
 * So the ramp's plateau ends exactly where the core's edge is and everything
 * that leaks out around it is already on the falloff. In dark that is white
 * light on a near-black card; in light the halo is a warm dark and the same
 * white core reads as the brightest thing inside a soft shadow. See SPARK.
 */
export function SparkPoint({
  cx,
  cy,
  latest,
  gradientId,
}: {
  cx: number;
  cy: number;
  latest: boolean;
  gradientId?: string;
}) {
  const r = latest ? SPARK.glyph.rLatest : SPARK.glyph.r;
  return (
    <>
      {gradientId && (
        <circle
          cx={cx}
          cy={cy}
          r={r * SPARK.radius}
          fill={`url(#${gradientId})`}
          /**
           * AN OPACITY, SO A BARE `var()` IS RIGHT HERE.
           *
           * The rule against bare `var(--x)` is about COLOUR: the colour
           * properties hold bare channels, so a bare var() resolves to "205 218
           * 193" and the browser drops the declaration. `--chart-spark` holds a
           * NUMBER, which is exactly what fill-opacity takes, and it is a custom
           * property rather than a literal so the strength follows the theme and
           * goes to zero under `@media print` with the shadows. Set through
           * `style` rather than the attribute because a presentation attribute
           * cannot hold a var().
           */
          style={{ fillOpacity: latest ? 'var(--chart-spark)' : 'var(--chart-spark-past)' }}
        />
      )}
      {/* The bead. White on screen in both themes; espresso in print, where the
          halo is zero and a white dot on white paper is no dot at all. */}
      <circle cx={cx} cy={cy} r={r} fill={chartTokens.sparkCore} />
    </>
  );
}

/**
 * The dot renderer both charts hand to Recharts.
 *
 * `payload` is the row Recharts is drawing, which carries `t` on both charts -
 * so "is this the most recent one" is answered by the same comparison in both
 * places rather than by two rules that happen to agree. On Compare `latestT` is
 * that SERIES' own last sample, not the chart's, because three markers rarely
 * end on the same day and the brightest point on each line should be that
 * line's own latest result.
 */
export function SparkDot(props: {
  cx?: number;
  cy?: number;
  payload?: { t?: number };
  latestT?: number | null;
  /** The chart's own spark gradient; absent means no glow, never a wrong-coloured one. */
  sparkId?: string;
}) {
  const { cx, cy, payload, latestT, sparkId } = props;
  if (cx == null || cy == null || !payload) return null;
  return (
    <g>
      {/* Invisible circle widens the touch/click target well past the visible marker - the
          visible mark stays small and precise, the tappable area doesn't. */}
      <circle cx={cx} cy={cy} r={16} fill="transparent" />
      <SparkPoint cx={cx} cy={cy} latest={payload.t != null && payload.t === latestT} gradientId={sparkId} />
    </g>
  );
}

/**
 * A SWATCH THAT CONTAINS A SPARK, WITH ITS OWN COPY OF THE FALLOFF.
 *
 * ⚠ THE KEY IS OUTSIDE THE CHART'S SVG, so it cannot reference the plot's
 * gradient - an `url(#…)` pointing into another SVG resolves to nothing, and a
 * radial gradient that fails to resolve paints the shape BLACK or not at all.
 * What that looked like in light mode was a swatch nobody could see: a white
 * bead, unhaloed, on a near-white card at 1.05:1. The chart itself was correct
 * and the key entry describing it was blank.
 *
 * So each swatch carries its own `<defs>`. 20x20 rather than the 18x12 the line
 * swatches use, because a spark is round and its halo reaches 4.5x the bead -
 * the tail past 10px is under a tenth of the core's alpha and is clipped, which
 * is the same thing the eye does with it on the plot.
 */
export function SparkSwatch({ id, children }: { id: string; children: ReactNode }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
      <defs>
        <SparkGradient id={id} />
      </defs>
      {children}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// THE SWATCHES
// ---------------------------------------------------------------------------

/**
 * A STRETCH OF LINE IN ONE STATE'S COLOUR - the swatch in the key and in the
 * tooltip.
 *
 * The line is the only thing on either chart that carries status now, so it is
 * the only honest thing to put beside a status word. Drawn at the line's own
 * weight and in the line's own colour for that state, so the swatch and the
 * chart cannot disagree: both read `markFill`.
 */
export function StatusLineSwatch({ status }: { status: MarkerStatusInput }) {
  const known = asMarkerStatus(status);
  if (!known) return null;
  return (
    <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true" className="shrink-0">
      <line
        x1="0"
        y1="6"
        x2="18"
        y2="6"
        stroke={markFill(known)}
        strokeWidth={chartTokens.lineWidth}
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * One of the two boundary rules, at the weight the plot draws it.
 *
 * A mark with no name in the key is a rebus, and these two differ from each
 * other in dash and in weight rather than in colour - so the difference has to
 * be NAMED, beside a swatch drawn from the plot's own tokens.
 */
export function RuleSwatch({ kind }: { kind: 'bound' | 'threshold' }) {
  return (
    <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true" className="shrink-0">
      <line
        x1="0"
        y1="6"
        x2="18"
        y2="6"
        stroke={chartTokens.bound}
        strokeWidth={chartTokens.boundWidth}
        strokeDasharray={kind === 'threshold' ? chartTokens.thresholdDashArray.join(' ') : undefined}
        strokeOpacity={kind === 'threshold' ? chartTokens.thresholdOpacity : chartTokens.boundOpacity}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// THE LINE
// ---------------------------------------------------------------------------

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE LINE CARRIES THE STATUS ALONG ITS OWN LENGTH.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The line used to be one flat bronze and the BANDS carried the traffic light.
 * That put the loudest thing on the plot behind the data - in dark, measurably
 * so: the out-of-range band stood 4.74:1 off the plot panel while the line
 * cleared it at 3.05, so the context was louder than the content in the theme
 * most people read in.
 *
 * So it is inverted. Each point's own status colour is a stop on ONE gradient
 * laid across the plot in user space, positioned at that point's own x. Between
 * two points the browser interpolates, which is exactly the claim the chart is
 * entitled to make: the colour changes gradually between two draws because the
 * VALUE changed gradually between them, and a segment that crosses a reference
 * bound blends across it rather than stepping at it. A hard colour step would
 * assert that the crossing happened at a particular moment, and nobody measured
 * that moment.
 *
 * USER SPACE, NOT `objectBoundingBox`. A gradient in bounding-box units is
 * relative to the PATH's own box, so it would rescale whenever the series' x
 * extent changed and the stops would no longer be at the points. In user space
 * the offsets are the plot's own pixels and a stop lands exactly on its point.
 *
 * ⚠ WHICH IS ALSO WHY COMPARE NEEDS ONE OF THESE PER SERIES AND NOT ONE PER
 * CHART. The offsets are the plot's pixels, so two series with different sample
 * dates put their stops at different x - and a gradient shared between them
 * would paint each line with the other's history. Three markers, three
 * gradients, three casings, each built from that marker's own points against
 * that marker's own reference range.
 *
 * THE COLOURS ARE THE POINT MARKS' OWN (`markFill`), so the line arrives at each
 * mark in precisely that mark's colour rather than in a near-miss of it.
 *
 * A SINGLE-POINT series has nothing to interpolate; the gradient still resolves
 * (two identical stops) and no line is drawn anyway.
 */
export function StatusLineGradient({
  id,
  points,
  glow = false,
}: {
  id: string;
  points: StatusLinePoint[];
  /**
   * THE SAME GRADIENT AT THE CASING'S ALPHA.
   *
   * The line's glow is three wider strokes of the line's own path, so the light
   * around it is the colour the line is at that stretch - by construction
   * rather than by two derivations agreeing. Painting them with a SECOND
   * gradient rather than putting an opacity on the stroke is what keeps the
   * per-theme number in a custom property: `stroke-opacity` would have to come
   * through Recharts' own props, and Recharts does not forward a style prop to
   * the path it draws.
   */
  glow?: boolean;
}) {
  const plot = usePlotArea();
  const xScale = useXAxisScale();
  if (!plot || !xScale) return null;

  const at = (p: StatusLinePoint): number | null => {
    const x = xScale(p.t);
    return x == null || !Number.isFinite(x) ? null : (x as number);
  };

  const stops: { x: number; colour: string }[] = [];
  for (const [i, p] of points.entries()) {
    const known = asMarkerStatus(p.status);
    const x = at(p);
    if (known && x !== null) stops.push({ x, colour: markFill(known) });

    /**
     * ── AND THE LINE TRAVELS THROUGH EVERY REGION IT ACTUALLY PASSES ───────
     *
     * Endpoint stops alone are correct and ugly, and the ugliness is a real
     * failure rather than a taste: a segment from an in-range result to a
     * significantly-high one interpolates GREEN straight to RED in sRGB, which
     * passes through a muddy olive-brown at its midpoint - a colour that is in
     * neither state and belongs to no part of the vocabulary.
     *
     * The value between two draws does not jump from in-range to significantly
     * high; it passes THROUGH above-range on the way. So the line does too.
     *
     * ── AND "THROUGH" MEANS THE REGIONS, NOT ONLY THE BOUNDARIES ───────────
     *
     * The first version of this added a stop at each boundary CROSSING, in that
     * boundary's own hinge colour. That is right for a segment that stops in
     * the next region along and wrong for one that crosses a region entirely,
     * which is the case a reader is most likely to be looking at.
     *
     * MEASURED, on the demo patient's AFP (range 125-375): 429 down to 65, a
     * segment that passes through the WHOLE of the reference range. The
     * crossings gave gold → olive(375) → olive(125) → gold, so a line spending
     * most of its length inside the range never once read green - on the one
     * marker page where a patient is looking at exactly that.
     *
     * So each segment is walked as a sequence of WAYPOINTS: the two endpoints
     * and every boundary between them, in order. Each boundary gets its hinge
     * colour AT the crossing, and each stretch BETWEEN two waypoints gets the
     * colour of whatever region it is in, at its own midpoint. AFP now reads
     * gold → olive → green → olive → gold, which is the journey the value took.
     *
     * The segment takes the FIRST point's geometry, which is the same rule the
     * periods follow: where a reference range changed between two draws we know
     * it changed between them and not when, so the earlier one is what the
     * segment is read against.
     */
    const next = points[i + 1];
    if (!next) continue;
    const x2 = at(next);
    const v1 = p.value;
    const v2 = next.value;
    if (x === null || x2 === null || !Number.isFinite(v1) || !Number.isFinite(v2) || v1 === v2) continue;
    const threshold = p.threshold;

    /** Which of the three hues a value sits in, on THIS segment's geometry. */
    const hueAt = (value: number): string => {
      if (value < p.low - threshold || value > p.high + threshold) return hueTint.red.mark;
      if (value < p.low || value > p.high) return hueTint.yellow.mark;
      return hueTint.green.mark;
    };

    const boundaries: [number, string][] = [
      [p.low - threshold, hueTint.orange.mark],
      [p.low, hueTint.olive.mark],
      [p.high, hueTint.olive.mark],
      [p.high + threshold, hueTint.orange.mark],
    ];
    // Every boundary strictly between the two values, as a fraction along the
    // segment. Strict, so a point sitting exactly ON a bound does not get a
    // second stop at its own x fighting its own colour.
    const crossed = boundaries
      .filter(([bound]) => Number.isFinite(bound) && (v1 - bound) * (v2 - bound) < 0)
      .map(([bound, colour]) => ({ ratio: (bound - v1) / (v2 - v1), value: bound, colour }))
      .sort((a, b) => a.ratio - b.ratio);

    // The waypoints, in order along the segment: start, each crossing, end.
    const waypoints = [
      { ratio: 0, value: v1 },
      ...crossed.map((c) => ({ ratio: c.ratio, value: c.value })),
      { ratio: 1, value: v2 },
    ];
    for (const c of crossed) stops.push({ x: x + (x2 - x) * c.ratio, colour: c.colour });
    for (const [w, from] of waypoints.entries()) {
      const to = waypoints[w + 1];
      if (!to) continue;
      // The stretch between two waypoints is entirely inside one region, so its
      // midpoint names it. Skipped for the two OUTER stretches, whose colour is
      // already the endpoint's own status - restating it would be a second stop
      // in the same colour at very nearly the same x.
      if (w === 0 || w === waypoints.length - 2) continue;
      const midRatio = (from.ratio + to.ratio) / 2;
      stops.push({ x: x + (x2 - x) * midRatio, colour: hueAt((from.value + to.value) / 2) });
    }
  }

  stops.sort((a, b) => a.x - b.x);
  if (stops.length === 0) return null;

  // The casing's alpha, per theme and zero in print - see SPARK in tokens.ts.
  // An opacity rather than a colour, so a bare var() is what it wants; through
  // `style` because a presentation attribute cannot hold one.
  const alpha = glow ? { style: { stopOpacity: 'var(--chart-line-glow)' } } : {};

  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={plot.x} y1={0} x2={plot.x + plot.width} y2={0}>
      {/* Before the first point and after the last the line does not exist, so
          the end stops simply hold the first and last colours - anything else
          would be inventing a colour for a stretch of plot with no line on it. */}
      <stop offset={0} stopColor={stops[0].colour} {...alpha} />
      {stops.map((s, i) => (
        <stop
          key={i}
          offset={Math.max(0, Math.min(1, (s.x - plot.x) / (plot.width || 1)))}
          stopColor={s.colour}
          {...alpha}
        />
      ))}
      <stop offset={1} stopColor={stops[stops.length - 1].colour} {...alpha} />
    </linearGradient>
  );
}

/**
 * ── THE LINE'S CASING ───────────────────────────────────────────────────────
 *
 * Three wider strokes of the same path under the line, painted with the line's
 * own glow gradient, each at its own share of the casing alpha - outermost and
 * faintest first, so they composite into a falloff rather than ending at an
 * edge (see SPARK.line). They go BEFORE the line so they sit under it, and
 * because they take the line's own gradient the light is whatever colour the
 * line is at that stretch.
 *
 * NOT a second line and never an echo: same path, same geometry, same gradient,
 * same dash, drawn only wider. Anything that reads as a second trajectory would
 * be a claim about a second series.
 *
 * `dot={false} activeDot={false}` - a casing with its own marks would be
 * exactly that second series. `tooltipType="none"` because the tooltip reads
 * the row it is over, and four Lines per series would put that row in the
 * payload four times.
 *
 * THE SHARE IS A `strokeOpacity` AND THE THEME IS IN THE GRADIENT, and the two
 * multiply. So the per-theme number stays in one custom property
 * (`--chart-line-glow`, zero in print) while the shape of the falloff stays a
 * plain list of numbers in SPARK, which is the half that is the same in both
 * themes.
 *
 * ⚠ RETURNS AN ARRAY OF `<Line>` RATHER THAN A COMPONENT. Recharts reads its
 * own children to decide what to draw, so a wrapper component would be an
 * unrecognised child and the casing would simply not exist. Spread into the
 * chart's children, never nested.
 */
// Not a component and cannot be one, for the reason directly above; the
// fast-refresh rule reads the lowercase name and is right about everything
// except this case.
// eslint-disable-next-line react-refresh/only-export-components
export function statusLineCasing({
  dataKey,
  gradientId,
  dash,
  connectNulls = false,
  animate = false,
  keyPrefix = 'glow',
}: {
  dataKey: string;
  gradientId: string;
  dash?: string;
  connectNulls?: boolean;
  animate?: boolean;
  /** Distinct per series, or three of the four casings on a Compare chart collide on one React key. */
  keyPrefix?: string;
}) {
  return SPARK.line.layers.map((layer) => (
    <Line
      key={`${keyPrefix}-${layer.extra}`}
      type="linear"
      dataKey={dataKey}
      stroke={`url(#${gradientId})`}
      strokeOpacity={layer.share}
      strokeWidth={chartTokens.lineWidth + layer.extra}
      strokeDasharray={dash}
      strokeLinecap="round"
      strokeLinejoin="round"
      connectNulls={connectNulls}
      dot={false}
      activeDot={false}
      legendType="none"
      tooltipType="none"
      isAnimationActive={animate}
      animationDuration={620}
      animationEasing="ease-out"
    />
  ));
}

// ---------------------------------------------------------------------------
// THE BOUNDARY LABELS
// ---------------------------------------------------------------------------

/**
 * ALL FOUR BOUNDARIES, LABELLED ON THE AXIS.
 *
 * A boundary line with no number on it sends the reader to the key to find out
 * what it is, and the key cannot tell them - it can say "the reference range"
 * but not "3.5 to 5.3". With the bands gone these lines are the ONLY thing
 * saying where the range is, so the labels matter more than they ever did.
 *
 * THREE KINDS OF LABEL IN ONE GUTTER, and each is told apart by a MARK rather
 * than a hue - a coloured axis label would be the status layer leaking into the
 * furniture:
 *
 *     tick value      muted ink, no rule        where the scale is marked
 *     reference bound full ink, SOLID lead rule the lab's own range
 *     threshold       full ink, DASHED lead rule where significantly-out starts
 *
 * Each lead rule matches its own line's dash, so the label is attached to the
 * boundary it names rather than merely level with one.
 *
 * ONLY THE CURRENT PERIOD'S GO ON THE AXIS, because the axis has one left-hand
 * gutter and a marker whose range has changed has two sets. The earlier periods
 * keep their labels at the right-hand end of their OWN extent, just inside their
 * step rule - the only place they can go and still say which period they are.
 * Compare has exactly one column and it is always the axis one: a normalised
 * axis cannot step, because 0 and 1 mean the same thing whatever the laboratory
 * did to the underlying range.
 */
export function BoundaryLabels({ columns, face = 'mono' }: { columns: LabelColumn[]; face?: LabelFace }) {
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
        //
        // The BOUNDS are placed before the thresholds (see the caller's order),
        // so where the two collide it is the threshold that is dropped. That is
        // the right way round: the reference range is what the chart is about.
        const placed: number[] = [];
        const onAxis = column.endsAt === null;
        const endX = onAxis ? null : xScale?.(column.endsAt as number);
        if (!onAxis && (endX == null || !Number.isFinite(endX))) return null;
        return (
          <g key={`bounds-${ci}`}>
            {column.bounds.map(({ value, text, kind }) => {
              const y = yScale(value);
              if (y == null || !Number.isFinite(y)) return null;
              if (y < plot.y || y > plot.y + plot.height) return null;
              if (placed.some((other) => Math.abs(other - y) < 12)) return null;
              // A period too narrow to hold its own label goes unlabelled rather
              // than printing over its neighbour's. The sentence below the chart
              // still names every range and its dates, which is why this can be
              // dropped without losing the fact.
              if (!onAxis && (endX as number) - labelWidth(text, face) - 4 < plot.x) return null;
              placed.push(y);
              const threshold = kind === 'threshold';
              return (
                <g key={`${kind}-${text}`} data-boundary-label={kind} data-value={value}>
                  {/* The lead rule, in the same dash as the line it points at. */}
                  {onAxis && (
                    <line
                      x1={plot.x - 6}
                      y1={y}
                      x2={plot.x}
                      y2={y}
                      stroke={chartTokens.boundLabel}
                      strokeWidth={1}
                      strokeOpacity={threshold ? chartTokens.thresholdOpacity : 1}
                      strokeDasharray={threshold ? chartTokens.thresholdDashArray.join(' ') : undefined}
                      shapeRendering="crispEdges"
                    />
                  )}
                  <text
                    x={onAxis ? plot.x - 10 : (endX as number) - 4}
                    y={y}
                    dy="0.32em"
                    textAnchor="end"
                    fontSize={11}
                    // Absent for `inherit`, so the label takes the body face
                    // from the wrapper. An empty string would be an invalid
                    // family and the browser would fall back to its own.
                    fontFamily={face === 'mono' ? 'var(--font-mono)' : undefined}
                    fill={chartTokens.boundLabel}
                    fillOpacity={threshold ? chartTokens.thresholdOpacity : 1}
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
