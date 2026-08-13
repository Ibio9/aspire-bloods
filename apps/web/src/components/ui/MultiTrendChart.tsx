import { useId } from 'react';
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
} from 'recharts';
import {
  formatDate,
  asMarkerStatus,
  chart as chartTokens,
  bandRampStops,
  TRANSITION_SHARE,
  severityThresholdFor,
  type MarkerStatus,
} from '@aspire-bloods/shared';
import { statusColor, statusLabel } from '../../lib/markerCopy';
import { formatAxisDate, type TrendSeries } from '../../lib/patientPortal';

/**
 * Two or three markers on one timeline. The problem this solves is that
 * ferritin (µg/L, range ~30–300) and haemoglobin (g/L, range ~130–170) share
 * no axis, so plotting the raw numbers together either flattens one into the
 * floor or needs two y-axes nobody can read against each other.
 *
 * Instead every point is plotted at its position within its OWN reference
 * range: 0 is that marker's range floor, 1 is its ceiling, and the bands
 * between them are "inside the usual range" for all series at once. That's the
 * comparison a patient actually wants — "my ferritin climbed while my
 * haemoglobin held steady" — without ever implying the two numbers are on the
 * same scale. Real values and units stay in the tooltip and the legend, which
 * is where they mean something.
 *
 * Normalisation is per point, not per series, so a reference range that
 * changes between sources moves the point correctly rather than being
 * silently held against a stale range.
 *
 * ═══ ONE BAND SYSTEM, NOT TWO (Aug 2026) ═════════════════════════════════
 *
 * This chart was the last thing in the product still drawing `bandGradientStops`
 * — the pre-mixed `hueTint.*.band` palette from before the bands went opaque.
 * So the product had two vocabularies for one idea, and they were visible on
 * one screen: the Compare view's pale sage-and-beige bands directly beside a
 * marker page's solved opaque ones. Two of its key entries were worse than
 * inconsistent — "Below the reference range" and "Above the reference range"
 * both resolved to `hueTint.yellow.band`, so the key printed two different
 * sentences beside two identical swatches.
 *
 * It draws `bandRampStops` now, exactly as the single-marker chart and both
 * range bars do. The geometry is the only thing that differs and it is the
 * simplest case in the system: this axis IS a reference range, so `low` is 0,
 * `high` is 1, and the threshold is the shared normalised one. Same five
 * fills, same two hinges, same blend centred on each boundary, same
 * `TRANSITION_SHARE`.
 *
 * ── AND THE THREE SERIES SHARE ONE LINE COLOUR, WHICH IS MEASURED ─────────
 *
 * The three lines used to be bronze, espresso and bronze-800 — three warm
 * browns that were already near-indistinguishable in light, which is why the
 * dash pattern and the mark shape were introduced beside them in the first
 * place. Against OPAQUE bands two of the three stop being legible at all.
 * Measured, contrast against the five band fills:
 *
 *     light   bronze 3.33 / 2.94 / 2.66 / 2.39 / 2.18   ← fails AA-large on four
 *             bronze-800 4.96 / 4.38 / 3.96 / 3.55 / 3.25
 *     dark    bronze 3.73 / 2.15 / 1.25 / 1.79 / 2.42   ← 1.25 on gold: invisible
 *             bronze-800 6.62 / 3.82 / 2.21 / 3.19 / 4.30
 *
 * `chart.line` is the one colour already solved to clear every band in both
 * themes (3.36 worst in light, 3.05 in dark — see LINE_LIFT), and in DARK
 * there is no second colour available: the gold band is light enough that only
 * the very top of the lightness range clears it, so three series cannot be
 * separated by hue there at all without one of them failing.
 *
 * So series identity is carried by DASH PATTERN and MARK SHAPE, which this
 * chart has always drawn and has always named in the legend and in the
 * screen-reader text. That is the layer that survives greyscale and colour
 * blindness, and it is now the layer doing the whole job rather than the
 * backup for a colour ladder that could not exist. The product's own rule —
 * if brighter bands bury the line, brighten the line, never dull the band —
 * has no third colour to offer, and three legible lines beat two pretty ones.
 */

