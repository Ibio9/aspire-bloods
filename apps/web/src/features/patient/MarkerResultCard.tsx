import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  asMarkerStatus,
  NO_STATUS_LABEL,
  type MarkerStatusInput,
  type OptimalRangeDTO,
} from '@aspire-bloods/shared';
import { Card } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { MiniRangeBar } from '../../components/ui/RangeBar';
import { optimalRangeLabel, optimalStatusLabel } from '../../lib/markerCopy';
import type { MarkerNavState } from './markerNavState';

/**
 * One measured result, and the only way a measured result is drawn anywhere in
 * Results.
 *
 * Both arrangements use this: the markers on one opened report, and the every-
 * marker-ever list. They are the same object at two scopes, and they used to be
 * two components that had quietly diverged — a card in a three-column grid on
 * one screen, a four-column full-width row on the other, with the value at
 * different sizes, the range under different words and the status in a
 * different place. Nothing about "this report's ferritin" and "my ferritin"
 * justifies two visual languages.
 *
 * THE LAYOUT, top to bottom, and the order is the point:
 *
 *   1. The marker's name, as an uppercase eyebrow. The only text above the bar.
 *   2. The range bar, with the result's position marked by a pointer above it.
 *   3. Everything else, in the order somebody reads it: the value with its
 *      unit, the status chevron and word, the lab's reference range, then the
 *      panel and the date.
 *
 * The bar is second because it is the fastest thing on the card to read. On a
 * page of forty of these, "where does this sit" is answered by a shape before
 * any number is parsed, and the number underneath then says exactly where.
 *
 * WHAT THE BAR REPLACED. A mini sparkline used to sit at the foot of the card
 * on the marker list. It answered a question about history at a size too small
 * to answer it honestly, and it was absent entirely on a report — so the two
 * screens ended up different shapes for no reason a reader could name. The bar
 * is on both, because every measured result has a position, and the history is
 * one click away on the marker's own page where there is room to plot it.
 */

/**
 * The grid. `auto-fill` with a floor rather than a column count at each
 * breakpoint, because the thing that decides how many cards fit is the width of
 * the CONTENT COLUMN, and that is not a function of the viewport alone — the
 * patient sidebar collapses from 288px to 84px, which is more than a whole
 * column's worth. Breakpoint-counted columns got that wrong in both directions:
 * three tall thin cards on a collapsed 1280 that had room for four, and 178px
 * cards at exactly 1024 where two would have read properly.
 *
 * 15rem is the floor at which the value, its unit and the reference range all
 * still sit on their own lines without hyphenating — a step up from 13.5rem,
 * because the bar needs enough width for its segments to be told apart and the
 * panel/date stack below it is three lines rather than one.
 */
export const MARKER_GRID_CLASS = 'grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-5';

/** What the card needs, and the intersection of what both views already carry. */
export interface MarkerCardResult {
  markerId: string;
  name: string;
  /**
   * Exactly one of value/valueText is set — valueText carries a textual lab
   * result ("< 0.6", "Not detected") verbatim.
   */
  value: number | null;
  valueText?: string | null;
  unit: string;
  referenceLow: number;
  referenceHigh: number;
  /** Where significantly-out begins for this marker — the bar's outer segments start here. */
  severityThreshold?: number | null;
  /**
   * Null when this result has no position on its reference range. The card then
   * shows the value and says so in words, with no tint, no bar, no shape mark
   * and no place in any count. It is never rendered as "In range".
   *
   * `MarkerStatusInput` rather than `MarkerStatus | null`: absent and
   * unrecognised are the same fact as null here, and writing the guard as
   * `!== null` is exactly what let the first of those through to a token
   * lookup. See asMarkerStatus.
   */
  status: MarkerStatusInput;
  /** Null for the majority of markers; nothing about optimal is shown for those. */
  optimal?: OptimalRangeDTO | null;
}

/**
 * The panel, the date and the result count — ONE PER LINE.
 *
 * They used to be middot-joined onto a single line ("Signature · 3 February
 * 2026 · 3 results"), which in a 15rem column wrapped wherever the browser
 * felt like and split the date across two lines about a third of the time.
 * Three facts, three lines, and the date on its own is legible as a date
 * rather than as the middle of a sentence.
 *
 * A structured object rather than the pre-joined string it used to be, so the
 * card decides the arrangement and neither view can quietly go back to
 * inventing its own.
 */
export interface MarkerCardMeta {
  /** Null on a report with no catalogue panel behind it — panels are optional. */
  panelName?: string | null;
  /** Already formatted for display — the card sets it in mono and nothing else. */
  sampleDate: string;
  /** Absent on a report, which has one sample and so nothing to count. */
  resultCount?: number;
  /** The formatted date this result was corrected after release, where it was. */
  amendedDate?: string | null;
}

