import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { MarkerStatus } from '@aspire-bloods/shared';
import { Breadcrumbs } from '../../components/nav/Breadcrumbs';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import type { StatusFilter } from '../../lib/markerCopy';
import { ResultsControlBar } from './ResultsControlBar';
import {
  DEFAULT_ARRANGEMENT,
  EMPTY_FILTERS,
  RESULTS_VIEWS,
  filtersApplied,
  isResultsView,
  type ArrangementScope,
  type ResultsArrangement,
  type ResultsFilters,
  type ResultsView,
} from './resultsView';
import { ReportListView } from './ReportListView';
import { ReportHeader } from './ReportHeader';
import { ReportDetailView } from './ReportDetailView';
import { MarkerListView } from './MarkerListView';
import { CompareView } from './CompareView';
import { useReportDetail } from './useReportDetail';

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
 * THE ORDER OF THE PAGE, and it is the whole point of the layout. With a report
 * open: the report itself first — its title, where it was analysed, its
 * downloads and the five-number summary — then one control bar with every
 * control on it, then the markers. A patient knows which panel they are reading
 * and how it went before they are offered a single tool for going through it.
 * There were two bars with the report's own header sandwiched between them,
 * which read as controls, content, more controls.
 *
 * The bar holds search, both filters, grouping, sort and the view switch, and
 * all of that state lives HERE — so switching view, or grouping, or sort, never
 * throws away anything else you asked for. Everything below the bar is the
 * screen it replaced, behaving exactly as it did: same filters, same sorts,
 * same counts, same empty states.
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
  const navigate = useNavigate();

  // What the bar holds. Component state and nothing more: not the URL, not
  // localStorage, not the server. It changes what is displayed and never what
  // is fetched, and it starts clean on every visit — the same rule the three
  // screens each followed on their own.
  const [filters, setFilters] = useState<ResultsFilters>(EMPTY_FILTERS);
  const [arrangement, setArrangement] = useState<ResultsArrangement>(DEFAULT_ARRANGEMENT);
  // What the ACTIVE view can actually answer for, reported up by that view, so
  // the health-area picker never offers an area that can only return nothing.
  // The open report is the exception — the page fetches that one itself, so it
  // reads the answer straight off the payload rather than being told.
  const [available, setAvailable] = useState<{ key: string; name: string }[]>([]);
  const [viewStatusCounts, setViewStatusCounts] = useState<Record<StatusFilter, number> | undefined>();

  // No-ops without an id, so the two views that are not a report cost nothing.
  const report = useReportDetail(reportId);

  const paramView = searchParams.get('view');
  // An open report is a report view by definition, whatever the URL says.
  const view: ResultsView = reportId ? 'by-report' : isResultsView(paramView) ? paramView : 'by-report';

  const setView = useCallback(
    (next: ResultsView) => {
      // Already where we are. Pressing "By report" inside an open report is
      // pressing the selected tab, and a selected tab does nothing.
      if (next === view) return;
      const params = new URLSearchParams(searchParams);
      if (next === 'by-report') params.delete('view');
      else params.set('view', next);
      // The comparison's own selection is meaningless anywhere else and would
      // otherwise sit in the URL of a page that ignores it.
      if (next !== 'compare') params.delete('markers');
      // Each view answers for its own areas and its own counts; until the new
      // one says otherwise, the page offers neither rather than the last one's.
      setAvailable([]);
      setViewStatusCounts(undefined);

      /**
       * Inside an open report the view is pinned by the ROUTE, not by the query
       * string — /reports/:id IS the report view, whatever ?view= says. So
       * writing the parameter here changed the URL and nothing else: the two
       * other tabs were visibly there, took the click, and left the reader on
       * the same report. A control that is on screen and does nothing is worse
       * than one that is absent, and these two have somewhere real to go.
       *
       * A push rather than a replace: the report is where the reader just was
       * and Back is how they expect to return to it.
       */
      if (reportId) {
        const search = params.toString();
        navigate({ pathname: '/results', search: search ? `?${search}` : '' });
        return;
      }
      setSearchParams(params, { replace: true });
    },
    [view, reportId, navigate, searchParams, setSearchParams],
  );

  const updateFilters = useCallback((next: Partial<ResultsFilters>) => {
    setFilters((f) => ({ ...f, ...next }));
  }, []);
  const updateArrangement = useCallback((next: Partial<ResultsArrangement>) => {
    setArrangement((a) => ({ ...a, ...next }));
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
  const onStatusCounts = useCallback((counts: Record<StatusFilter, number>) => setViewStatusCounts(counts), []);

  // The report list arranges itself by date and the comparison by its own
  // selection, so neither offers a grouping or a sort — see ArrangementScope.
  const scope: ArrangementScope = reportId ? 'REPORT' : view === 'by-marker' ? 'MARKER' : null;

  const activeCategories = reportId ? report.categoryOptions : available;
  const statusCounts = reportId ? report.statusCounts : viewStatusCounts;

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
    if (filters.categoryFilter === 'ALL' || activeCategories.some((c) => c.key === filters.categoryFilter)) return activeCategories;
    return [...activeCategories, { key: filters.categoryFilter, name: 'Selected area, not in this view' }];
  }, [activeCategories, filters.categoryFilter]);

  return (
    <>
      {reportId && (
        <Breadcrumbs items={[{ label: 'Overview', to: '/overview' }, { label: 'Results', to: '/results' }, { label: 'Report' }]} />
      )}
      <TwoTierHeading eyebrow="Aspire Clinic · Patient portal" title="Results" />

      {/* Which report, and how it went, before any control that acts on it. */}
      {reportId && (
        <ReportHeader
          key={reportId}
          reportId={reportId}
          data={report}
          activeStatus={filters.statusFilter}
          onSelectStatus={onStatusFilter}
        />
      )}

      {/* Rendered on all three views, including the bare report list where
          there are as yet no markers to narrow. A control that appears and
          disappears as you move between the views reads as though the thing
          you typed has been thrown away, which is the exact opposite of what
          hoisting it up here was for. */}
      <ResultsControlBar
        filters={filters}
        onChange={updateFilters}
        categories={categoryOptions}
        statusCounts={statusCounts}
        arrangement={arrangement}
        onArrange={updateArrangement}
        scope={scope}
        view={view}
        onViewChange={setView}
        panelId={PANEL_ID}
      />

      <div id={PANEL_ID} role="tabpanel" aria-labelledby={`segment-${view}`} className="motion-safe:animate-fadeIn mt-10">
        {view === 'by-report' &&
          (reportId ? (
            <ReportDetailView
              // Remounts on a change of report, so nothing of the previous
              // one's state survives under the new one's URL.
              key={reportId}
              data={report}
              filters={filters}
              arrangement={arrangement}
              onClearFilters={clearFilters}
            />
          ) : (
            <ReportListView />
          ))}
        {view === 'by-marker' && (
          <MarkerListView
            filters={filters}
            arrangement={arrangement}
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
