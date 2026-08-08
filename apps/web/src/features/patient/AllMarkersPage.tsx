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
import {
  ATTENTION_RANK,
  STATUS_FILTERS,
  byAttentionThenName,
  filterCountLabel,
  groupByHealthArea,
  matchesMarkerQuery,
  matchesStatusFilter,
  optimalRangeLabel,
  optimalStatusLabel,
  type StatusFilter,
} from '../../lib/markerCopy';
import { Button } from '../../components/ui/Button';

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

type SortKey = 'ATTENTION' | 'HEALTH_AREA' | 'NAME' | 'RECENT' | 'MOVEMENT';

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'ATTENTION', label: 'Needs attention first' },
  // Same option, same words and the same grouped rendering as the report view,
  // so the two screens read as one product rather than two.
  { value: 'HEALTH_AREA', label: 'Health area' },
  { value: 'NAME', label: 'Name (A–Z)' },
  { value: 'RECENT', label: 'Most recently tested' },
  { value: 'MOVEMENT', label: 'Biggest change' },
];

/** Change measured relative to the marker's own reference band, so markers on different scales sort against each other. */
function relativeMovement(m: MarkerRow): number {
  if (m.delta === null) return -1;
  const band = m.referenceHigh - m.referenceLow || Math.abs(m.value ?? 0) || 1;
  return Math.abs(m.delta) / band;
}

