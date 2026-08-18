import { chart as chartTokens } from '@aspire-bloods/shared';
import { seriesStyle } from '../../lib/chartGeometry';

/**
 * The mark for one series, at the size it is printed beside a name.
 *
 * ── ONE DRAWING, ONE FILE (Aug 2026) ──────────────────────────────────────
 *
 * There were two copies of this: `SeriesSwatch` inside MultiTrendChart and
 * `SeriesMark` inside CompareView, whose own comment said it was "kept in step
 * with SERIES_STYLES in MultiTrendChart by being the same three shapes in the
 * same order". They had already drifted - the chart's filled its marks with
 * `--c-chart-surface` and the view's with `--c-chart-plot-surface`, which is a
 * light off-white in both themes, so on a dark card the same mark had two
 * different interiors two inches apart.
 *
 * ⚠ IT MUST NOT IMPORT RECHARTS, AND THAT IS A BUNDLE BOUNDARY RATHER THAN A
 * PREFERENCE. CompareView is an ordinary route chunk and reaches the charts
 * only through LazyCharts; a static import of anything that pulls recharts in
 * would put 386 kB of chart library on a screen before anybody has ticked a
 * marker. See the note on LazyCharts.
 *
 * ⚠ THE SHAPE IS A LEGEND TOKEN, NOT A PLOTTED MARK (Aug 2026). The chart used
 * to draw this same circle, square or diamond at every point; it draws a white
 * spark at every point now, exactly as the single-marker trend chart does, and
 * the shape survives here as the thing that ties a chip, a card, a legend row
 * and a tooltip line to one line on the plot. What the plot itself draws that
 * this swatch also draws is the DASH, which is why the dash is the half of it
 * that must never be dropped.
 *
 * It carries no status and cannot: `chart.line` is the product's neutral series
 * colour, and the state is on the line itself and in the status word beside
 * every one of these marks.
 */
export function SeriesMark({ index, className = '' }: { index: number; className?: string }) {
  const style = seriesStyle(index);
  const common = { fill: chartTokens.surface, stroke: chartTokens.line, strokeWidth: 1.4 };
  return (
    <svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true" className={`shrink-0 ${className}`}>
      <line x1="0" y1="5" x2="26" y2="5" stroke={chartTokens.line} strokeWidth="2" strokeDasharray={style.dash} />
      {style.shape === 'circle' && <circle cx="13" cy="5" r="4" {...common} />}
      {style.shape === 'square' && <rect x="9.5" y="1.5" width="7" height="7" {...common} />}
      {style.shape === 'diamond' && (
        <rect x="9.6" y="1.6" width="6.8" height="6.8" transform="rotate(45 13 5)" {...common} />
      )}
    </svg>
  );
}
