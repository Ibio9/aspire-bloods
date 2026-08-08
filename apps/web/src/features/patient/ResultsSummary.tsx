import type { MarkerStatus } from '@aspire-bloods/shared';
import { statusBarClass, statusLabel, statusTintClass } from '../../lib/markerCopy';
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
  status: MarkerStatus;
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
  for (const m of markers) counts[m.status] += 1;
  return counts;
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
  if (markers.length === 0) return null;
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
 * each state.
 *
 * Three things carry the breakdown, and colour is the last of them: each
 * segment has its own hatch (flat in range, open hatch out of range, dense
 * hatch significantly out) so the bar survives greyscale; each bar carries a
 * written count beneath it; and the whole bar has an accessible label spelling
 * the counts out in words. Someone who cannot see any of the three colours
 * loses nothing.
 */
export function CategorySummaryBars({
  markers,
  categories,
  onSelectCategory,
  activeCategory,
}: {
  markers: SummaryMarker[];
  categories: SummaryCategory[];
  onSelectCategory?: (key: string | 'ALL') => void;
  activeCategory?: string;
}) {
  // MEASURED areas only — a bar of "proportion in range" over a set of genetic
  // indicators would be a statement about nothing.
  const areas = categories
    .filter((c) => c.resultType === 'MEASURED')
    .map((c) => ({ category: c, members: markers.filter((m) => m.categoryKeys?.includes(c.key)) }))
    .filter((a) => a.members.length > 0)
    .sort((a, b) => b.members.length - a.members.length || a.category.name.localeCompare(b.category.name));

  if (areas.length === 0) return null;

  return (
    <div className="mt-12">
      <p className="eyebrow mb-1">By health area</p>
      {/* The overlap is the one thing the bars can't show for themselves —
          without it the counts look like they should add up to the total. */}
      <p className="mb-5 max-w-2xl text-sm text-espresso/80">
        Areas overlap — a marker can appear in more than one.
      </p>
      <ul className="flex flex-col gap-4">
        {areas.map(({ category, members }) => {
          const counts = countByStatus(members);
          const segments = BAR_ORDER.filter((s) => counts[s] > 0);
          const spoken = segments.map((s) => `${counts[s]} ${statusLabel(s).toLowerCase()}`).join(', ');
          const selected = activeCategory === category.key;
          const Wrapper = onSelectCategory ? 'button' : 'div';

          return (
            <li key={category.key}>
              <Wrapper
                {...(onSelectCategory
                  ? {
                      type: 'button' as const,
                      onClick: () => onSelectCategory(selected ? 'ALL' : category.key),
                      'aria-pressed': selected,
                    }
                  : {})}
                className={`w-full rounded-card border p-4 text-left transition duration-150 ease-out ${
                  selected ? 'border-bronze bg-cream-100 shadow-card' : 'border-taupe bg-cream-50'
                } ${onSelectCategory ? 'cursor-pointer hover:border-bronze/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze' : ''}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="font-display text-lg leading-tight text-espresso">{category.name}</p>
                  <p className="tabular text-xs text-espresso/80">
                    {members.length} marker{members.length === 1 ? '' : 's'}
                  </p>
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
            </li>
          );
        })}
      </ul>
    </div>
  );
}