function MarkerListRow({ marker }: { marker: MarkerRow }) {
  return (
    <Link to={`/markers/${marker.markerId}`} className="block rounded-card">
      {/* Same rule as the result cards: the tint is a surface wash only, and
          the StatusBadge inside still carries the status in shape and words. */}
      <Card interactive tint={marker.status} padding="tight">
        {/* Stacked until lg: the four fixed columns total ~630px, which fits
            beside the sidebar only from lg up — at tablet widths the row was
            quietly crushing the marker name to nothing. */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl leading-tight text-espresso sm:text-2xl">{marker.name}</p>
            <p className="mt-1 text-xs text-espresso/80">
              {marker.panelName} · {formatDate(marker.sampleDate)}
              {marker.resultCount > 1 && ` · ${marker.resultCount} results`}
            </p>
          </div>

          <p className="tabular flex shrink-0 items-baseline gap-1.5 text-2xl font-semibold text-espresso lg:w-40 lg:justify-end">
            {marker.valueText ?? marker.value} <span className="text-sm font-normal text-espresso/80">{marker.unit}</span>
          </p>

          <div className="shrink-0 lg:w-52">
            <StatusBadge status={marker.status} />
            {/* A qualitative result has no numeric range behind it, and this
                line used to render "Usual range 0–0" for one. Absent, not
                zeroed — see the same rule on the report card. */}
            {marker.referenceHigh > marker.referenceLow && (
              <p className="tabular mt-1 text-xs text-espresso/80">
                Usual range {marker.referenceLow}–{marker.referenceHigh}
              </p>
            )}
            {/* Advisory, and clearly the second of two ranges. Absent
                entirely for a marker with no established optimal. */}
            {marker.optimal && (
              <p className="tabular mt-0.5 text-xs text-espresso/80">
                {optimalRangeLabel(marker.optimal)}
                {optimalStatusLabel(marker.optimal) && (
                  <span> · {optimalStatusLabel(marker.optimal)!.toLowerCase()}</span>
                )}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-3 lg:w-36 lg:justify-end">
            {marker.spark.length > 1 ? (
              <Sparkline
                points={marker.spark}
                referenceLow={marker.referenceLow}
                referenceHigh={marker.referenceHigh}
                severityThreshold={marker.severityThreshold}
                optimal={marker.optimal}
              />
            ) : (
              <span className="text-xs text-espresso/80">{marker.comparable ? 'First result' : 'Not comparable'}</span>
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
  const [categories, setCategories] = useState<{ key: string; name: string }[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [sort, setSort] = useState<SortKey>('ATTENTION');

  useEffect(() => {
    apiFetch<MarkerRow[]>('/patient/markers')
      .then(setMarkers)
      .catch(() => setMarkers([]));
    // Health areas for the category filter. A failure here costs the category
    // picker and nothing else, so it degrades rather than blocking the page.
    apiFetch<{ key: string; name: string }[]>('/content/marker-categories')
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  /**
   * Genetic indicators, food sensitivities and microbiome proportions never
   * appear on this screen at all. It is a list of things with a value, a range
   * and a direction of travel, and none of those three has any of them.
   */
  const measured = useMemo(
    () => (markers ?? []).filter((m) => (m.resultType ?? 'MEASURED') === 'MEASURED'),
    [markers],
  );

  const visible = useMemo(() => {
    const filtered = measured.filter(
      (m) =>
        matchesStatusFilter(m.status, statusFilter) &&
        matchesMarkerQuery(m, query) &&
        (categoryFilter === 'ALL' || (m.categoryKeys ?? []).includes(categoryFilter)),
    );

    const sorted = [...filtered];
    if (sort === 'NAME' || sort === 'HEALTH_AREA') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'RECENT') sorted.sort((a, b) => (a.sampleDate < b.sampleDate ? 1 : a.sampleDate > b.sampleDate ? -1 : a.name.localeCompare(b.name)));
    else if (sort === 'MOVEMENT') sorted.sort((a, b) => relativeMovement(b) - relativeMovement(a) || a.name.localeCompare(b.name));
    else sorted.sort((a, b) => ATTENTION_RANK[a.status] - ATTENTION_RANK[b.status] || a.name.localeCompare(b.name));
    return sorted;
  }, [measured, query, statusFilter, categoryFilter, sort]);

  // Only areas this patient actually has results in — offering a filter that
  // can only ever return nothing is worse than not offering it.
  const filterableCategories = useMemo(() => {
    const present = new Set(measured.flatMap((m) => m.categoryKeys ?? []));
    return categories.filter((c) => present.has(c.key));
  }, [categories, measured]);

  // Grouped under health-area headings, same rendering as the report view.
  // A marker in four areas appears under all four; the count above stays the
  // distinct one, so grouping never inflates it.
  const grouped = useMemo(
    () => (sort === 'HEALTH_AREA' ? groupByHealthArea(visible, filterableCategories, byAttentionThenName) : []),
    [sort, visible, filterableCategories],
  );

  const filtersApplied = query.trim() !== '' || statusFilter !== 'ALL' || categoryFilter !== 'ALL';

  function clearFilters() {
    setQuery('');
    setStatusFilter('ALL');
    setCategoryFilter('ALL');
  }

  return (
    <>
      <TwoTierHeading eyebrow="Aspire Clinic · Patient portal" title="All markers" />

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
            description="Once your first results have been released, every marker in them is listed here. From your second test onwards, each one shows which way it's heading."
            action={<LinkButton to="/overview">Back to overview</LinkButton>}
          />
        </div>
      ) : (
        <>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              label="Find a marker"
              name="marker-filter"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              // The abbreviation is the only name most people know, and search
              // matches aliases as well as the printed name — so "ALT" finds
              // Alanine Aminotransferase and "TSH" finds Thyroid Stimulating
              // Hormone. The placeholder says so by example.
              placeholder="Ferritin, ALT, TSH…"
              // A filter, not a form field — Input marks required by default (see its comment on
              // the inverted asterisk convention), which would be wrong on something you can leave blank.
              required={false}
            />
            <Select label="Show" name="status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
              {STATUS_FILTERS.map((f) => {
                const n = measured.filter((m) => matchesStatusFilter(m.status, f.value)).length;
                return (
                  <option key={f.value} value={f.value}>
                    {f.value === 'ALL' ? f.label : `${f.label} (${n})`}
                  </option>
                );
              })}
            </Select>
            <Select
              label="Health area"
              name="category-filter"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="ALL">All health areas</option>
              {filterableCategories.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.name}
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

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <p className="text-sm text-espresso/80" role="status">
              {filterCountLabel(visible.length, measured.length)}
            </p>
            {filtersApplied && (
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>

          {visible.length === 0 ? (
            <div className="mt-4 max-w-2xl">
              <EmptyState
                title="Nothing matches those filters"
                description="Try clearing the search box, or widening the state and health area you have chosen."
                action={filtersApplied ? <Button onClick={clearFilters}>Clear filters</Button> : undefined}
              />
            </div>
          ) : sort === 'HEALTH_AREA' ? (
            <div className="mt-4 flex flex-col gap-10">
              {grouped.map((g) => (
                <section key={g.key} aria-labelledby={`markers-area-${g.key}`}>
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-taupe pb-2">
                    <h2 id={`markers-area-${g.key}`} className="font-display text-2xl leading-tight text-espresso">
                      {g.name}
                    </h2>
                    <p className="tabular text-xs text-espresso/80">
                      {g.markers.length} marker{g.markers.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <ul className="flex flex-col gap-4">
                    {g.markers.map((marker, i) => (
                      <li key={marker.markerId}>
                        <Reveal delay={staggerDelay(i)}>
                          <MarkerListRow marker={marker} />
                        </Reveal>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
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