export function MarkerResultCard({
  marker: m,
  navState,
  meta,
  note,
  footer,
}: {
  marker: MarkerCardResult;
  /** Prev/next on the marker page walks the list this card came from. */
  navState?: MarkerNavState;
  /** The provenance stack under the value — one item per line. */
  meta?: MarkerCardMeta;
  /** The catalogue's one-line gloss, on a report. Clamped: this is a card, not the marker's page. */
  note?: string | null;
  /** Anything a view needs to add below the rest. */
  footer?: ReactNode;
}) {
  // Narrowed once, and every "does this result have a status" question on the
  // card asks this rather than comparing against null.
  const status = asMarkerStatus(m.status);
  const hasRange = m.referenceHigh > m.referenceLow;
  return (
    <Link
      to={`/markers/${m.markerId}`}
      state={navState}
      className="block h-full rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze"
    >
      {/* The tint is a surface wash and nothing else: the border, the type and
          the shadow are the ordinary card's, and the border is the warm neutral
          hairline rather than anything in the status hue. The pointer, the
          chevron and the word below still carry the status on their own, in
          greyscale and to a colourblind reader. */}
      <Card interactive tint={status} padding="tight" className="flex h-full flex-col">
        {/* The only text above the bar. break-words, because "Anti-Thyroid
            Peroxidase Antibodies" in a 15rem column has nowhere else to go. */}
        <p className="eyebrow break-words leading-snug">{m.name}</p>

        {/* A textual result has no position on a numeric scale, and a result
            with no status was never placed on one — the bar would be a guess
            in both cases, so it is simply not drawn and the card falls back to
            the words below. */}
        {m.value !== null && status !== null && hasRange && (
          <div className="mt-4">
            <MiniRangeBar
              value={m.value}
              low={m.referenceLow}
              high={m.referenceHigh}
              status={status}
              severityThreshold={m.severityThreshold}
            />
          </div>
        )}

        {/* flex-wrap: a textual result ("Not detected") at display size must
            wrap under itself, not push the unit out of the card. */}
        <p className="numeric tabular mt-4 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xl font-semibold leading-none text-espresso">
          <span className="break-words">{m.valueText ?? m.value}</span>
          <span className="text-sm font-normal text-espresso/80">{m.unit}</span>
        </p>

        {/* Absent, not blank, where there is no status: the words are below in
            place of the range, and no tint is applied to the card at all. */}
        {status !== null && <StatusBadge status={status} className="mt-2.5" />}

        {/* The lab's range and the optimal band are two different things and
            are labelled as two different things. Only the first decides the
            status above it.
            A qualitative result ("Not detected") has no numeric range behind
            it, and the row for one used to read "Lab reference range 0–0" —
            a half-populated row saying something false. Where there is no
            range, the line is simply absent.
            The range is also only shown where it was actually applied. A result
            with no status was not compared against it, so printing the range
            beside the value would invite the reader to do the comparison
            themselves — which is the thing nobody could do. */}
        {status !== null && hasRange && (
          <p className="mt-2.5 text-xs leading-snug text-espresso/80">
            Lab reference range{' '}
            <span className="numeric">
              {m.referenceLow}–{m.referenceHigh} {m.unit}
            </span>
          </p>
        )}
        {status === null && <p className="mt-2.5 text-xs leading-snug text-espresso/80">{NO_STATUS_LABEL}</p>}
        {m.optimal && (
          <p className="tabular mt-1 text-xs leading-snug text-espresso/80">
            {optimalRangeLabel(m.optimal)}
            {optimalStatusLabel(m.optimal) && <span> · {optimalStatusLabel(m.optimal)!.toLowerCase()}</span>}
          </p>
        )}

        {/* Panel, date and count — one per line, the date always on its own.
            Top-aligned, deliberately, and NOT pushed to the card's floor with
            mt-auto. Grid rows are as tall as their tallest card, and a marker
            whose name runs to three lines sets that height for everything
            beside it — so a floored block opened a hole in the middle of every
            shorter card in the row, which is the same complaint about empty
            space these cards were reshaped to answer. Slack at the bottom of a
            short card reads as nothing at all. */}
        {meta && (
          <div className="mt-4 flex flex-col gap-0.5 text-xs leading-snug text-espresso/80">
            {meta.panelName && <span>{meta.panelName}</span>}
            {meta.sampleDate && <span className="numeric">{meta.sampleDate}</span>}
            {/* The NUMBER is mono, the noun beside it is not — mono is for
                numeric data, and "results" is a word. Same for the amendment
                line: the date is data, "Amended" is prose. */}
            {meta.resultCount !== undefined && meta.resultCount > 1 && (
              <span>
                <span className="numeric">{meta.resultCount}</span> results
              </span>
            )}
            {meta.amendedDate && (
              <span>
                Amended <span className="numeric">{meta.amendedDate}</span>
              </span>
            )}
          </div>
        )}

        {note && <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-espresso/90">{note}</p>}
        {footer && <div className="mt-3">{footer}</div>}
      </Card>
    </Link>
  );
}
