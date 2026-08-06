import { CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDate, brand, scales, type MarkerStatus } from '@aspire-bloods/shared';
import { statusLabel } from '../../lib/markerCopy';
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
  [key: string]: string | number | undefined;
}

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

function ChartTooltip({ active, label, payload, series }: { active?: boolean; label?: string; payload?: unknown[]; series: TrendSeries[] }) {
  if (!active || !payload?.length) return null;
  const row = (payload[0] as { payload: Row }).payload;

  return (
    <div className="rounded-card border border-taupe bg-white px-3.5 py-2.5 text-xs shadow-card">
      <p className="font-medium text-espresso">{label ? formatDate(label) : ''}</p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {series.map((s, i) => {
          const raw = row[`${s.markerId}__label`];
          if (raw == null) return null;
          return (
            <li key={s.markerId} className="flex items-center gap-2">
              <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: SERIES_STYLES[i % 3].color }} />
              <span className="tabular text-espresso">
                {s.name}: {raw}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function MultiTrendChart({ series }: { series: TrendSeries[] }) {
  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.sampleDate)))].sort();

  const rows: Row[] = dates.map((sampleDate) => {
    const row: Row = { sampleDate };
    for (const s of series) {
      const point = s.points.find((p) => p.sampleDate === sampleDate);
      if (!point) continue;
      row[s.markerId] = normalise(point.value, point.referenceLow, point.referenceHigh);
      row[`${s.markerId}__label`] = `${point.value} ${s.unit} — ${statusLabel(point.status)}`;
    }
    return row;
  });

  const positions = rows.flatMap((r) => series.map((s) => r[s.markerId]).filter((v): v is number => typeof v === 'number'));
  const min = Math.min(0, ...positions);
  const max = Math.max(1, ...positions);
  const pad = (max - min) * 0.15 || 0.15;

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
        className="h-[340px] w-full"
        role="img"
        aria-label={`Comparison chart. Each marker is plotted against its own reference range, where the shaded band is that marker's usual range. ${summary}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 12, right: 16, left: 4, bottom: 0 }}>
            <CartesianGrid stroke={brand.taupe} strokeOpacity={0} />
            <XAxis
              dataKey="sampleDate"
              tickFormatter={formatAxisDate}
              tick={{ fontSize: 12, fill: brand.espresso }}
              axisLine={{ stroke: brand.taupe }}
              tickLine={false}
            />
            <YAxis
              domain={[min - pad, max + pad]}
              ticks={[0, 1]}
              tickFormatter={(v: number) => (v === 0 ? 'Range low' : 'Range high')}
              tick={{ fontSize: 11, fill: brand.espresso }}
              axisLine={false}
              tickLine={false}
              width={74}
            />
            <ReferenceArea y1={0} y2={1} fill={brand.taupe} fillOpacity={0.35} strokeOpacity={0} />
            <ReferenceLine y={0} stroke={brand.taupe} />
            <ReferenceLine y={1} stroke={brand.taupe} />
            <Tooltip content={<ChartTooltip series={series} />} cursor={{ stroke: brand.taupe, strokeWidth: 1 }} />
            {series.map((s, i) => {
              const style = SERIES_STYLES[i % SERIES_STYLES.length];
              return (
                <Line
                  key={s.markerId}
                  type="monotone"
                  dataKey={s.markerId}
                  name={s.name}
                  stroke={style.color}
                  strokeWidth={2}
                  strokeDasharray={style.dash}
                  connectNulls
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
                  — latest {last.value} {s.unit}, {statusLabel(last.status as MarkerStatus)}
                </span>
                <span className="sr-only"> ({style.dashLabel})</span>
              </span>
            </li>
          );
        })}
      </ul>

      {series.some((s) => !s.comparable) && (
        <p className="mt-4 text-sm leading-relaxed text-espresso/80">
          One or more of these markers has results from sources we can't directly convert between. Those points are
          still shown against their own reference range, but treat small differences between them with care.
        </p>
      )}
    </div>
  );
}
