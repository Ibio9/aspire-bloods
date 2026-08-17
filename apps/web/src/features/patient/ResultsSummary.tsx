import type { ReactNode } from 'react';
import { countable, type MarkerStatus, type MarkerStatusInput } from '@aspire-bloods/shared';
import {
  filterCountLabel,
  statusBarClass,
  statusLabel,
  statusPlateClass,
  STRIP_FILTER,
  STRIP_STATE,
  type StatusFilter,
} from '../../lib/markerCopy';
import { StatusBadge } from '../../components/ui/StatusBadge';

/**
 * How a set of results is summarised: the counts strip over a whole report, and
 * the status breakdown that sits in a health-area heading.
 *
 * Both count MEASURED markers only. A genetic risk indicator has no reference
 * range, so it cannot be in range or out of it, and including one in "42 in
 * range" would be counting a different kind of thing. The same goes for a food
 * sensitivity level and a microbiome proportion — all three live in their own
 * sections below the grid, with their own framing.
 *
 * Neither element is a score. There is no total, no percentage healthy, no
 * grade: counts and a proportion bar, which is a description of the report
 * rather than a verdict on the person.
 *
 * WHAT USED TO BE HERE. A "By health area" block of proportion bars, above the
 * marker grid, each bar opening in place to show that area's markers. It said
 * the same thing twice: the bars were a summary of the areas, and the grid
 * below them was already grouped by area with all the same cards in it. The
 * breakdown was the part worth keeping, so it moved into the group headings —
 * where it sits directly above the markers it describes, rather than several
 * screens above them.
 */

export interface SummaryMarker {
  markerId: string;
  /**
   * Null where this result has no position on its reference range. Both
   * elements below drop those entirely rather than counting them: a tile
   * saying "3 in range" that includes a marker nobody compared to a range is
   * the same false statement the status column itself used to make, moved into
   * the summary. See countable() in packages/shared, which now also treats a
   * status this build has no entry for as no status — a phantom key would
   * otherwise land in the tallies below as `NaN`.
   */
  status: MarkerStatusInput;
  value: number | null;
  valueText?: string | null;
  categoryKeys?: string[];
}

/**
 * ── THREE SEGMENTS, NOT FIVE (Aug 2026) ────────────────────────────────────
 *
 * Below range · In range · Above range, in that order, which is the order of
 * the scale itself rather than a ranking. The two significantly-out counts fold
 * into their neighbours (`STRIP_STATE` in lib/markerCopy.ts, the one place that
 * folding is written down).
 *
 * THE FIVE STATES ARE UNTOUCHED EVERYWHERE ELSE and that is the whole scope of
 * this: the status word, the chevron, the range bar, the chart and the card
 * tint still separate all five, and a result is still described as
 * "Significantly above range" on its own card. This is a summary of a page, and
 * five figures of which three are usually zero summarise worse than three that
 * all say something.
 *
 * BOTH GOLD SEGMENTS ARE THE SAME COLOUR, by construction rather than by two
 * records agreeing: `low` and `high` resolve to the same hue in tokens.ts, so
 * `statusPlateClass('LOW')` and `statusPlateClass('HIGH')` paint one ground.
 * Direction is the chevron and the word, which is what the shape layer is for.
 */
const STRIP_ORDER: ('LOW' | 'IN_RANGE' | 'HIGH')[] = ['LOW', 'IN_RANGE', 'HIGH'];

/** The order a proportion bar stacks in, so every bar reads the same way left to right. */
const BAR_ORDER: MarkerStatus[] = ['IN_RANGE', 'LOW', 'HIGH', 'SIGNIFICANT_LOW', 'SIGNIFICANT_HIGH'];

function countByStatus(markers: SummaryMarker[]): Record<MarkerStatus, number> {
  const counts: Record<MarkerStatus, number> = {
    IN_RANGE: 0, HIGH: 0, LOW: 0, SIGNIFICANT_HIGH: 0, SIGNIFICANT_LOW: 0,
  };
  for (const m of countable(markers)) counts[m.status] += 1;
  return counts;
}

/** The same tally, folded onto the strip's three states. */
function countByStripState(markers: SummaryMarker[]): Record<'LOW' | 'IN_RANGE' | 'HIGH', number> {
  const counts = { LOW: 0, IN_RANGE: 0, HIGH: 0 };
  for (const m of countable(markers)) counts[STRIP_STATE[m.status]] += 1;
  return counts;
}

