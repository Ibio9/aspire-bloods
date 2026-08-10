import { useId, useState, type ReactNode } from 'react';
import { countable, type MarkerStatus } from '@aspire-bloods/shared';
import { statusBarClass, statusLabel, statusTintClass } from '../../lib/markerCopy';
import { Collapsible } from '../../components/ui/Collapsible';
import { StatusBadge } from '../../components/ui/StatusBadge';

/**
 * The two summary elements at the top of a report: how many markers landed in
 * each state, and how that breaks down by health area.
 *
 * Both count MEASURED markers only. A genetic risk indicator has no reference
 * range, so it cannot be in range or out of it, and including one in "42 in
 * range" would be counting a different kind of thing. The same goes for a food
 * sensitivity level and a microbiome proportion — all three live in their own
 * sections below the grid, with their own framing.
 *
 * Neither element is a score. There is no total, no percentage healthy, no
 * grade: four counts and a proportion bar per area, which is a description of
 * the report rather than a verdict on the person.
 */

export interface SummaryMarker {
  markerId: string;
  /**
   * Null where this result has no position on its reference range. Both
   * elements below drop those entirely rather than counting them: a tile
   * saying "3 in range" that includes a marker nobody compared to a range is
   * the same false statement the status column itself used to make, moved into
   * the summary. See countable() in packages/shared.
   */
  status: MarkerStatus | null;
  value: number | null;
  valueText?: string | null;
  categoryKeys?: string[];
}

/** The order the counts strip reads in: settled first, then out, then far out. */
const STRIP_ORDER: MarkerStatus[] = ['IN_RANGE', 'HIGH', 'LOW', 'SIGNIFICANT_HIGH', 'SIGNIFICANT_LOW'];

/** The order a proportion bar stacks in, so every bar reads the same way left to right. */
const BAR_ORDER: MarkerStatus[] = ['IN_RANGE', 'LOW', 'HIGH', 'SIGNIFICANT_LOW', 'SIGNIFICANT_HIGH'];

function countByStatus(markers: SummaryMarker[]): Record<MarkerStatus, number> {
  const counts: Record<MarkerStatus, number> = {
    IN_RANGE: 0, HIGH: 0, LOW: 0, SIGNIFICANT_HIGH: 0, SIGNIFICANT_LOW: 0,
  };
  for (const m of countable(markers)) counts[m.status] += 1;
  return counts;
}

/** How many of this set are actually in the counts — the denominator every proportion uses. */
function countedTotal(markers: SummaryMarker[]): number {
  return countable(markers).length;
}

// ---------------------------------------------------------------------------
// Counts strip
// ---------------------------------------------------------------------------

