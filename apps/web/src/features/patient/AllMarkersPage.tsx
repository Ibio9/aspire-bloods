import { formatDate } from '@aspire-bloods/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Sparkline } from '../../components/ui/Sparkline';
import { EmptyState } from '../../components/ui/EmptyState';
import { LinkButton } from '../../components/ui/LinkButton';
import { Reveal } from '../../components/motion/Reveal';
import { staggerDelay } from '../../components/motion/stagger';
import { ArrowRightIcon } from '../../components/nav/patientIcons';
import { apiFetch } from '../../lib/api';
import { type MarkerRow } from '../../lib/patientPortal';
import { STATUS_FILTERS, matchesStatusFilter, type StatusFilter } from '../../lib/markerCopy';

/**
 * Every marker the patient has ever had tested, in one list, independent of
 * which report it arrived on. The brief's example is the whole point:
 * someone wondering "how's my vitamin D doing" has no reason to remember
 * which panel it was part of, and until now had no way to find out without
 * opening reports one at a time.
 *
 * Sorting defaults to "needs attention first" rather than alphabetical — the
 * first question this list gets asked is almost never "what begins with A".
 */

type SortKey = 'ATTENTION' | 'NAME' | 'RECENT' | 'MOVEMENT';

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'ATTENTION', label: 'Needs attention first' },
  { value: 'NAME', label: 'Name (A–Z)' },
  { value: 'RECENT', label: 'Most recently tested' },
  { value: 'MOVEMENT', label: 'Biggest change' },
];

/** Out-of-range sorts above in-range; significant sorts above mild. */
const ATTENTION_RANK: Record<string, number> = {
  SIGNIFICANT_HIGH: 0,
  SIGNIFICANT_LOW: 0,
  HIGH: 1,
  LOW: 1,
  IN_RANGE: 2,
};

/** Change measured relative to the marker's own reference band, so markers on different scales sort against each other. */
function relativeMovement(m: MarkerRow): number {
  if (m.delta === null) return -1;
  const band = m.referenceHigh - m.referenceLow || Math.abs(m.value ?? 0) || 1;
  return Math.abs(m.delta) / band;
}

function MarkerListRow({ marker }: { marker: MarkerRow }) {
  return (
    <Link to={`/markers/${marker.markerId}`} className="block rounded-card">
      <Card interactive padding="tight">
        {/* Stacked until lg: the four fixed columns total ~630px, which fits
            beside the sidebar only from lg up — at tablet widths the row was
            quietly crushing the marker name to nothing. */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl leading-tight text-espresso sm:text-2xl">{marker.name}</p>
            <p className="mt-1 text-xs text-espresso/70">
              {marker.panelName} · {formatDate(marker.sampleDate)}
              {marker.resultCount > 1 && ` · ${marker.resultCount} results`}
            </p>
          </div>

          <p className="tabular flex shrink-0 items-baseline gap-1.5 text-2xl font-semibold text-espresso lg:w-40 lg:justify-end">
            {marker.valueText ?? marker.value} <span className="text-sm font-normal text-espresso/70">{marker.unit}</span>
          </p>

          <div className="shrink-0 lg:w-52">
            <StatusBadge status={marker.status} />
            <p className="tabular mt-1 text-xs text-espresso/60">
              Usual range {marker.referenceLow}–{marker.referenceHigh}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3 lg:w-36 lg:justify-end">
            {marker.spark.length > 1 ? (
              <Sparkline points={marker.spark} referenceLow={marker.referenceLow} referenceHigh={marker.referenceHigh} />
            ) : (
              <span className="text-xs text-espresso/50">{marker.comparable ? 'First result' : 'Not comparable'}</span>
            )}
            <ArrowRightIcon className="hidden shrink-0 text-bronze-700 lg:block" />
          </div>
        </div>
      </Card>
    </Link>
  );
}

export function AllMarkersPage() {
  const [markers, setMarkers] = useState<MarkerRow[] | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [sort, setSort] = useState<SortKey>('ATTENTION');

  useEffect(() => {
    apiFetch<MarkerRow[]>('/patient/markers')
      .then(setMarkers)
      .catch(() => setMarkers([]));
  }, []);

  const visible = useMemo(() => {
    if (!markers) return [];
    const q = query.trim().toLowerCase();
    const filtered = markers.filter(
      (m) => matchesStatusFilter(m.status, statusFilter) && (q === '' || m.name.toLowerCase().includes(q)),
    );

    const sorted = [...filtered];
    if (sort === 'NAME') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'RECENT') sorted.sort((a, b) => (a.sampleDate < b.sampleDate ? 1 : a.sampleDate > b.sampleDate ? -1 : a.name.localeCompare(b.name)));
    else if (sort === 'MOVEMENT') sorted.sort((a, b) => relativeMovement(b) - relativeMovement(a) || a.name.localeCompare(b.name));
    else sorted.sort((a, b) => ATTENTION_RANK[a.status] - ATTENTION_RANK[b.status] || a.name.localeCompare(b.name));
    return sorted;
  }, [markers, query, statusFilter, sort]);

  const attentionCount = markers?.filter((m) => m.status !== 'IN_RANGE').length ?? 0;

  return (
    <>
      <TwoTierHeading eyebrow="Aspire Clinic · Patient portal" title="All markers" />
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-espresso">
        Everything you've ever had tested, whichever report it came from, with its latest value and how it has moved.
      </p>

      {markers === null ? (
        <div className="mt-10 flex flex-col gap-4" aria-busy="true" aria-label="Loading your markers">
          {[0, 1, 2, 3, 4].map((i) => (
            <Card key={i} padding="tight">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="mt-3 h-4 w-64" />
            </Card>
          ))}
        </div>
      ) : markers.length === 0 ? (
        <div className="mt-10 max-w-2xl">
          <EmptyState
            title="Nothing tested yet"
            description="Once your first results have been reviewed and released, every marker in them will be listed here. From your second test onwards, each one will show which way it's heading."
            action={<LinkButton to="/overview">Back to overview</LinkButton>}
          />
        </div>
      ) : (
        <>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Input
              label="Find a marker"
              name="marker-filter"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ferritin, vitamin D…"
              // A filter, not a form field — Input marks required by default (see its comment on
              // the inverted asterisk convention), which would be wrong on something you can leave blank.
              required={false}
            />
            <Select label="Show" name="status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
              {STATUS_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.value === 'ATTENTION' ? `${f.label} (${attentionCount})` : f.label}
                </option>
              ))}
            </Select>
            <Select label="Sort by" name="sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>

          <p className="mt-6 text-sm text-espresso/70" role="status">
            {visible.length} of {markers.length} marker{markers.length === 1 ? '' : 's'}
          </p>

          {visible.length === 0 ? (
            <div className="mt-4 max-w-2xl">
              <EmptyState
                title="Nothing matches those filters"
                description="Try clearing the search box or switching “Show” back to all markers."
              />
            </div>
          ) : (
            <ul className="mt-4 flex flex-col gap-4">
              {visible.map((marker, i) => (
                <li key={marker.markerId}>
                  <Reveal delay={staggerDelay(i)}>
                    <MarkerListRow marker={marker} />
                  </Reveal>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
