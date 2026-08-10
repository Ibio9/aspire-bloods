import { useId } from 'react';
import { CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  formatDate,
  brand,
  scales,
  chart as chartTokens,
  statusPaint,
  bandGradientStops,
  severityThresholdFor,
  BAND_LABEL,
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
 * range: 0 is that marker's range floor, 1 is its ceiling, and the shared
 * taupe band between them is "inside the usual range" for all series at once.
 * That's the comparison a patient actually wants — "my ferritin climbed
 * while my haemoglobin held steady" — without ever implying the two numbers
 * are on the same scale. Real values and units stay in the tooltip and the
 * legend, which is where they mean something.
 *
 * Normalisation is per point, not per series, so a reference range that
 * changes between sources moves the point correctly rather than being
 * silently held against a stale range.
 *
 * THE BANDS. 0 to 1 is every series' own reference range, so that band is
 * green and it is exactly right for all of them at once. Outside it, the
 * yellow and red bands can only be drawn when every series agrees on where
 * significantly-out begins in normalised terms — which is the usual case,
 * because the threshold is a multiple of each marker's own range width and
 * therefore lands at the same normalised position for every marker on the
 * default. Where a marker overrides it with an absolute delta and the series
 * disagree, the outer bands are simply not drawn rather than drawn wrong, and
 * the key says which of the two happened. A shared axis is only allowed to
 * shade what is shared.
 *
 * Series identity stays with the line's colour, dash and marker shape — that
 * is what says WHICH marker a point belongs to, and status must not take it
 * over. Status here is carried by the word in the tooltip and the legend,
 * coloured to match the rest of the product.
 */

/** Bronze, espresso, and a deep bronze shade — palette only. Each series also carries a distinct
 * dash pattern and dot shape, so the chart is readable in greyscale and to a colour-blind reader. */
const SERIES_STYLES = [
  { color: brand.bronze, dash: undefined, shape: 'circle' as const, dashLabel: 'solid line, round markers' },
  { color: brand.espresso, dash: '7 4', shape: 'square' as const, dashLabel: 'dashed line, square markers' },
  { color: scales.bronze[800], dash: '2 4', shape: 'diamond' as const, dashLabel: 'dotted line, diamond markers' },
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

function SeriesDot({ cx, cy, shape, color }: { cx?: number; cy?: number; shape: 'circle' | 'square' | 'diamond'; color: string }) {
  if (cx == null || cy == null) return null;
  const common = { fill: color, stroke: brand.white, strokeWidth: 1.4 };
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

function ChartTooltip({ active, payload, series }: { active?: boolean; payload?: unknown[]; series: TrendSeries[] }) {
  if (!active || !payload?.length) return null;
  const row = (payload[0] as { payload: Row }).payload;

  return (
    <div className="rounded-card border border-taupe bg-white px-3.5 py-2.5 text-xs shadow-card">
      {/* The row's own sampleDate, not the axis label — the axis is a time
          scale now, so its label is an epoch number. */}
      <p className="font-medium text-espresso">{formatDate(row.sampleDate)}</p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {series.map((s, i) => {
          const raw = row[`${s.markerId}__value`];
          const st = row[`${s.markerId}__status`] as MarkerStatus | undefined;
          if (raw == null) return null;
          return (
            <li key={s.markerId} className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: SERIES_STYLES[i % 3].color }} />
              <span className="tabular text-espresso">
                {s.name}: {raw}
                {/* The status word carries its own state's colour, as it does
                    everywhere else. The series dot to its left stays the
                    series' colour — that says which marker, not how it is. */}
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
  // The legend and the accessible summary both read points[0] and the last
  // point, so a series with none takes the whole screen down. The server no
  // longer sends one; this is the belt to that braces.
  const series = input.filter((s) => s.points.length > 0);
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
      row[`${s.markerId}__status`] = point.status;
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

  // Green across the shared reference range, then yellow and red either side
  // of it at the shared threshold. Clipped to the domain, and dropped entirely
  // where it would be zero-height.
  const bands: { status: MarkerStatus; y1: number; y2: number }[] = [{ status: 'IN_RANGE', y1: 0, y2: 1 }];
  if (sharedThreshold !== null) {
    bands.push(
      { status: 'LOW', y1: -sharedThreshold, y2: 0 },
      { status: 'HIGH', y1: 1, y2: 1 + sharedThreshold },
      { status: 'SIGNIFICANT_LOW', y1: domainMin, y2: -sharedThreshold },
      { status: 'SIGNIFICANT_HIGH', y1: 1 + sharedThreshold, y2: domainMax },
    );
  }
  const shownBands = bands
    .map((b) => ({ ...b, y1: Math.max(domainMin, b.y1), y2: Math.min(domainMax, b.y2) }))
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
      <div
        className="tabular h-[340px] w-full"
        role="img"
        aria-label={`Comparison chart. Each marker is plotted against its own reference range, where the shaded band is that marker's usual range. ${summary}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 12, right: 16, left: 4, bottom: 0 }}>
            <CartesianGrid stroke={chartTokens.gridline} strokeOpacity={0} />
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
              // Inter; the tabular figures are inherited from the `tabular`
              // class on the wrapper, since Recharts' tick prop type has no
              // fontVariantNumeric.
              tick={{ fontSize: 12, fill: chartTokens.axisText, fontFamily: 'Inter, sans-serif' }}
              axisLine={{ stroke: chartTokens.axisLine }}
              tickLine={false}
              minTickGap={16}
              interval="preserveStartEnd"
            />
            <defs>
              {shownBands.map((b) => {
                const [atLowEnd, atHighEnd] = bandGradientStops(b.status);
                return (
                  <linearGradient key={b.status} id={`${gradId}-${b.status}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={atHighEnd} />
                    <stop offset="100%" stopColor={atLowEnd} />
                  </linearGradient>
                );
              })}
            </defs>
            <YAxis
              domain={[domainMin, domainMax]}
              ticks={[0, 1]}
              tickFormatter={(v: number) => (v === 0 ? 'Range low' : 'Range high')}
              tick={{ fontSize: 11, fill: chartTokens.axisText, fontFamily: 'Inter, sans-serif' }}
              axisLine={false}
              tickLine={false}
              width={74}
            />
            {shownBands.map((b) => (
              <ReferenceArea
                key={b.status}
                y1={b.y1}
                y2={b.y2}
                fill={`url(#${gradId}-${b.status})`}
                // See the same line in TrendChart: ReferenceArea's fillOpacity
                // defaults to 0.5, which halves a band token that was already
                // calibrated to be applied whole. That is what made every
                // chart in the product read as grey while the cards, the
                // counts strip and the summary bars read correctly — those
                // apply the same tokens as Tailwind classes, where nothing
                // silently halves them.
                fillOpacity={1}
                strokeOpacity={0}
                ifOverflow="hidden"
              />
            ))}
            {/* The two boundaries every series shares, drawn and labelled on
                the axis ("Range low" / "Range high") so they are locatable
                without the colour. */}
            <ReferenceLine y={0} stroke={chartTokens.referenceEdge} />
            <ReferenceLine y={1} stroke={chartTokens.referenceEdge} />
            {sharedThreshold !== null && (
              <ReferenceLine y={-sharedThreshold} stroke={chartTokens.referenceEdge} strokeOpacity={0.55} strokeDasharray="3 3" />
            )}
            {sharedThreshold !== null && (
              <ReferenceLine y={1 + sharedThreshold} stroke={chartTokens.referenceEdge} strokeOpacity={0.55} strokeDasharray="3 3" />
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
                  type="monotone"
                  dataKey={s.markerId}
                  name={s.name}
                  stroke={connected ? style.color : 'none'}
                  strokeWidth={2}
                  strokeDasharray={style.dash}
                  connectNulls={connected}
                  dot={<SeriesDot shape={style.shape} color={style.color} />}
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
              <svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true" className="shrink-0">
                <line x1="0" y1="5" x2="26" y2="5" stroke={style.color} strokeWidth="2" strokeDasharray={style.dash} />
                {style.shape === 'circle' && <circle cx="13" cy="5" r="4" fill={style.color} stroke={brand.white} strokeWidth="1.2" />}
                {style.shape === 'square' && <rect x="9.5" y="1.5" width="7" height="7" fill={style.color} stroke={brand.white} strokeWidth="1.2" />}
                {style.shape === 'diamond' && (
                  <rect x="9.6" y="1.6" width="6.8" height="6.8" transform="rotate(45 13 5)" fill={style.color} stroke={brand.white} strokeWidth="1.2" />
                )}
              </svg>
              <span className="text-espresso">
                <span className="font-medium">{s.name}</span>{' '}
                <span className="tabular text-espresso/80">
                  latest {last.value} {s.unit},{' '}
                  <span style={{ color: statusColor(last.status as MarkerStatus) }}>
                    {statusLabel(last.status as MarkerStatus)}
                  </span>
                </span>
                <span className="sr-only"> ({style.dashLabel})</span>
              </span>
            </li>
          );
        })}
      </ul>

      {/* What the shading is, named. Same rule as the single-marker chart: a
          coloured region with no written entry is colour carrying meaning on
          its own, which this product does not do. */}
      <ul className="mt-3 flex flex-col gap-2 text-xs text-espresso/80 sm:flex-row sm:flex-wrap sm:gap-x-6">
        {shownBands.map((b) => (
          <li key={b.status} className="flex items-center gap-2">
            <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true" className="shrink-0">
              <rect x="0" y="2" width="18" height="8" fill={statusPaint(b.status).band} />
              <line x1="0" y1="2" x2="18" y2="2" stroke={chartTokens.referenceEdge} strokeWidth="1" strokeOpacity="0.85" />
            </svg>
            {BAND_LABEL[b.status]}
          </li>
        ))}
      </ul>
      {sharedThreshold === null && (
        <p className="mt-3 text-sm leading-relaxed text-espresso/80">
          These markers don't share a common point at which a result counts as significantly outside its range, so
          only the reference range itself is shaded here. Each marker's own full shading is on its detail page.
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
          from sources we can't directly convert between, so those points are shown separately rather than joined into a
          line. They are still plotted against their own reference range.
        </p>
      )}
    </div>
  );
}