/**
 * The three series, distinguished by dash and by mark. One colour, for the
 * reason measured above; `dashLabel` is what a screen reader is told, so the
 * distinction is stated in words as well as drawn.
 */
const SERIES_STYLES = [
  { dash: undefined, shape: 'circle' as const, dashLabel: 'solid line, round markers' },
  { dash: '7 4', shape: 'square' as const, dashLabel: 'dashed line, square markers' },
  { dash: '2 4', shape: 'diamond' as const, dashLabel: 'dotted line, diamond markers' },
];

function normalise(value: number, low: number, high: number): number {
  const band = high - low;
  if (band === 0) return value >= high ? 1 : 0;
  return (value - low) / band;
}

interface Row {
  sampleDate: string;
  /** The sample date as an epoch value — see the time-axis note in MultiTrendChart. */
  t: number;
  [key: string]: string | number | undefined;
}

/** UTC midnight: a sample date is a calendar date, not an instant. Matches TrendChart. */
function epochOf(sampleDate: string): number {
  return Date.parse(`${sampleDate.slice(0, 10)}T00:00:00Z`);
}

const DAY_MS = 86_400_000;

/**
 * THE PLOT AS AN INSET PANEL, exactly as the single-marker chart draws it —
 * one hairline frame over a surface fractionally away from the card. It was
 * absent here, so the same drawing appeared framed on a marker page and
 * unframed one press away.
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
      shapeRendering="crispEdges"
      aria-hidden="true"
    />
  );
}

/**
 * A point: an OUTLINE on the plot's own ground, filled with the plot surface
 * and stroked in the line colour — so the line visibly passes behind it and
 * the interior is a hole in the band rather than more colour on top of one.
 * Same construction as the single-marker chart's marks.
 */
function SeriesDot({ cx, cy, shape }: { cx?: number; cy?: number; shape: 'circle' | 'square' | 'diamond' }) {
  if (cx == null || cy == null) return null;
  const common = { fill: chartTokens.plotSurface, stroke: chartTokens.line, strokeWidth: 1.8 };
  return (
    <g>
      {/* Generous invisible hit area — the visible mark stays small. */}
      <circle cx={cx} cy={cy} r={15} fill="transparent" />
      {shape === 'circle' && <circle cx={cx} cy={cy} r={4.5} {...common} />}
      {shape === 'square' && <rect x={cx - 4} y={cy - 4} width={8} height={8} {...common} />}
      {shape === 'diamond' && <rect x={cx - 4.2} y={cy - 4.2} width={8.4} height={8.4} transform={`rotate(45 ${cx} ${cy})`} {...common} />}
    </g>
  );
}

/** The legend and tooltip swatch — the mark and its dash, as the plot draws them. */
function SeriesSwatch({ index }: { index: number }) {
  const style = SERIES_STYLES[index % SERIES_STYLES.length];
  const common = { fill: chartTokens.plotSurface, stroke: chartTokens.line, strokeWidth: 1.4 };
  return (
    <svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true" className="shrink-0">
      <line x1="0" y1="5" x2="26" y2="5" stroke={chartTokens.line} strokeWidth="2" strokeDasharray={style.dash} />
      {style.shape === 'circle' && <circle cx="13" cy="5" r="4" {...common} />}
      {style.shape === 'square' && <rect x="9.5" y="1.5" width="7" height="7" {...common} />}
      {style.shape === 'diamond' && <rect x="9.6" y="1.6" width="6.8" height="6.8" transform="rotate(45 13 5)" {...common} />}
    </svg>
  );
}

