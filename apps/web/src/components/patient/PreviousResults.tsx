import { useState } from 'react';
import { formatDate, type MarkerStatusInput } from '@aspire-bloods/shared';
import { StatusBadge } from '../ui/StatusBadge';

/**
 * How many prior results the list shows before it offers the rest.
 *
 * Three, and the number is load-bearing rather than a taste. This list sets the
 * height of the marker page's left card, the two cards in that row are the same
 * height as each other, and the pair has to fit on a 1280 × 800 laptop with the
 * page header visible. At four rows in the two-line arrangement it overflowed
 * that by 28px. Three answers the question the list is for — "what was it last
 * time" — and "View all N" is one press away for anybody who wants the rest.
 */
export const PREVIOUS_SHOWN = 3;

/** The minimum this list is ever rendered at — the narrow arrangement's floor. */
export const PREVIOUS_RESULTS_MIN_WIDTH = '17rem';

export interface PreviousResultPoint {
  reportId: string;
  sampleDate: string;
  value: number;
  unit: string;
  status: MarkerStatusInput;
}

/**
 * The history under the range bar — every result for this marker before the
 * latest one, newest first.
 *
 * It exists because the left card had a large empty area below the bar and the
 * data to fill it was already on the page. It is not a second chart: the
 * question it answers is "what was it last time", which is a lookup, and a
 * lookup wants a column of dates against a column of values rather than a
 * shape. The values are mono, tabular and right-aligned for exactly that
 * reason — read down, the numbers line up.
 *
 * ─── WHY EACH ROW IS A GRID ───────────────────────────────────────────────
 *
 * It was a flex row: `justify-between`, a `shrink-0` date, and a `min-w-0`
 * group holding the value and the status badge. That arrangement is correct
 * while the content fits and silently catastrophic when it does not — `min-w-0`
 * gives the value group permission to shrink past its own contents, so its
 * children paint straight out of it and over the date beside them. On the
 * marker page's left card, which is 40% of the row, that is not an edge case:
 * "19 August 2026", "102 mmol/L" and "Significantly above range" have never
 * fitted on one 384px line, so the date and the value were drawn on top of each
 * other for every out-of-range marker, and a long unit like 10^9/L pushed the
 * whole row past the card's own edge.
 *
 * A grid track cannot be overflowed by a sibling. The columns are declared with
 * minimums measured against the longest realistic content in each (see
 * `.value-row` in globals.css), the list itself is the container query context
 * so every row switches arrangement together, and where three columns will not
 * fit the row becomes two clean lines rather than one overlapping one. Nothing
 * is absolutely positioned and nothing carries a negative margin.
 *
 * The trend arrives oldest-first (see getMarkerTrendForPatient's orderBy), so
 * the last entry is the value already printed at the top of the card, and it is
 * dropped here rather than repeated.
 *
 * No history is stated in words rather than left as an empty box. A patient
 * with one result has not lost anything; they simply have one result.
 */
export function PreviousResults({
  trend,
  className = '',
}: {
  trend: PreviousResultPoint[];
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const previous = [...trend].slice(0, -1).reverse();
  const shown = expanded ? previous : previous.slice(0, PREVIOUS_SHOWN);

  return (
    <div className={`border-t border-taupe pt-5 ${className}`}>
      <p className="eyebrow mb-3">Previous results</p>
      {previous.length === 0 ? (
        <p className="text-sm text-espresso/80">No previous results yet</p>
      ) : (
        <>
          <ul className="value-rows flex flex-col">
            {shown.map((point) => (
              <li
                key={`${point.reportId}-${point.sampleDate}`}
                // `last:border-transparent`, not `last:border-b-0`: removing the
                // border removes 1px of height from the final row, and a list
                // whose last row is a pixel shorter than the others is a list
                // whose rows are not uniform. The rule is still invisible.
                className="value-row border-b border-taupe/60 py-1.5 last:border-transparent"
              >
                <span className="numeric text-xs text-espresso/80">{formatDate(point.sampleDate)}</span>
                {/* The value and its unit are one cell, so the unit can never
                    be separated from the number it belongs to by a wrap. */}
                <span className="value-row-value numeric tabular text-sm font-medium text-espresso">
                  {point.value}
                  <span className="ml-1 font-normal text-espresso/80">{point.unit}</span>
                </span>
                {/* The same chevron and the same word as everywhere else, so
                    the column still reads in greyscale. */}
                <span className="value-row-status">
                  <StatusBadge status={point.status} className="!text-xs" />
                </span>
              </li>
            ))}
          </ul>
          {previous.length > PREVIOUS_SHOWN && (
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              className="mt-3 rounded-input text-xs font-medium text-bronze-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze"
            >
              {expanded ? 'Show fewer' : `View all ${previous.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