/** How many of this set are actually in the counts — the denominator every proportion uses. */
function countedTotal(markers: SummaryMarker[]): number {
  return countable(markers).length;
}

// ---------------------------------------------------------------------------
// Counts strip
// ---------------------------------------------------------------------------

/**
 * ONE JOINED UNIT, not a row of separate tiles.
 *
 * It used to be a grid of independently-bordered, independently-shadowed cards
 * with gaps between them, left-aligned under an eyebrow — which read as five
 * unrelated things that happened to be adjacent, rather than as one summary of
 * one report broken into parts. Now: a single outer radius, a single shadow, a
 * single hairline border, and the segments inside separated by hairline
 * dividers. Each segment keeps its own tinted fill, so the traffic light is
 * intact and each part is still distinct; what has gone is the impression that
 * they are five objects.
 *
 * Centred in the content column, because a summary of the whole page is not a
 * left-hand column of it. Equal widths, equal height, contents vertically
 * centred, and generous space around the whole unit.
 *
 * Below sm the segments stack — still inside one border, with the dividers
 * turning horizontal, so it is the same object in a different orientation
 * rather than five cards again.
 *
 * The number is Fraunces at the section optical size (one of the few numbers
 * in the product that is NOT mono — it is a headline, not lab data), and the
 * shape mark and word beneath it are Plex Sans, exactly as they appear on the
 * cards below. Colour is the third thing that says this, never the first.
 */
