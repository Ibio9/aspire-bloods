import { Suspense, lazy, type ComponentProps } from 'react';
import type { TrendChart as TrendChartImpl } from './TrendChart';
import type { MultiTrendChart as MultiTrendChartImpl } from './MultiTrendChart';

/**
 * ---------------------------------------------------------------------------
 * THE CHARTING LIBRARY IS THE LARGEST SINGLE THING IN THIS PRODUCT, AND MOST
 * PEOPLE NEVER SEE A CHART.
 * ---------------------------------------------------------------------------
 *
 * Measured on the pre-split build: recharts is 260 kB of the 993 kB bundle, and
 * with everything it drags in — d3-scale, d3-shape, d3-time-format, d3-color,
 * d3-array, d3-interpolate, d3-format, d3-path, internmap, victory-vendor,
 * decimal.js-light, es-toolkit, eventemitter3, react-is, and (recharts 3 keeps
 * its internal state in a store) redux, react-redux, reselect, immer,
 * redux-thunk and use-sync-external-store — 386 kB, or 39% of the whole script.
 *
 * It is reachable from exactly two screens: a marker's own page, and the
 * compare view inside Results. Sign-in, Overview, the report and by-marker
 * views, Documents, Understanding results, Account and the entire clinician
 * console draw no chart at all. So it is imported here and nowhere else, and
 * the two call sites take these wrappers instead of the components themselves.
 *
 * WHY THE PROPS ARE TYPED THROUGH `import type`. A type-only import is erased
 * before Rollup sees the module graph, so this file names TrendChart's own prop
 * types without creating an edge that would pull the chunk back into the parent
 * — which is the failure mode that makes a lazy boundary silently do nothing.
 */

const TrendChartLazy = lazy(() => import('./TrendChart').then((m) => ({ default: m.TrendChart })));
const MultiTrendChartLazy = lazy(() => import('./MultiTrendChart').then((m) => ({ default: m.MultiTrendChart })));

/**
 * The plot's own space, held empty.
 *
 * Not a spinner and not a skeleton with shimmering bars: the chart lands within
 * a frame or two on a warm cache and a placeholder that animates for 80ms reads
 * as a fault. What it must do is reserve the height, because the chart card
 * sets the height of the row on the marker page — without it the card beside it
 * would collapse and rebound as the chunk arrives.
 */
function ChartSpace({ tall }: { tall?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`w-full ${tall ? 'h-64 sm:h-80 lg:h-[22rem]' : 'h-72 sm:h-80'}`}
    >
      <span className="sr-only">Loading the trend chart…</span>
    </div>
  );
}

export function TrendChart(props: ComponentProps<typeof TrendChartImpl>) {
  return (
    <Suspense fallback={<ChartSpace tall={props.height === 'tall'} />}>
      <TrendChartLazy {...props} />
    </Suspense>
  );
}

export function MultiTrendChart(props: ComponentProps<typeof MultiTrendChartImpl>) {
  return (
    <Suspense fallback={<ChartSpace />}>
      <MultiTrendChartLazy {...props} />
    </Suspense>
  );
}
