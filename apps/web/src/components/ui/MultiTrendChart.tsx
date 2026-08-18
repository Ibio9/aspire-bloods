import { useId } from 'react';
import { ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  formatDate,
  asMarkerStatus,
  chart as chartTokens,
  severityThresholdFor,
  type MarkerStatusInput,
} from '@aspire-bloods/shared';
import { statusColor, statusLabel } from '../../lib/markerCopy';
import { formatAxisDate, type TrendSeries } from '../../lib/patientPortal';
import { SeriesMark } from './SeriesMark';
import {
  axisGutter,
  DAY_MS,
  epochOf,
  seriesStyle,
  type LabelColumn,
  type StatusLinePoint,
} from '../../lib/chartGeometry';
import {
  BoundaryLabels,
  RuleSwatch,
  SparkDot,
  SparkGradient,
  SparkPoint,
  SparkSwatch,
  StatusLineGradient,
  StatusLineSwatch,
  statusLineCasing,
} from './chartParts';

/**
 * Two or three markers on one timeline. The problem this solves is that
 * ferritin (µg/L, range ~30–300) and haemoglobin (g/L, range ~130–170) share
 * no axis, so plotting the raw numbers together either flattens one into the
 * floor or needs two y-axes nobody can read against each other.
 *
 * Instead every point is plotted at its position within its OWN reference
 * range: 0 is that marker's range floor, 1 is its ceiling, and the two rules
 * between them are "inside the usual range" for all series at once. That's the
 * comparison a patient actually wants - "my ferritin climbed while my
 * haemoglobin held steady" - without ever implying the two numbers are on the
 * same scale. Real values and units stay in the tooltip and the legend, which
 * is where they mean something.
 *
 * Normalisation is per point, not per series, so a reference range that
 * changes between sources moves the point correctly rather than being
 * silently held against a stale range.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE BANDS ARE GONE. THE LINES ARE THE CHART (Aug 2026).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This supersedes everything this file used to say about band colour, the
 * boundary-centred ramp and which band vocabulary it was drawing. There are NO
 * FILLED REGIONS on this chart of any kind: no status bands, no ramp gradients,
 * no inset panel. What is drawn, and this is the whole list:
 *
 *   1. THE LINES, on the card itself, each carrying its own marker's status
 *      along its own length.
 *   2. THE BOUNDARY RULES - the two shared reference bounds solid, the two
 *      significantly-out thresholds dashed and lighter - labelled on the axis.
 *   3. THE POINTS, every one of them the same white spark.
 *   4. THE AXIS.
 *
 * ── IT IS THE SINGLE-MARKER CHART, AND THAT IS THE CHANGE ─────────────────
 *
 * The marker page's chart removed its bands first, for reasons written up in
 * TrendChart: the bands had to be legible enough to say where the range is and
 * quiet enough that the reader's own result out-read them, every solve gained
 * one and lost the other, and the LINE paid for all of it. This chart kept
 * them, so the product had two answers to one question one press apart - a
 * green-to-red field behind three lines here, nothing behind one line there.
 *
 * Everything a reader has to learn is now in chartParts.tsx and both charts
 * import it: the gradient, the casing, the spark, the swatches, the boundary
 * labels and the gutter arithmetic. Restating any of it here is how the last
 * divergence started.
 *
 * ── WHAT THE NORMALISED AXIS CHANGES, AND IT IS ONLY THE UNITS ────────────
 *
 * `StatusLinePoint` is expressed in whatever the chart PLOTS in. On a marker
 * page that is the marker's own unit and the bounds are the laboratory's; here
 * it is position within the range, so `low` is 0, `high` is 1 and the threshold
 * is that marker's own significantly-out distance as a share of its own range
 * width. The gradient asks the same question of both and gets the right answer
 * from each, which is why three markers with three different ranges each get a
 * line that goes green in the middle and gold then red toward its own extremes.
 *
 * ⚠ ONE GRADIENT PER SERIES, NEVER ONE PER CHART. The gradients are laid out in
 * USER SPACE, so their stops are at the plot's own pixels; two markers sampled
 * on different dates put their stops at different x, and a shared gradient would
 * paint each line with the other's history.
 *
 * ── AND THE THREE LINES ARE TOLD APART BY THEIR DASH ──────────────────────
 *
 * They used to be told apart by dash AND by mark shape, because they were all
 * one colour (`chart.line`) - a colour chosen because no THREE hues could be
 * separated against the old opaque bands in dark, where the gold band was light
 * enough that only the top of the lightness range cleared it. That constraint
 * died with the bands. What replaced it is not three identity hues but the
 * status itself: each line now gradients through the traffic light on its own
 * range, so a hue on this plot means a STATE and cannot also mean a marker.
 *
 * So identity is the DASH on the plot, and the shape survives as the legend
 * token beside the marker's name - on the chip above the chart, the summary
 * card below it, the legend row and the tooltip. See SeriesMark.
 */

