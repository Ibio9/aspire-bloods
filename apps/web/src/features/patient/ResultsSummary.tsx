import { countable, type MarkerStatus, type MarkerStatusInput } from '@aspire-bloods/shared';
import { filterCountLabel, statusBarClass, statusLabel, statusTintClass } from '../../lib/markerCopy';
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
            <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-sm border border-taupe ${statusBarClass(s)}`} />
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
        <h2 id={id} className="font-display text-2xl leading-tight text-espresso">
          {name}
        </h2>
        <p className="tabular text-xs text-espresso/80">{filterCountLabel(markers.length, total)}</p>
      </div>
      <StatusBreakdown markers={markers} label={name} className="mt-3" />
      {note && <p className="mt-2 text-xs italic text-espresso/80">{note}</p>}
    </div>
  );
}
