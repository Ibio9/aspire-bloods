import { useCallback, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import type { MarkerStatus } from '@aspire-bloods/shared';
import { Breadcrumbs } from '../../components/nav/Breadcrumbs';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Segmented } from '../../components/ui/Segmented';
import type { StatusFilter } from '../../lib/markerCopy';
import { ResultsFilterBar } from './ResultsFilterBar';
import {
  EMPTY_FILTERS,
  RESULTS_VIEWS,
  filtersApplied,
  isResultsView,
  type ResultsFilters,
  type ResultsView,
} from './resultsView';
import { ReportListView } from './ReportListView';
import { ReportDetailView } from './ReportDetailView';
import { MarkerListView } from './MarkerListView';
import { CompareView } from './CompareView';

/**
 * Results — one page, three arrangements.
 *
 * It replaces three sidebar destinations that were three answers to
 * overlapping questions about one set of data. My results listed the reports.
 * All markers listed every marker across all of them. Trends plotted a few of
 * those markers together. Each carried its own search box, its own status
 * picker and its own health-area picker, so choosing the wrong one first meant
 * typing the same marker name again somewhere else, and nothing you had
 * narrowed came with you.
 *
 * Now the search and the two filters sit above the switch and apply to
 * whichever arrangement is showing, so moving between them keeps what you
 * asked for. Everything below the switch is the screen it replaced, behaving
 * exactly as it did — same filters, same sorts, same counts, same empty
 * states. This consolidates the navigation; it does not redesign the results.
 *
 * BY REPORT is the default because it is the common case: nearly every visit
 * is somebody coming back to the panel they were just emailed about. An opened
 * report keeps its own URL, so every link already sent out still works.
 *
 * WHAT IS NOT HERE. Clicking any marker, in any of the three, still opens that
 * marker's own page: the explanation, both ranges, and the full trend chart.
 * That is what somebody reads carefully when a result is out of range, and it
 * stays a separate route rather than being folded into a row on a list.
 */

const PANEL_ID = 'results-panel';

export function ResultsPage() {
  // Present only on /reports/:id, which is the same page with one report open.
  const { id: reportId } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  // The three controls above the switch. Component state and nothing more:
  // not the URL, not localStorage, not the server. They change what is
  // displayed and never what is fetched, and they start clean on every visit —
  // the same rule the three screens each followed on their own.
  const [filters, setFilters] = useState<ResultsFilters>(EMPTY_FILTERS);
  // What the ACTIVE view can actually answer for, reported up by that view, so
  // the health-area picker never offers an area that can only return nothing.
  const [available, setAvailable] = useState<{ key: string; name: string }[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<StatusFilter, number> | undefined>();

  const paramView = searchParams.get('view');
  // An open report is a report view by definition, whatever the URL says.
  const view: ResultsView = reportId ? 'by-report' : isResultsView(paramView) ? paramView : 'by-report';

  const setView = useCallback(
    (next: ResultsView) => {
      const params = new URLSearchParams(searchParams);
      if (next === 'by-report') params.delete('view');
      else params.set('view', next);
      // The comparison's own selection is meaningless anywhere else and would
      // otherwise sit in the URL of a page that ignores it.
      if (next !== 'compare') params.delete('markers');
      setSearchParams(params, { replace: true });
      // Each view answers for its own areas and its own counts; until the new
      // one says otherwise, the page offers neither rather than the last one's.
      setAvailable([]);
      setStatusCounts(undefined);
    },
    [searchParams, setSearchParams],
  );

  const updateFilters = useCallback((next: Partial<ResultsFilters>) => {
    setFilters((f) => ({ ...f, ...next }));
  }, []);
  const clearFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);
  const onStatusFilter = useCallback(
    (status: MarkerStatus | 'ALL') =>
      // The counts strip's tiles toggle: pressing the one already selected
      // clears it, exactly as they did on the report screen.
      setFilters((f) => ({ ...f, statusFilter: f.statusFilter === status ? 'ALL' : (status as StatusFilter) })),
    [],
  );
  const onCategoriesAvailable = useCallback((categories: { key: string; name: string }[]) => {
    setAvailable(categories);
  }, []);
  const onStatusCounts = useCallback((counts: Record<StatusFilter, number>) => setStatusCounts(counts), []);

  /**
   * The picker always contains what is currently selected, even where the
   * active view has nothing in that area.
   *
   * Switching view must not silently drop a filter — so rather than resetting
   * a health area the new view doesn't have, the option stays, the view shows
   * nothing, the count says "0 of 42 markers" and Clear filters is right
   * there. A control that no longer lists its own value is the worse failure:
   * it reads as though nothing is filtering while everything is hidden.
   */
  const categoryOptions = useMemo(() => {
    if (filters.categoryFilter === 'ALL' || available.some((c) => c.key === filters.categoryFilter)) return available;
    return [...available, { key: filters.categoryFilter, name: 'Selected area, not in this view' }];
  }, [available, filters.categoryFilter]);

  return (
    <>
      {reportId && (
        <Breadcrumbs items={[{ label: 'Overview', to: '/overview' }, { label: 'Results', to: '/results' }, { label: 'Report' }]} />
      )}
      <TwoTierHeading eyebrow="Aspire Clinic · Patient portal" title="Results" />

      {/* Rendered on all three views, including the bare report list where
          there are as yet no markers to narrow. A control that appears and
          disappears as you move between the views reads as though the thing
          you typed has been thrown away, which is the exact opposite of what
          hoisting it up here was for. */}
      <div className="mt-8">
        <ResultsFilterBar
          filters={filters}
          onChange={updateFilters}
          categories={categoryOptions}
          statusCounts={statusCounts}
        />
      </div>

      <div className="mt-8">
        <Segmented
          options={RESULTS_VIEWS}
          value={view}
          onChange={setView}
          label="Results view"
          panelId={PANEL_ID}
        />
      </div>

      <div id={PANEL_ID} role="tabpanel" aria-labelledby={`segment-${view}`} className="motion-safe:animate-fadeIn mt-10">
        {view === 'by-report' &&
          (reportId ? (
            <ReportDetailView
              // Remounts on a change of report, so nothing of the previous
              // one's state survives under the new one's URL.
              key={reportId}
              reportId={reportId}
              filters={filters}
              onStatusFilter={onStatusFilter}
              onClearFilters={clearFilters}
              onCategoriesAvailable={onCategoriesAvailable}
              onStatusCounts={onStatusCounts}
            />
          ) : (
            <ReportListView />
          ))}
        {view === 'by-marker' && (
          <MarkerListView
            filters={filters}
            onClearFilters={clearFilters}
            onCategoriesAvailable={onCategoriesAvailable}
            onStatusCounts={onStatusCounts}
          />
        )}
        {view === 'compare' && (
          <CompareView filters={filters} onCategoriesAvailable={onCategoriesAvailable} onStatusCounts={onStatusCounts} />
        )}
      </div>

      {filtersApplied(filters) && (
        <p className="sr-only" role="status">
          Filters are applied to the {RESULTS_VIEWS.find((v) => v.value === view)?.label} view.
        </p>
      )}
    </>
  );
}
