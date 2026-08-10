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
 * The one difference that is real is kept: the marker list knows a marker's
 * history and draws a sparkline of it, and a single report has no history to
 * draw. That arrives as `footer` rather than being baked in here.
 *
 * Hierarchy, loudest first: the value, then the range, then the status. The
 * name is an eyebrow above the value rather than a heading, because on a page
 * of forty of these the thing being scanned is the number and its state.
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
 * 13.5rem is the floor at which the hero number, its unit and the reference
 * range all still sit on their own lines without hyphenating.
 */
export const MARKER_GRID_CLASS = 'grid grid-cols-[repeat(auto-fill,minmax(13.5rem,1fr))] gap-5';

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
  /**
   * Null when this result has no position on its reference range. The card then
   * shows the value and says so in words, with no tint, no shape mark and no
   * place in any count. It is never rendered as "In range".
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
  /** A line under the name — the panel and sample date, on the marker list. */
  meta?: ReactNode;
  /** The catalogue's one-line gloss, on a report. Clamped: this is a card, not the marker's page. */
  note?: string | null;
  /** The sparkline, on the marker list. Absent on a report, which has one sample. */
  footer?: ReactNode;
}) {
  // Narrowed once, and every "does this result have a status" question on the
  // card asks this rather than comparing against null.
  const status = asMarkerStatus(m.status);
  return (
    <Link
      to={`/markers/${m.markerId}`}
      state={navState}
      className="block h-full rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze"
    >
      {/* The tint is a surface wash and nothing else: the border, the type and
          the shadow are the ordinary card's. The chevron shape and the word in
          StatusBadge below still carry the status on their own, in greyscale
          and to a colourblind reader. */}
      <Card interactive tint={status} padding="tight" className="flex h-full flex-col">
        {/* break-words, because "Anti-Thyroid Peroxidase Antibodies" in a
            13.5rem column has nowhere to go otherwise. */}
        <p className="eyebrow break-words leading-snug">{m.name}</p>
        {meta && <p className="mt-1.5 text-xs leading-snug text-espresso/80">{meta}</p>}
        {/* flex-wrap: a textual result ("Not detected") at display size must
            wrap under itself, not push the unit out of the card. */}
        <p className="tabular mt-3 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-4xl font-semibold leading-none text-espresso">
          <span className="break-words">{m.valueText ?? m.value}</span>
          <span className="text-sm font-normal text-espresso/80">{m.unit}</span>
        </p>
        {/* The lab's range and the optimal band are two different things and
            are labelled as two different things. Only the first decides the
            status badge below.
            A qualitative result ("Not detected") has no numeric range behind
            it, and the row for one used to read "Lab reference range 0–0" —
            which is a half-populated row saying something false. Where there
            is no range, the line is simply absent.
            The range is also only shown where it was actually applied. A result
            with no status was not compared against it, so printing the range
            beside the value would invite the reader to do the comparison
            themselves — which is the thing nobody could do. */}
        {status !== null && m.referenceHigh > m.referenceLow && (
          <p className="tabular mt-2.5 text-xs leading-snug text-espresso/80">
            Lab reference range {m.referenceLow}–{m.referenceHigh} {m.unit}
          </p>
        )}
        {status === null && <p className="mt-2.5 text-xs leading-snug text-espresso/80">{NO_STATUS_LABEL}</p>}
        {m.optimal && (
          <p className="tabular mt-1 text-xs leading-snug text-espresso/80">
            {optimalRangeLabel(m.optimal)}
            {optimalStatusLabel(m.optimal) && <span> · {optimalStatusLabel(m.optimal)!.toLowerCase()}</span>}
          </p>
        )}
        {/* Top-aligned, deliberately, and NOT pushed to the card's floor with
            mt-auto. Grid rows are as tall as their tallest card, and a marker
            whose name runs to three lines sets that height for everything
            beside it — so a floored status block opened a hole in the middle of
            every shorter card in the row, which is the same complaint about
            empty space these cards were reshaped to answer. Slack at the bottom
            of a short card reads as nothing at all. */}
        <div className="mt-4">
          {/* Absent, not blank, where there is no status: the words are already
              above in place of the range, and the tint is not applied at all. */}
          {status !== null && <StatusBadge status={status} />}
          {note && <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-espresso/90">{note}</p>}
          {footer && <div className="mt-3">{footer}</div>}
        </div>
      </Card>
    </Link>
  );
}