function normalise(value: number, low: number, high: number): number {
  const band = high - low;
  if (band === 0) return value >= high ? 1 : 0;
  return (value - low) / band;
}

interface Row {
  sampleDate: string;
  /** The sample date as an epoch value - see the time-axis note below. */
  t: number;
  [key: string]: string | number | undefined;
}

/**
 * THE INSET PANEL IS GONE HERE TOO (Aug 2026).
 *
 * It was added so the same drawing did not appear framed on a marker page and
 * unframed one press away. The single-marker chart's panel has now been removed
 * with its bands - the plot is the card - and the argument runs the same way in
 * reverse: two charts one press apart must not sit on two different grounds.
 */

function ChartTooltip({ active, payload, series }: { active?: boolean; payload?: unknown[]; series: TrendSeries[] }) {
  if (!active || !payload?.length) return null;
  const row = (payload[0] as { payload: Row }).payload;

  return (
    // The same glass card the single-marker chart's tooltip is, at the same
    // level: a reading OF the chart should diffuse the part it covers rather
    // than delete it.
    <div className="glass min-w-[11rem] rounded-card border border-taupe px-4 py-3 text-xs shadow-popover">
      {/* The row's own sampleDate, not the axis label - the axis is a time
          scale now, so its label is an epoch number. */}
      <p className="numeric text-[11px] uppercase tracking-eyebrow text-espresso/80">{formatDate(row.sampleDate)}</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {series.map((s, i) => {
          const raw = row[`${s.markerId}__value`];
          // Narrowed, not cast. The row is a bag of dynamic keys, so whatever
          // sits at `<id>__status` is genuinely unknown here - casting it to
          // MarkerStatus told the compiler otherwise and left statusColor to
          // find out at runtime.
          const st = asMarkerStatus(row[`${s.markerId}__status`]);
          if (raw == null) return null;
          return (
            <li key={s.markerId} className="flex items-center gap-2">
              {/* The mark this series is drawn with, so the row can be matched
                  to the line without counting down the legend. */}
              <SeriesMark index={i} />
              <span className="tabular text-espresso">
                {s.name}: {raw}
                {/* The status word carries its own state's colour, as it does
                    everywhere else. The mark to its left is the series
                    identity - that says WHICH marker, not how it is. */}
                {st && (
                  <>
                    {', '}
                    <span style={{ color: statusColor(st) }}>{statusLabel(st)}</span>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Where significantly-out sits for a series, expressed as a multiple of its
 * own reference-range width - i.e. in the same normalised units this chart
 * plots in. Null where the series' own points disagree with each other,
 * which happens when a reference range changed between reports.
 */
function normalisedThreshold(s: TrendSeries): number | null {
  const ks = s.points.map((p) => {
    const width = p.referenceHigh - p.referenceLow;
    if (!(width > 0)) return null;
    return severityThresholdFor(p.referenceLow, p.referenceHigh, p.severityThreshold) / width;
  });
  if (ks.some((k) => k === null)) return null;
  const first = ks[0] as number;
  return (ks as number[]).every((k) => Math.abs(k - first) < 1e-6) ? first : null;
}

export function MultiTrendChart({ series: input }: { series: TrendSeries[] }) {
  // Ids are document-global; two Compare charts on one page sharing one would
  // make the second chart's lines reference the first one's gradients.
  const uid = useId().replace(/:/g, '');
  /** ONE falloff for the whole chart - every point on every series is the same white spark. */
  const sparkId = `spark-${uid}`;

  /**
   * The legend and the accessible summary both read points[0] and the last
   * point, so a series with none takes the whole screen down. The server no
   * longer sends one; this is the belt to that braces.
   *
   * Points with no status go the same way, and for the same reason as in the
   * single-marker chart: the line's colour at that point is that point's own
   * state, so a point that was never compared against a range has nothing to
   * put on the gradient and nothing to put in the legend.
   */
  const series = input
    .map((s) => ({ ...s, points: s.points.filter((p) => asMarkerStatus(p.status) !== null) }))
    .filter((s) => s.points.length > 0);
  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.sampleDate)))].sort();
  const hasData = dates.length > 0;

  // One shared normalised threshold, or none. A shared axis may only draw what
  // every series on it actually shares: with two markers disagreeing about
  // where significantly-out begins there is no single y at which to put the
  // rule, and the note under the chart says so.
  const thresholds = series.map(normalisedThreshold);
  const sharedThreshold =
    thresholds.length > 0 && thresholds.every((k) => k !== null && Math.abs(k - (thresholds[0] as number)) < 1e-6)
      ? (thresholds[0] as number)
      : null;

  const rows: Row[] = dates.map((sampleDate) => {
    const row: Row = { sampleDate, t: epochOf(sampleDate) };
    for (const s of series) {
      const point = s.points.find((p) => p.sampleDate === sampleDate);
      if (!point) continue;
      row[s.markerId] = normalise(point.value, point.referenceLow, point.referenceHigh);
      row[`${s.markerId}__value`] = `${point.value} ${s.unit}`;
      // Narrowed on the way IN as well as on the way out. A Recharts row is a
      // bag of primitives, so this is the last place the value is still typed;
      // storing it narrowed means the tooltip reads back exactly what was put
      // in rather than a string nobody checked.
      row[`${s.markerId}__status`] = asMarkerStatus(point.status) ?? undefined;
    }
    return row;
  });

  /**
   * EACH SERIES, IN THE UNITS THIS CHART PLOTS IN.
   *
   * The gradient and the casing read this and nothing else, so a line's colour
   * is derived from that marker's own points against that marker's own
   * reference range - three markers, three independent traffic lights, one
   * axis. `threshold` is normalised here rather than inside the shared
   * gradient, because only this chart knows its axis is a ratio.
   *
   * A zero-width range cannot say where significantly-out is; `normalise`
   * already answers 0 or 1 for one, so the point lands exactly on a bound and
   * reads in range, and the threshold only has to be a finite positive number
   * for the boundary arithmetic to stay arithmetic rather than NaN.
   */
  const plotted = series.map((s, i) => {
    const points: StatusLinePoint[] = s.points
      .map((p) => {
        const width = p.referenceHigh - p.referenceLow;
        const raw = severityThresholdFor(p.referenceLow, p.referenceHigh, p.severityThreshold);
        return {
          t: epochOf(p.sampleDate),
          value: normalise(p.value, p.referenceLow, p.referenceHigh),
          status: p.status,
          low: 0,
          high: 1,
          threshold: width > 0 ? raw / width : 1,
        };
      })
      .sort((a, b) => a.t - b.t);
    return {
      series: s,
      style: seriesStyle(i),
      points,
      // That SERIES' own most recent sample, not the chart's. Three markers
      // rarely end on the same day, and the point that should be lit brightest
      // on a line is that line's own latest result.
      latestT: points.length > 0 ? points[points.length - 1].t : null,
      // Per series, not per chart: comparing a marker with four results against
      // one with a single result is legitimate, and the single one must still
      // render as a lone point rather than borrowing a line from its neighbours.
      connected: s.points.length >= 2 && s.comparable,
      lineId: `status-line-${uid}-${i}`,
      glowId: `status-glow-${uid}-${i}`,
    };
  });

  const times = rows.map((r) => r.t);
  // Empty spreads give Math.min Infinity, which produces a chart made of NaN.
  const tFirst = hasData ? Math.min(...times) : 0;
  const tLast = hasData ? Math.max(...times) : 0;
  const tPad = Math.max((tLast - tFirst) * 0.06, 7 * DAY_MS);
  const tMin = tFirst - tPad;
  const tMax = tLast + tPad;

  const positions = rows.flatMap((r) => series.map((s) => r[s.markerId]).filter((v): v is number => typeof v === 'number'));
  const min = Math.min(0, ...positions);
  const max = Math.max(1, ...positions);
  const pad = (max - min) * 0.15 || 0.15;
  const domainMin = min - pad;
  const domainMax = max + pad;

  /**
   * THE BOUNDARY LABELS, IN WORDS.
   *
   * The single-marker chart prints each boundary's own VALUE here, because its
   * axis is in the marker's units and a figure is the most specific thing that
   * can be said. This axis is a position within three different ranges, where a
   * figure would mean nothing, so the specific answer is a word. Same gutter,
   * same lead rule, same two weights, same collision rule - bounds first, so a
   * threshold that lands within 12px of one loses its label and keeps its rule.
   *
   * Both thresholds read the same words on purpose: they are one fact stated at
   * two ends, and which end you are looking at is what says below or above.
   */
  const bounds: LabelColumn[] = [
    {
      // A normalised axis cannot step. 0 and 1 mean the same thing whatever the
      // laboratory did to the underlying range, which is why there is one
      // column here where the marker page can have several.
      endsAt: null,
      bounds: [
        { value: 1, text: 'Range high', kind: 'bound' as const },
        { value: 0, text: 'Range low', kind: 'bound' as const },
        ...(sharedThreshold !== null
          ? [
              { value: 1 + sharedThreshold, text: 'Significantly out', kind: 'threshold' as const },
              { value: -sharedThreshold, text: 'Significantly out', kind: 'threshold' as const },
            ]
          : []),
      ],
    },
  ];
  // Words rather than figures, so the gutter is measured at the body face's own
  // width and given more room than a numeric axis needs. 118 is "Significantly
  // out" plus its lead rule and gap, which is the widest thing this axis can
  // ever print.
  const gutter = axisGutter(
    bounds[0].bounds.map((b) => b.text),
    { face: 'inherit', max: 118 },
  );

  /**
   * A KEY MAY NOT NAME A MARK THE CHART DID NOT DRAW.
   *
   * The two thresholds are `ifOverflow="hidden"`, so on a selection whose
   * results all sit near their ranges they are clipped away entirely - the
   * threshold is 1.5x the range width out from each bound and this domain is
   * padded by 0.15x of it. The same rule, and the same measurement, as the
   * single-marker chart's own `hasThresholds`.
   */
  const hasThresholds =
    sharedThreshold !== null && (-sharedThreshold > domainMin || 1 + sharedThreshold < domainMax);

  /** Every state actually drawn on the plot, for the key. */
  const statuses = [...new Set(series.flatMap((s) => s.points.map((p) => p.status)))];

  // Which explanatory note applies is a property of the data, not a constant.
  const singleResultNames = series.filter((s) => s.points.length === 1).map((s) => s.name);
  const incomparableNames = series.filter((s) => !s.comparable && s.points.length >= 2).map((s) => s.name);

  if (!hasData) return null;

  const summary = series
    .map((s) => {
      const first = s.points[0];
      const last = s.points[s.points.length - 1];
      return `${s.name}: ${first.value} ${s.unit} on ${formatDate(first.sampleDate)} to ${last.value} ${s.unit} on ${formatDate(last.sampleDate)}, currently ${statusLabel(last.status)}`;
    })
    .join('. ');

  return (
    <div>
      {/* Real padding on all four sides, so the drawing sits on the card rather
          than being cropped to its edges - same wrapper as the single-marker
          chart, and the same one padding value on every side. */}
      <div
        className="tabular h-[340px] w-full p-2"
        role="img"
        aria-label={`Comparison chart. Each marker is plotted against its own reference range, and horizontal rules mark the range every line shares. Each line is coloured by that marker’s own status along its own length. ${summary}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          {/* Equal on three sides; the left is 4 because the axis gutter after
              it is what actually holds the labels, and the lead rules beside
              them need those 4px so they are not clipped. */}
          <ComposedChart data={rows} margin={{ top: 16, right: 16, left: 4, bottom: 16 }}>
            <defs>
              {/* ONE GRADIENT PER SERIES, plus the same gradient again at the
                  casing's alpha, plus one radial falloff every point on every
                  series sparks with. Inside <defs> so they are definitions
                  rather than things drawn; they read the plot area and the x
                  scale, which are only available inside the chart. */}
              {plotted.map((p) => (
                <StatusLineGradient key={p.lineId} id={p.lineId} points={p.points} />
              ))}
              {plotted.map((p) => (
                <StatusLineGradient key={p.glowId} id={p.glowId} points={p.points} glow />
              ))}
              <SparkGradient id={sparkId} />
            </defs>

            {/* Real time, not one category per sample date. Plotted as
                categories, a marker retested at three months and again at a
                year drew as two equal steps - which says the change happened
                at a steady rate when it did not. Same correction, and the same
                reasoning, as the single-marker chart. */}
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[tMin, tMax]}
              ticks={times}
              tickFormatter={(t: number) => formatAxisDate(new Date(t).toISOString().slice(0, 10))}
              // Axis labels are numeric data, so they take the mono face like
              // every other number. The tabular figures are inherited from the
              // `tabular` class on the wrapper, since Recharts' tick prop type
              // has no fontVariantNumeric.
              tick={{ fontSize: 11, fill: chartTokens.axisText, fontFamily: 'var(--font-mono)' }}
              // ONE GROUND LINE AND NOTHING ELSE - no box, no vertical rules,
              // no gridlines. The boundary rules are the plot's structure now;
              // a frame around them is a second structure competing with the
              // first, and a grid over them is a third.
              axisLine={{ stroke: chartTokens.axisLine, strokeOpacity: 0.5 }}
              tickLine={false}
              tickMargin={10}
              minTickGap={16}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[domainMin, domainMax]}
              // NO SCALE, and its absence is the honest answer rather than an
              // omission. A tick here would be a number like 0.6, which is not
              // a quantity anybody was measured in - the only meaningful
              // positions on this axis are the boundaries, and BoundaryLabels
              // prints those in the gutter this width reserves.
              tick={false}
              axisLine={false}
              tickLine={false}
              width={gutter}
            />

            {/* ── THE BOUNDARY RULES ──────────────────────────────────────
                The whole of what says where the range is, now that there are
                no bands. Two weights, distinguishable without colour:

                  REFERENCE BOUNDS     solid, full weight
                  SIGNIFICANTLY OUT    dashed and lighter

                Drawn at the same tokens and the same weights as the
                single-marker chart's, because they are the same rules about the
                same thing. `data-boundary-label` on the labels is what an e2e
                measurement reads. */}
            <ReferenceLine
              y={0}
              stroke={chartTokens.bound}
              strokeOpacity={chartTokens.boundOpacity}
              strokeWidth={chartTokens.boundWidth}
              ifOverflow="hidden"
            />
            <ReferenceLine
              y={1}
              stroke={chartTokens.bound}
              strokeOpacity={chartTokens.boundOpacity}
              strokeWidth={chartTokens.boundWidth}
              ifOverflow="hidden"
            />
            {sharedThreshold !== null && (
              <ReferenceLine
                y={-sharedThreshold}
                stroke={chartTokens.bound}
                strokeOpacity={chartTokens.thresholdOpacity}
                strokeDasharray={chartTokens.thresholdDashArray.join(' ')}
                strokeWidth={chartTokens.boundWidth}
                ifOverflow="hidden"
              />
            )}
            {sharedThreshold !== null && (
              <ReferenceLine
                y={1 + sharedThreshold}
                stroke={chartTokens.bound}
                strokeOpacity={chartTokens.thresholdOpacity}
                strokeDasharray={chartTokens.thresholdDashArray.join(' ')}
                strokeWidth={chartTokens.boundWidth}
                ifOverflow="hidden"
              />
            )}

            <BoundaryLabels columns={bounds} face="inherit" />

            <Tooltip
              content={<ChartTooltip series={series} />}
              // SOLID, at the same weight and the same neutral as the
              // single-marker chart's, and for the same reason: a dashed cursor
              // would differ from the dashed threshold rules only in its
              // direction.
              cursor={{ stroke: chartTokens.cursor, strokeWidth: 1, strokeOpacity: 0.55 }}
            />

            {/* EVERY CASING BEFORE EVERY LINE, not casing-then-line per series.
                Interleaved, the second series' casing would be painted over the
                first series' line - light from one marker sitting on top of
                another marker's result. */}
            {plotted.flatMap((p) =>
              p.connected
                ? statusLineCasing({
                    dataKey: p.series.markerId,
                    gradientId: p.glowId,
                    dash: p.style.dash,
                    connectNulls: true,
                    keyPrefix: `glow-${p.series.markerId}`,
                  })
                : [],
            )}
            {plotted.map((p) => (
              <Line
                key={p.series.markerId}
                // STRAIGHT SEGMENTS, NEVER A CURVE. `monotone` draws a smooth
                // spline between the points, which is a claim about values
                // between two blood draws that nobody measured. Same rule as
                // the single-marker chart.
                type="linear"
                dataKey={p.series.markerId}
                name={p.series.name}
                // THE STATUS, ALONG ITS LENGTH - this marker's own, against
                // this marker's own reference range. It was one flat bronze for
                // all three series, because three identity hues could not be
                // separated against the old bands; with the bands gone a hue on
                // this plot means a STATE, and identity is the dash.
                stroke={p.connected ? `url(#${p.lineId})` : 'none'}
                // Round caps and joins: a line with mitred corners reads as a
                // plotted path, and a drawn stroke is what the rest of the
                // product's marks are.
                strokeWidth={chartTokens.lineWidth}
                strokeDasharray={p.style.dash}
                strokeLinecap="round"
                strokeLinejoin="round"
                connectNulls={p.connected}
                dot={<SparkDot latestT={p.latestT} sparkId={sparkId} />}
                activeDot={false}
                isAnimationActive={false}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-5 flex flex-col gap-2.5 border-t border-taupe pt-4 sm:flex-row sm:flex-wrap sm:gap-x-8">
        {series.map((s, i) => {
          const last = s.points[s.points.length - 1];
          return (
            <li key={s.markerId} className="flex items-center gap-2.5 text-sm">
              <SeriesMark index={i} />
              <span className="text-espresso">
                <span className="font-medium">{s.name}</span>{' '}
                <span className="tabular text-espresso/80">
                  latest {last.value} {s.unit},{' '}
                  <span style={{ color: statusColor(last.status) }}>{statusLabel(last.status)}</span>
                </span>
                <span className="sr-only"> ({seriesStyle(i).dashLabel})</span>
              </span>
            </li>
          );
        })}
      </ul>

      <ChartKey statuses={statuses} hasThresholds={hasThresholds} uid={uid} />

      {/* NO BAND ENTRIES IN THE KEY, and no coloured rectangles - the same rule
          the single-marker chart follows. What names the boundaries is the
          LABELS on the axis, beside the rules they belong to. */}
      {sharedThreshold === null && (
        <p className="mt-4 text-sm leading-relaxed text-espresso/80">
          These markers don’t share a common point at which a result counts as significantly outside its range, so only
          the reference range itself is marked here. Each line still turns gold and then red toward its own extremes, and
          each marker’s own thresholds are drawn on its detail page.
        </p>
      )}

      {/* One sentence per state that actually applies. A marker with a single
          result and a marker with incomparable sources are different facts and
          used to share one note; neither is shown when neither is true. */}
      {singleResultNames.length > 0 && (
        <p className="mt-4 text-sm leading-relaxed text-espresso/80">
          {singleResultNames.length === 1
            ? `${singleResultNames[0]} has one result so far, so it is shown as a single point with no line.`
            : `${singleResultNames.join(' and ')} each have one result so far, so they are shown as single points with no line.`}
        </p>
      )}
      {incomparableNames.length > 0 && (
        <p className="mt-3 text-sm leading-relaxed text-espresso/80">
          {incomparableNames.length === 1 ? `${incomparableNames[0]} has` : `${incomparableNames.join(' and ')} have`} results
          from sources we can’t directly convert between, so those points are shown separately rather than joined into a
          line. They are still plotted against their own reference range.
        </p>
      )}
    </div>
  );
}

/**
 * What the marks mean, in words - the same key the single-marker chart carries,
 * built from the same swatches.
 *
 * The series legend above this says WHICH line is which marker. This says what
 * the drawing means: the colour a line takes at a stretch, the mark at every
 * point, and the two weights of rule. Someone who cannot separate the green
 * stretch from the red one reads this and loses nothing, because every point's
 * POSITION against two labelled rules says the same thing without colour.
 *
 * EVERY SWATCH IS THE MARK IT STANDS FOR, drawn from the plot's own tokens.
 */
function ChartKey({
  statuses,
  hasThresholds,
  uid,
}: {
  statuses: MarkerStatusInput[];
  /** At least one significantly-out rule is inside the y domain and therefore drawn. */
  hasThresholds: boolean;
  uid: string;
}) {
  return (
    <div className="mt-4 border-t border-taupe pt-3 text-xs text-espresso/80">
      <ul className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        {statuses.map((s) => (
          <li key={`mark-${s}`} className="flex items-center gap-2">
            <StatusLineSwatch status={s} />
            <span className="min-w-0">{statusLabel(s)}</span>
          </li>
        ))}
        <li className="flex items-center gap-2">
          {/* The spark swatch carries its own copy of the falloff: the key is
              outside the chart's SVG, so a url(#…) into the plot's defs
              resolves to nothing and paints an invisible bead. */}
          <SparkSwatch id={`key-${uid}-point`}>
            <SparkPoint cx={10} cy={10} latest={false} gradientId={`key-${uid}-point`} />
          </SparkSwatch>
          <span className="min-w-0">One result, on the date it was taken</span>
        </li>
        <li className="flex items-center gap-2">
          <RuleSwatch kind="bound" />
          <span className="min-w-0">Each marker’s own reference range</span>
        </li>
        {hasThresholds && (
          <li className="flex items-center gap-2">
            <RuleSwatch kind="threshold" />
            <span className="min-w-0">Where a result becomes significantly out</span>
          </li>
        )}
      </ul>
    </div>
  );
}
