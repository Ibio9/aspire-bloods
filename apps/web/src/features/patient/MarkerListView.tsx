import { formatDate } from '@aspire-bloods/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import { Sparkline } from '../../components/ui/Sparkline';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { LinkButton } from '../../components/ui/LinkButton';
import { Reveal } from '../../components/motion/Reveal';
import { staggerDelay } from '../../components/motion/stagger';
import { apiFetch } from '../../lib/api';
import { type MarkerRow } from '../../lib/patientPortal';
import {
  RESULT_GROUPINGS,
  byAttentionThenName,
  byName,
  filterCountLabel,
  groupByHealthArea,
  matchesMarkerQuery,
  matchesStatusFilter,
  statusFilterCounts,
  type ResultGrouping,
  type StatusFilter,
} from '../../lib/markerCopy';
import { Button } from '../../components/ui/Button';
import { AreaGroupHeading } from './ResultsSummary';
import { MARKER_GRID_CLASS, MarkerResultCard } from './MarkerResultCard';
import type { ResultsFilters, ViewReportsCategories } from './resultsView';

/**
 * Every marker ever tested, one card each — the "By marker" view.
 *
 * The point is the one the report list structurally cannot answer: someone
 * wondering "how's my vitamin D doing" has no reason to remember which panel
 * it was on. Each card carries the latest value, its status and a sparkline of
 * its history, so which markers are MOVING is legible without opening a single
 * one of them.
 *
 * It draws the SAME card as an opened report (see MarkerResultCard) — these are
 * the same object at two scopes, one report's markers against every marker ever
 * tested, and they were two visual languages for no reason anybody could name.
 * The one real difference stays: a marker here has a history, and the sparkline
 * of it sits at the foot of the card. A single report has one sample and
 * nothing to plot.
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

/** Change measured relative to the marker's own reference band, so markers on different scales sort against each other. */
function relativeMovement(m: MarkerRow): number {
  if (m.delta === null) return -1;
  const band = m.referenceHigh - m.referenceLow || Math.abs(m.value ?? 0) || 1;
  return Math.abs(m.delta) / band;
}

/** One comparator per sort, so grouping reorders nothing — it only breaks the grid into sections. */
function comparatorFor(sort: SortKey): (a: MarkerRow, b: MarkerRow) => number {
  if (sort === 'NAME') return byName;
  if (sort === 'RECENT')
    return (a, b) => (a.sampleDate < b.sampleDate ? 1 : a.sampleDate > b.sampleDate ? -1 : a.name.localeCompare(b.name));
  if (sort === 'MOVEMENT') return (a, b) => relativeMovement(b) - relativeMovement(a) || a.name.localeCompare(b.name);
  return byAttentionThenName;
}

/** The panel and date this value came from — the card's one line of provenance. */
function markerMeta(marker: MarkerRow): string {
  // The panel name is an optional segment — a report needn't have a panel
  // behind it, and printing it raw left a leading "· ".
  return [marker.panelName, formatDate(marker.sampleDate), marker.resultCount > 1 ? `${marker.resultCount} results` : null]
    .filter(Boolean)
    .join(' · ');
}

/** Health areas as the catalogue sends them — `note` is the overlap caveat shown in a group heading. */
interface CategoryOption {
  key: string;
  name: string;
  note?: string | null;
}