export function CountsStrip({
  markers,
  activeStatus,
  onSelectStatus,
}: {
  markers: SummaryMarker[];
  /** The status filter currently applied, so the matching tile reads as selected. */
  activeStatus?: string;
  onSelectStatus?: (status: MarkerStatus | 'ALL') => void;
}) {
  if (countedTotal(markers) === 0) return null;
  const counts = countByStatus(markers);
  // A state nobody is in is not shown. Five tiles where three of them say "0"
  // is a worse summary than three tiles that all say something.
  const shown = STRIP_ORDER.filter((s) => counts[s] > 0);

  return (
    <div className="mt-10">
      <p className="eyebrow mb-3">This report at a glance</p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {shown.map((status) => {
          const selected = activeStatus === status;
          const Wrapper = onSelectStatus ? 'button' : 'div';
          return (
            <li key={status}>
              <Wrapper
                {...(onSelectStatus
                  ? {
                      type: 'button' as const,
                      onClick: () => onSelectStatus(selected ? 'ALL' : status),
                      'aria-pressed': selected,
                    }
                  : {})}
                className={`w-full rounded-card border p-4 text-left transition duration-150 ease-out ${statusTintClass(status)} ${
                  selected ? 'border-bronze shadow-card' : 'border-taupe'
                } ${onSelectStatus ? 'cursor-pointer hover:border-bronze/60 hover:shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze' : ''}`}
              >
                <p className="tabular text-3xl font-semibold leading-none text-espresso">{counts[status]}</p>
                {/* The shape and the word, exactly as they appear on the cards
                    below — the tint is the third thing that says this, never
                    the first. */}
                <StatusBadge status={status} className="mt-2.5" />
              </Wrapper>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-category proportion bars
// ---------------------------------------------------------------------------

export interface SummaryCategory {
  key: string;
  name: string;
  resultType: string;
  note: string | null;
}

/**
 * One bar per health area, showing the proportion of that area's markers in
 * each state — and, when opened, that area's markers directly beneath it.
 *
 * Three things carry the breakdown, and colour is the last of them: each
 * segment has its own hatch (flat in range, open hatch out of range, dense
 * hatch significantly out) so the bar survives greyscale; each bar carries a
 * written count beneath it; and the whole bar has an accessible label spelling
 * the counts out in words. Someone who cannot see any of the three colours
 * loses nothing.
 *
 * WHY THESE OPEN IN PLACE. Clicking an area used to set the page's health-area
 * filter, which rewrote the grid at the bottom of the page and left the reader
 * looking at the summary they had just clicked, with no indication that the
 * thing they asked for was now several screens below. On a Signature panel that
 * is a long way down. An area is a section of the report, so it behaves like
 * one: it opens where it is, and what it contains appears under it.
 *
 * Several can be open at once, because comparing two areas is the obvious next
 * thing to want and an accordion that closes one to open another makes that
 * impossible. Nothing here is remembered between visits, in keeping with the
 * rest of the results filtering.
 *
 * The bars themselves count the WHOLE report, not the filtered set. A
 * proportion that moved every time you typed in the search box would be a
 * different statistic on every keystroke. What opens beneath is the filtered
 * set, so search and the status filter do what they always did: change what is
 * displayed, never what is counted.
 */
export function CategorySummaryBars<T extends SummaryMarker>({
  markers,
  categories,
  visibleMarkers,
  renderMarker,
  emptyLabel = 'Nothing in this area matches the filters above.',
}: {
  /** Every measured marker on the report. The bars are a summary of all of them. */
  markers: T[];
  categories: SummaryCategory[];
  /**
   * The filtered, sorted set the page is currently showing. Only these appear
   * inside an opened area — omit it and the areas are summary bars only, with
   * nothing to open.
   */
  visibleMarkers?: T[];
  /** How one marker renders. Kept out here so this file never has to know what a result card is. */
  renderMarker?: (marker: T, index: number) => ReactNode;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const headingId = useId().replace(/:/g, '');
  const expandable = !!renderMarker && !!visibleMarkers;

  // MEASURED areas only — a bar of "proportion in range" over a set of genetic
  // indicators would be a statement about nothing. And within those, only the
  // results that were actually compared against a range: a bar is a proportion,
  // and a segment can only be a share of something that was measured.
  const areas = categories
    .filter((c) => c.resultType === 'MEASURED')
    .map((c) => ({ category: c, members: countable(markers.filter((m) => m.categoryKeys?.includes(c.key))) }))
    .filter((a) => a.members.length > 0)
    .sort((a, b) => b.members.length - a.members.length || a.category.name.localeCompare(b.category.name));

  if (areas.length === 0) return null;

  function toggle(key: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="mt-12">
      <p className="eyebrow mb-5">By health area</p>
      <ul className="flex flex-col gap-4">
        {areas.map(({ category, members }) => {
          const counts = countByStatus(members);
          const segments = BAR_ORDER.filter((s) => counts[s] > 0);
          const spoken = segments.map((s) => `${counts[s]} ${statusLabel(s).toLowerCase()}`).join(', ');
          const isOpen = expandable && open.has(category.key);
          const shown = (visibleMarkers ?? []).filter((m) => m.categoryKeys?.includes(category.key));
          const buttonId = `${headingId}-area-${category.key}`;
          const panelId = `${headingId}-panel-${category.key}`;
          const Wrapper = expandable ? 'button' : 'div';

          return (
            <li key={category.key} className={`rounded-card border ${isOpen ? 'border-bronze bg-cream-100 shadow-card' : 'border-taupe bg-cream-50'} transition-colors duration-150 ease-out`}>
              <Wrapper
                {...(expandable
                  ? {
                      type: 'button' as const,
                      id: buttonId,
                      onClick: () => toggle(category.key),
                      'aria-expanded': isOpen,
                      'aria-controls': panelId,
                    }
                  : {})}
                className={`w-full rounded-card p-4 text-left ${
                  expandable
                    ? 'cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze'
                    : ''
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="font-display text-lg leading-tight text-espresso">{category.name}</p>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="tabular text-xs text-espresso/80">
                      {members.length} marker{members.length === 1 ? '' : 's'}
                    </span>
                    {/* Rotation is decoration; aria-expanded on the button is
                        what actually reports the state. */}
                    {expandable && (
                      <svg
                        width="12"
                        height="8"
                        viewBox="0 0 12 8"
                        aria-hidden="true"
                        className={`text-espresso/80 motion-safe:transition-transform motion-safe:duration-200 ${isOpen ? 'rotate-180' : ''}`}
                      >
                        <path d="M1 1L6 6L11 1" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                </div>

                <div
                  className="mt-3 flex h-3 w-full overflow-hidden rounded-full border border-taupe"
                  role="img"
                  aria-label={`${category.name}: ${spoken}.`}
                >
                  {segments.map((s) => (
                    <span
                      key={s}
                      className={statusBarClass(s)}
                      style={{ width: `${(counts[s] / members.length) * 100}%` }}
                    />
                  ))}
                </div>

                {/* The same breakdown in words, always present — the bar is the
                    quick read, this is the actual answer. */}
                <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-espresso/80" aria-hidden="true">
                  {segments.map((s) => (
                    <span key={s} className="tabular inline-flex items-center gap-1.5">
                      <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-sm border border-taupe ${statusBarClass(s)}`} />
                      {counts[s]} {statusLabel(s).toLowerCase()}
                    </span>
                  ))}
                </p>
                {category.note && <p className="mt-2 text-xs italic text-espresso/80">{category.note}</p>}
              </Wrapper>

              {expandable && (
                <Collapsible open={isOpen} id={panelId} labelledBy={buttonId}>
                  <div className="border-t border-taupe px-4 pb-5 pt-5">
                    {shown.length === 0 ? (
                      <p className="text-sm text-espresso/80">{emptyLabel}</p>
                    ) : (
                      <>
                        {/* An area with twenty-one markers in it is the case
                            this layout has to survive, so the cards go into the
                            same responsive grid the flat results view uses
                            rather than a single tall column. */}
                        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                          {shown.map((m, i) => renderMarker!(m, i))}
                        </div>
                        {shown.length !== members.length && (
                          <p className="mt-4 text-xs text-espresso/80" role="status">
                            {shown.length} of {members.length} shown, by the filters above.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </Collapsible>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