function ChartTooltip({ active, payload, series }: { active?: boolean; payload?: unknown[]; series: TrendSeries[] }) {
  if (!active || !payload?.length) return null;
  const row = (payload[0] as { payload: Row }).payload;

  return (
    // The same glass card the single-marker chart's tooltip is, at the same
    // level: a reading OF the chart should diffuse the part it covers rather
    // than delete it.
    <div className="glass min-w-[11rem] rounded-card border border-taupe px-4 py-3 text-xs shadow-popover">
      {/* The row's own sampleDate, not the axis label — the axis is a time
          scale now, so its label is an epoch number. */}
      <p className="numeric text-[11px] uppercase tracking-eyebrow text-espresso/80">{formatDate(row.sampleDate)}</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {series.map((s, i) => {
          const raw = row[`${s.markerId}__value`];
          // Narrowed, not cast. The row is a bag of dynamic keys, so whatever
          // sits at `<id>__status` is genuinely unknown here — casting it to
          // MarkerStatus told the compiler otherwise and left statusColor to
          // find out at runtime.
          const st = asMarkerStatus(row[`${s.markerId}__status`]);
          if (raw == null) return null;
          return (
            <li key={s.markerId} className="flex items-center gap-2">
              {/* The mark this series is drawn with, so the row can be matched
                  to the line without counting down the legend. */}
              <SeriesSwatch index={i} />
              <span className="tabular text-espresso">
                {s.name}: {raw}
                {/* The status word carries its own state's colour, as it does
                    everywhere else. The swatch to its left is the series
                    identity — that says WHICH marker, not how it is. */}
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
 * own reference-range width — i.e. in the same normalised units this chart
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
  const gradId = `multi-band-${useId().replace(/:/g, '')}`;
  /**
   * The legend and the accessible summary both read points[0] and the last
   * point, so a series with none takes the whole screen down. The server no
   * longer sends one; this is the belt to that braces.
   *
   * Points with no status go the same way, and for the same reason as in the
   * single-marker chart: the legend colours and names the last point's state,
   * so a series whose last point was never compared against a range has nothing
   * to put there. Dropping the point is the honest answer; the alternative was
   * `statusColor(last.status as MarkerStatus)`, where the cast was the only
   * thing making it compile and nothing at all made it work.
   */
  const series = input
    .map((s) => ({ ...s, points: s.points.filter((p) => asMarkerStatus(p.status) !== null) }))
    .filter((s) => s.points.length > 0);
  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.sampleDate)))].sort();
  const hasData = dates.length > 0;

  // One shared normalised threshold, or none. See the note at the top: a
  // shared axis may only shade what every series on it actually shares.
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
   * THE BANDS, in normalised units — and this is the same instrument as every
   * other band in the product rather than a second one that resembles it.
   *
   * The geometry is the degenerate case the ramp was built for: the axis IS a
   * reference range, so `low` is 0 and `high` is 1, and the transition
   * half-width is a share of the DRAWN EXTENT exactly as it is on a marker's
   * own chart. Where the series disagree about where significantly-out begins
   * there is no shared threshold, so only the reference range itself is
   * shaded — a shared axis may only shade what is shared — and the note under
   * the chart says which of the two happened.
   */
  const transitionHalfWidth = ((domainMax - domainMin) * TRANSITION_SHARE) / 2;
  const rampGeometry = {
    low: 0,
    high: 1,
    // With no shared threshold nothing outside the range is drawn, so the value
    // is never read; it still has to be a finite number greater than zero for
    // the clamps inside bandRampStops to be arithmetic rather than NaN.
    threshold: sharedThreshold ?? 1,
    halfWidth: transitionHalfWidth,
  };

  const bands: { status: MarkerStatus; y1: number; y2: number }[] = [{ status: 'IN_RANGE', y1: 0, y2: 1 }];
  if (sharedThreshold !== null) {
    bands.push(
      { status: 'LOW', y1: -sharedThreshold, y2: 0 },
      { status: 'HIGH', y1: 1, y2: 1 + sharedThreshold },
      { status: 'SIGNIFICANT_LOW', y1: domainMin, y2: -sharedThreshold },
      { status: 'SIGNIFICANT_HIGH', y1: 1 + sharedThreshold, y2: domainMax },
    );
  }

  /**
   * Clamped to the domain, then the stops placed by VALUE and converted onto
   * each rect's own drawn extent — the same correction the single-marker chart
   * makes, and for the same reason: a band can reach past the axis and the
   * outer two are open-ended, so a stop laid out as a fraction of the CLAMPED
   * rect finishes its ramp early and puts orange in the middle of the
   * above-range region rather than at the threshold where orange means
   * something. Only the nearest stop outside the rect survives on each side,
   * so where two clamp to the same edge the colour that paints it is the one
   * still true there.
   */
  const withinRect = <T extends { value: number }>(stops: T[], y1: number, y2: number): T[] => {
    const [lo, hi] = y1 <= y2 ? [y1, y2] : [y2, y1];
    const inside = stops.filter((s) => s.value >= lo && s.value <= hi);
    const below = stops.filter((s) => s.value < lo).pop();
    const above = stops.find((s) => s.value > hi);
    const kept = [...(below ? [below] : []), ...inside, ...(above ? [above] : [])];
    return kept.length >= 2 ? kept : [...kept, ...kept].slice(0, 2);
  };

  const bandRects = bands
    .map((b) => {
      const y1 = Math.max(domainMin, b.y1);
      const y2 = Math.min(domainMax, b.y2);
      const drawnSpan = y2 - y1 || 1;
      const stops = withinRect(bandRampStops(b.status, rampGeometry), y1, y2)
        .map((stop) => ({
          // SVG's y grows downward and a value grows upward, so a band's
          // HIGH-value end is the gradient's offset 0.
          offset: Math.max(0, Math.min(1, 1 - (stop.value - y1) / drawnSpan)),
          colour: stop.colour,
        }))
        .sort((a, b2) => a.offset - b2.offset);
      return { status: b.status, y1, y2, stops };
    })
    .filter((b) => b.y2 > b.y1);

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
      {/* Real padding on all four sides, so the framed plot is a drawing on the
          card rather than a picture cropped to its edges — same wrapper as the
          single-marker chart. */}
      <div
        className="tabular h-[340px] w-full px-1 pb-1 sm:px-2"
        role="img"
        aria-label={`Comparison chart. Each marker is plotted against its own reference range, where the shaded band is that marker’s usual range. ${summary}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 18, right: 18, left: 6, bottom: 10 }}>
            {/* Real time, not one category per sample date. Plotted as
                categories, a marker retested at three months and again at a
                year drew as two equal steps — which says the change happened
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
              axisLine={{ stroke: chartTokens.axisLine, strokeOpacity: 0.5 }}
              tickLine={false}
              tickMargin={10}
              minTickGap={16}
              interval="preserveStartEnd"
            />
            <defs>
              {bandRects.map((b) => (
                <linearGradient key={b.status} id={`${gradId}-${b.status}`} x1="0" y1="0" x2="0" y2="1">
                  {b.stops.map((stop, i) => (
                    <stop key={i} offset={stop.offset} stopColor={stop.colour} stopOpacity={1} />
                  ))}
                </linearGradient>
              ))}
            </defs>
            <YAxis
              domain={[domainMin, domainMax]}
              ticks={[0, 1]}
              tickFormatter={(v: number) => (v === 0 ? 'Range low' : 'Range high')}
              // NOT the mono face. Every other axis label in the product is a
              // NUMBER and takes mono for that reason; these two are words, and
              // mono is for numerics only. They are the only axis labels in the
              // product that are prose, which is why this is the only axis that
              // does not name a font here.
              tick={{ fontSize: 11, fill: chartTokens.axisText }}
              axisLine={false}
              tickLine={false}
              width={74}
            />

            {/* The panel first, then the bands on it, then everything else. */}
            <PlotPanel />

            {bandRects.map((b) => (
              <ReferenceArea
                key={b.status}
                y1={b.y1}
                y2={b.y2}
                fill={`url(#${gradId}-${b.status})`}
                // See the same line in TrendChart: ReferenceArea's fillOpacity
                // defaults to 0.5, which would draw every band at half strength
                // — the exact translucency the opaque-band change removed.
                fillOpacity={1}
                strokeOpacity={0}
                ifOverflow="hidden"
              />
            ))}
            {/* The two boundaries every series shares, drawn as the same neutral
                hairline every other boundary in the product uses — and labelled
                on the axis ("Range low" / "Range high") so they are locatable
                with the colour taken away. */}
            <ReferenceLine y={0} stroke={chartTokens.referenceEdge} strokeOpacity={chartTokens.referenceEdgeOpacity} strokeWidth={1} />
            <ReferenceLine y={1} stroke={chartTokens.referenceEdge} strokeOpacity={chartTokens.referenceEdgeOpacity} strokeWidth={1} />
            {sharedThreshold !== null && (
              <ReferenceLine y={-sharedThreshold} stroke={chartTokens.referenceEdge} strokeOpacity={chartTokens.severityEdgeOpacity} strokeWidth={1} />
            )}
            {sharedThreshold !== null && (
              <ReferenceLine y={1 + sharedThreshold} stroke={chartTokens.referenceEdge} strokeOpacity={chartTokens.severityEdgeOpacity} strokeWidth={1} />
            )}
            <Tooltip content={<ChartTooltip series={series} />} cursor={{ stroke: chartTokens.cursor, strokeWidth: 1 }} />
            {series.map((s, i) => {
              const style = SERIES_STYLES[i % SERIES_STYLES.length];
              // Per series, not per chart: comparing a marker with four
              // results against one with a single result is legitimate, and
              // the single one must still render as a lone point rather than
              // borrowing a line from its neighbours.
              const connected = s.points.length >= 2 && s.comparable;
              return (
                <Line
                  key={s.markerId}
                  // Straight, never `monotone`: a spline between two blood
                  // draws invents a shape for the months between them that
                  // nobody measured. Same rule as the single-marker chart,
                  // which this had quietly diverged from.
                  type="linear"
                  dataKey={s.markerId}
                  name={s.name}
                  stroke={connected ? chartTokens.line : 'none'}
                  strokeWidth={chartTokens.lineWidth}
                  strokeDasharray={style.dash}
                  connectNulls={connected}
                  dot={<SeriesDot shape={style.shape} />}
                  activeDot={false}
                  isAnimationActive={false}
                />
              );
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-5 flex flex-col gap-2.5 border-t border-taupe pt-4 sm:flex-row sm:flex-wrap sm:gap-x-8">
        {series.map((s, i) => {
          const style = SERIES_STYLES[i % SERIES_STYLES.length];
          const last = s.points[s.points.length - 1];
          return (
            <li key={s.markerId} className="flex items-center gap-2.5 text-sm">
              <SeriesSwatch index={i} />
              <span className="text-espresso">
                <span className="font-medium">{s.name}</span>{' '}
                <span className="tabular text-espresso/80">
                  latest {last.value} {s.unit},{' '}
                  <span style={{ color: statusColor(last.status) }}>{statusLabel(last.status)}</span>
                </span>
                <span className="sr-only"> ({style.dashLabel})</span>
              </span>
            </li>
          );
        })}
      </ul>

      {/* NO BAND ENTRIES IN THE KEY, and no coloured rectangles — the same rule
          the single-marker chart follows. What names the bands is the FIGURES
          on the axis ("Range low", "Range high") beside the hairlines that
          bound them, which is a better answer to "where does my range start"
          and one a greyscale reader gets in full. The bands are still never
          carried by colour alone. */}
      {sharedThreshold === null && (
        <p className="mt-4 text-sm leading-relaxed text-espresso/80">
          These markers don’t share a common point at which a result counts as significantly outside its range, so
          only the reference range itself is shaded here. Each marker’s own full shading is on its detail page.
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