export function MarkerListView({
  filters,
  onClearFilters,
  onCategoriesAvailable,
  onStatusCounts,
}: {
  filters: ResultsFilters;
  onClearFilters: () => void;
  onStatusCounts?: (counts: Record<StatusFilter, number>) => void;
} & ViewReportsCategories) {
  const [markers, setMarkers] = useState<MarkerRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const { query, statusFilter, categoryFilter } = filters;
  const [grouping, setGrouping] = useState<ResultGrouping>('NONE');
  const [sort, setSort] = useState<SortKey>('ATTENTION');

  const load = useCallback(() => {
    setError(null);
    setMarkers(null);
    // A failed markers load is not "nothing tested yet" — that empty state
    // tells a patient with released results they have none. Surface the
    // failure with a retry instead.
    apiFetch<MarkerRow[]>('/patient/markers')
      .then(setMarkers)
      .catch(setError);
    // Health areas for the category filter. A failure here costs the category
    // picker and nothing else, so it degrades rather than blocking the page.
    apiFetch<CategoryOption[]>('/content/marker-categories')
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Genetic indicators, food sensitivities and microbiome proportions never
   * appear on this screen at all. It is a list of things with a value, a range
   * and a direction of travel, and none of those three has any of them.
   */
  const measured = useMemo(
    () => (markers ?? []).filter((m) => (m.resultType ?? 'MEASURED') === 'MEASURED'),
    [markers],
  );

  // Counts for the status-filter options, one pass rather than one filter per
  // option per render.
  const statusCounts = useMemo(() => statusFilterCounts(measured), [measured]);

  const compare = comparatorFor(sort);

  const visible = useMemo(() => {
    const filtered = measured.filter(
      (m) =>
        matchesStatusFilter(m.status, statusFilter) &&
        matchesMarkerQuery(m, query) &&
        (categoryFilter === 'ALL' || (m.categoryKeys ?? []).includes(categoryFilter)),
    );
    return [...filtered].sort(compare);
  }, [measured, query, statusFilter, categoryFilter, compare]);

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
    () => (grouping === 'HEALTH_AREA' ? groupByHealthArea(visible, filterableCategories, compare) : []),
    [grouping, visible, filterableCategories, compare],
  );

  // What each area holds before the filters, so a heading can say "3 of 21".
  const areaTotals = useMemo(() => {
    const all = groupByHealthArea(measured, filterableCategories);
    return new Map(all.map((g) => [g.key, g.markers.length]));
  }, [measured, filterableCategories]);

  const areaNotes = useMemo(() => new Map(categories.map((c) => [c.key, c.note])), [categories]);

  // The page's pickers offer exactly what this view can answer for.
  useEffect(() => {
    onCategoriesAvailable?.(filterableCategories.map((c) => ({ key: c.key, name: c.name })));
  }, [filterableCategories, onCategoriesAvailable]);
  useEffect(() => {
    onStatusCounts?.(statusCounts);
  }, [statusCounts, onStatusCounts]);

  const filtersApplied = query.trim() !== '' || statusFilter !== 'ALL' || categoryFilter !== 'ALL';
  const clearFilters = onClearFilters;

  /** A marker's history at the foot of its card — the one thing a report's card has no data for. */
  function markerFooter(marker: MarkerRow) {
    if (marker.spark.length > 1) {
      return (
        <Sparkline
          points={marker.spark}
          referenceLow={marker.referenceLow}
          referenceHigh={marker.referenceHigh}
          severityThreshold={marker.severityThreshold}
          optimal={marker.optimal}
        />
      );
    }
    return <span className="text-xs text-espresso/80">{marker.comparable ? 'First result' : 'Not comparable'}</span>;
  }

  return (
    <>
      {error ? (
        <ErrorState
          error={error}
          subject="your markers"
          onRetry={load}
          backTo={{ to: '/overview', label: 'Back to overview' }}
        />
      ) : markers === null ? (
        <div className={MARKER_GRID_CLASS} aria-busy="true" aria-label="Loading your markers">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Card key={i} padding="tight">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-3 h-8 w-20" />
              <Skeleton className="mt-3 h-3 w-24" />
            </Card>
          ))}
        </div>
      ) : markers.length === 0 ? (
        <div className="max-w-2xl">
          <EmptyState
            title="Nothing tested yet"
            description="Every marker from your first released results is listed here."
            action={<LinkButton to="/overview">Back to overview</LinkButton>}
          />
        </div>
      ) : (
        <>
          {/* The count, the grouping and the sort share a row: search and the
              two filters live above the view switch, and these are the controls
              that belong to this arrangement rather than to all three. */}
          {/* Stacked under lg, where the two pickers take the full width and
              the count would otherwise sit awkwardly beside them. */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-x-6">
            <div className="flex flex-wrap items-center gap-4">
              <p className="text-sm text-espresso/80" role="status">
                {filterCountLabel(visible.length, measured.length)}
              </p>
              {filtersApplied && (
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:gap-3">
              <Select
                label="Group by"
                name="marker-grouping"
                value={grouping}
                onChange={(e) => setGrouping(e.target.value as ResultGrouping)}
                className="w-full sm:w-44"
              >
                {RESULT_GROUPINGS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </Select>
              <Select
                label="Sort by"
                name="marker-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="w-full sm:w-56"
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="mt-6 max-w-2xl">
              <EmptyState
                title="Nothing matches those filters"
                action={filtersApplied ? <Button onClick={clearFilters}>Clear filters</Button> : undefined}
              />
            </div>
          ) : grouping === 'HEALTH_AREA' ? (
            <div className="mt-6 flex flex-col gap-12">
              {grouped.map((g) => (
                <section key={g.key} aria-labelledby={`markers-area-${g.key}`}>
                  <AreaGroupHeading
                    id={`markers-area-${g.key}`}
                    name={g.name}
                    note={areaNotes.get(g.key)}
                    markers={g.markers}
                    total={areaTotals.get(g.key) ?? g.markers.length}
                  />
                  <div className={MARKER_GRID_CLASS}>
                    {g.markers.map((marker, i) => (
                      <Reveal key={marker.markerId} delay={staggerDelay(i, 30)} className="h-full">
                        <MarkerResultCard
                          marker={marker}
                          meta={markerMeta(marker)}
                          footer={markerFooter(marker)}
                        />
                      </Reveal>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className={`mt-6 ${MARKER_GRID_CLASS}`}>
              {visible.map((marker, i) => (
                <Reveal key={marker.markerId} delay={staggerDelay(i, 30)} className="h-full">
                  <MarkerResultCard marker={marker} meta={markerMeta(marker)} footer={markerFooter(marker)} />
                </Reveal>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