export function CountsStrip({
  markers,
  title = 'This report at a glance',
  activeStatus,
  onSelectStatus,
  action,
  className = '',
}: {
  markers: SummaryMarker[];
  /** What this is a summary OF — one report, or every marker on record. */
  title?: string;
  /** The status filter currently applied, so the matching segment reads as selected. */
  activeStatus?: string;
  onSelectStatus?: (status: StatusFilter) => void;
  /** An action belonging to the summary rather than to the page — the By marker view's download. */
  action?: ReactNode;
  className?: string;
}) {
  if (countedTotal(markers) === 0) return null;
  const counts = countByStripState(markers);
  // A state nobody is in is not shown — still true at three, and it is why a
  // report with nothing out of range renders one green segment rather than one
  // green and two zeros.
  const shown = STRIP_ORDER.filter((s) => counts[s] > 0);

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <p className="eyebrow mb-3 text-center">{title}</p>
      {/* The border, the radius and the shadow live HERE and nowhere inside —
          that is the whole construction. overflow-hidden is what lets the
          segments' tinted fills reach the rounded corners without each one
          needing a radius of its own. */}
      {/* A PAGE-LEVEL PANE (Aug 2026). One strip per screen, holding three
          segments — the definition of a structural surface rather than a
          repeating object. `overflow-hidden` clips the pane’s own streak and
          grain to the radius along with the segments’ tinted fills, which is
          why the radius still lives here and nowhere inside. */}
      <ul className="glass-panel card-glass grid w-full max-w-3xl grid-cols-1 divide-y divide-taupe overflow-hidden rounded-card border border-taupe shadow-card sm:auto-cols-fr sm:grid-flow-col sm:divide-x sm:divide-y-0">
        {shown.map((status) => {
          // The segment selects the DIRECTIONAL filter, not the specific state
          // — its number counts the significant one too, and a segment reading
          // "4" that filtered to three would be the strip contradicting itself.
          const filter = STRIP_FILTER[status];
          const selected = activeStatus === filter;
          const Wrapper = onSelectStatus ? 'button' : 'div';
          return (
            <li key={status} className="flex">
              <Wrapper
                {...(onSelectStatus
                  ? {
                      type: 'button' as const,
                      onClick: () => onSelectStatus(selected ? 'ALL' : filter),
                      'aria-pressed': selected,
                    }
                  : {})}
                // Shorter stacked than side by side: five segments at the
                // desktop height is most of a phone screen spent on a summary
                // of the markers it is delaying.
                //
                // py-4 / sm:py-5, down from py-5 / sm:py-7. A segment was 147px
                // tall to hold a two-line number-and-label pair about 44px
                // high, so two thirds of each box was empty and the five of
                // them read as a large hollow object rather than a dense one.
                // The unit still has generous space AROUND it — that is where
                // the room belongs, and it is untouched.
                className={`flex w-full flex-col items-center justify-center gap-2 px-4 py-4 text-center transition duration-150 ease-out sm:py-5 ${statusPlateClass(status)} ${
                  // Selection is a bronze inset ring, not a border: a border
                  // would push the segment's contents by a pixel and shunt the
                  // whole row. Bronze rather than the status hue, so the ring
                  // says "you are filtering by this" and never doubles as a
                  // second, louder statement of the status itself.
                  selected ? 'ring-2 ring-inset ring-bronze' : ''
                } ${
                  // Hover is a ring rather than a background, because a
                  // background here would REPLACE the status wash — the one
                  // thing this segment exists to show — for as long as the
                  // pointer was on it.
                  onSelectStatus
                    ? 'cursor-pointer hover:ring-1 hover:ring-inset hover:ring-bronze/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-bronze'
                    : ''
                }`}
              >
                <p className="tabular font-display opsz-section text-2xl font-semibold leading-none text-espresso">
                  {counts[status]}
                </p>
                <StatusBadge status={status} />
              </Wrapper>
            </li>
          );
        })}
      </ul>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Health-area group heading
// ---------------------------------------------------------------------------

export interface SummaryCategory {
  key: string;
  name: string;
  resultType: string;
  note: string | null;
}

/**
 * The proportion of a set of markers in each state, as a bar and as words.
 *
 * Three things carry the breakdown, and colour is the last of them: each
 * segment has its own hatch (flat in range, open hatch out of range, dense
 * hatch significantly out) so the bar survives greyscale; the counts are
 * repeated beneath it in words; and the whole bar has an accessible label
 * spelling them out. Someone who cannot see any of the three colours loses
 * nothing.
 *
 * It describes the markers it is GIVEN, which — in a heading above a group of
 * cards — is the set actually on screen. A bar that kept reporting the whole
 * area while the cards under it were filtered down to three would be a
 * statistic about something the reader cannot see. The heading states the
 * filtered count beside it, so the relationship to the whole is never lost.
 */
export function StatusBreakdown({
  markers,
  label,
  className = '',
}: {
  markers: SummaryMarker[];
  /** Names the bar for a screen reader — the health area it belongs to. */
  label: string;
  className?: string;
}) {
  // Only the results that were actually compared against a range: a bar is a
  // proportion, and a segment can only be a share of something that was
  // measured.
  const counted = countable(markers);
  if (counted.length === 0) return null;
  const counts = countByStatus(counted);
  const segments = BAR_ORDER.filter((s) => counts[s] > 0);
  const spoken = segments.map((s) => `${counts[s]} ${statusLabel(s).toLowerCase()}`).join(', ');

  return (
    <div className={className}>
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full border border-taupe"
        role="img"
        aria-label={`${label}: ${spoken}.`}
      >
        {segments.map((s) => (
          <span key={s} className={statusBarClass(s)} style={{ width: `${(counts[s] / counted.length) * 100}%` }} />
        ))}
      </div>
      {/* The same breakdown in words, always present — the bar is the quick
          read, this is the actual answer. */}
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-espresso/80" aria-hidden="true">
        {segments.map((s) => (
          <span key={s} className="tabular inline-flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-input border border-taupe ${statusBarClass(s)}`} />
            {counts[s]} {statusLabel(s).toLowerCase()}
          </span>
        ))}
      </p>
    </div>
  );
}

/**
 * The heading over one health area's cards: the area's name, how many of its
 * markers are showing, the status breakdown of those, and the catalogue's note
 * about the area.
 *
 * This is where the old summary bars went. Grouping the grid by health area and
 * ALSO listing the areas above it as bars was the same information twice, and
 * the copy that was only in the bars — the counts, the note, the fact that areas
 * overlap — is all here now, attached to the markers it is about.
 *
 * Used by both the report view and the marker list, so the two group identically.
 */
export function AreaGroupHeading({
  id,
  name,
  note,
  markers,
  total,
}: {
  /** Labels the <section> this heading opens. */
  id: string;
  name: string;
  note?: string | null;
  /** The markers currently shown under this heading. */
  markers: SummaryMarker[];
  /** How many this area holds before the filters — so "3 of 21 markers" can be said. */
  total: number;
}) {
  return (
    <div className="mb-5 border-b border-taupe pb-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={id} className="font-display text-xl leading-tight text-espresso">
          {name}
        </h2>
        <p className="tabular text-xs text-espresso/80">{filterCountLabel(markers.length, total)}</p>
      </div>
      <StatusBreakdown markers={markers} label={name} className="mt-3" />
      {note && <p className="mt-2 text-xs italic text-espresso/80">{note}</p>}
    </div>
  );
}
