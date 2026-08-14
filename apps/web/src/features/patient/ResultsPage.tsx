import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Breadcrumbs } from '../../components/nav/Breadcrumbs';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import type { StatusFilter } from '../../lib/markerCopy';
import { ResultsControlBar } from './ResultsControlBar';
import {
  DEFAULT_ARRANGEMENT,
  DEFAULT_RESULTS_VIEW,
  EMPTY_FILTERS,
  RESULTS_VIEWS,
  filtersApplied,
  resolveResultsView,
  type ArrangementScope,
  type ResultsArrangement,
  type ResultsFilters,
  type ResultsView,
} from './resultsView';
import { ReportListView } from './ReportListView';
import { ReportHeader } from './ReportHeader';
import { ReportDetailView } from './ReportDetailView';
import { AllMarkersSummary, MarkerListView } from './MarkerListView';
import type { MarkerRow } from '../../lib/patientPortal';
import { CompareView } from './CompareView';
import { RESULT_TYPE_FILTERS, reportSectionCount, resultTypeFilter } from './reportSections';
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
 * BY MARKER is the first tab and the default. The question that keeps bringing
 * people back is "how is my vitamin D doing", and nobody remembers which panel
 * vitamin D was on — see DEFAULT_RESULTS_VIEW. An opened report keeps its own
 * URL and pins the report view, so every link already sent out still works and
 * every release email still lands on the panel it is about.
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
  /**
   * The measured markers the By marker view is showing, so the page can put
   * that view's at-a-glance strip ABOVE the control bar.
   *
   * The order of this page is: what this is, how it went, then the tools for
   * going through it — and it was only half true. Inside an open report the
   * summary is in ReportHeader and the bar follows it; on By marker the bar
   * came first and the summary was the first thing inside the results. Same
   * page, two answers to "when do I get told whether anything needs a look".
   *
   * Lifted as DATA rather than as markup: MarkerListView is what fetches the
   * markers and it goes on owning them, exactly as it already reports its
   * health areas and its status counts up here.
   */
  const [summaryMarkers, setSummaryMarkers] = useState<MarkerRow[]>([]);

  /**
   * WHICH SECTION OF AN OPEN REPORT THE READER HAS ASKED FOR.
   *
   * Two things write it and both are the reader: a chip in the section index
   * above the control bar, and the URL's own hash — so `/reports/:id#sensitivity`
   * out of an email opens the food list rather than landing on nine shut
   * disclosures. A section reads it to open whatever it keeps collapsed.
   *
   * Initialised from the hash rather than set by an effect after mount: an
   * effect would render the shut version first and open it a frame later, which
   * is a page that visibly changes its mind.
   */
  const [revealed, setRevealed] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : decodeURIComponent(window.location.hash.slice(1)) || null,
  );

  // No-ops without an id, so the two views that are not a report cost nothing.
  const report = useReportDetail(reportId);

  const paramView = searchParams.get('view');
  // An open report is the By test view by definition, whatever the URL says.
  // `resolveResultsView` rather than `isResultsView`, so `?view=by-report` out
  // of a bookmark still lands on the view it named.
  const view: ResultsView = reportId ? 'by-test' : (resolveResultsView(paramView) ?? DEFAULT_RESULTS_VIEW);

  const setView = useCallback(
    (next: ResultsView) => {
      // Already where we are. Pressing "By test" inside an open report is
      // pressing the selected tab, and a selected tab does nothing.
      if (next === view) return;
      const params = new URLSearchParams(searchParams);
      // The default view is the one with no parameter, so that /results and
      // /results?view=by-marker are one URL rather than two.
      if (next === DEFAULT_RESULTS_VIEW) params.delete('view');
      else params.set('view', next);
      // The comparison's own selection is meaningless anywhere else and would
      // otherwise sit in the URL of a page that ignores it.
      if (next !== 'compare') params.delete('markers');
      // Each view answers for its own areas and its own counts; until the new
      // one says otherwise, the page offers neither rather than the last one's.
      setAvailable([]);
      setViewStatusCounts(undefined);
      // Same rule for the summary: it describes one view's set, and carrying
      // the last one's across the switch would print a count of markers the
      // page is no longer showing.
      setSummaryMarkers([]);

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
    (status: StatusFilter) =>
      // The counts strip's tiles toggle: pressing the one already selected
      // clears it, exactly as they did on the report screen.
      setFilters((f) => ({ ...f, statusFilter: f.statusFilter === status ? 'ALL' : status })),
    [],
  );
  const onCategoriesAvailable = useCallback((categories: { key: string; name: string }[]) => {
    setAvailable(categories);
  }, []);
  const onStatusCounts = useCallback((counts: Record<StatusFilter, number>) => setViewStatusCounts(counts), []);
  const onSummaryMarkers = useCallback((markers: MarkerRow[]) => setSummaryMarkers(markers), []);

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
  /**
   * The result types this screen can actually narrow to.
   *
   * An open report only, because it is the only screen that draws anything but
   * the marker grid — By marker and Compare are measured markers by
   * construction, and offering "Food sensitivity" there would be a filter whose
   * only possible answer is an empty page. And only where there is more than
   * one of them: a report with nothing but blood measurements gets no group,
   * for the same reason its section index does not render.
   */
  const resultTypeOptions = useMemo(() => {
    if (!reportId) return [];
    const present = RESULT_TYPE_FILTERS.filter((t) => reportSectionCount(report, t.resultType) > 0);
    return present.length > 1 ? present.map((t) => ({ key: t.value, name: t.label })) : [];
  }, [reportId, report]);

  const categoryOptions = useMemo(() => {
    if (
      filters.categoryFilter === 'ALL' ||
      resultTypeFilter(filters.categoryFilter) !== null ||
      activeCategories.some((c) => c.key === filters.categoryFilter)
    ) {
      return activeCategories;
    }
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
          onReveal={setRevealed}
        />
      )}

      {/* AT A GLANCE, THEN THE CONTROLS — in every view, without exception.
          The summary is what you read; the controls are what you reach for
          afterwards. An open report gets its own strip from ReportHeader
          above; this is the By marker view's, over every marker on record. */}
      {view === 'by-marker' && (
        <AllMarkersSummary
          markers={summaryMarkers}
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
        onClearFilters={clearFilters}
        categories={categoryOptions}
        resultTypes={resultTypeOptions}
        statusCounts={statusCounts}
        arrangement={arrangement}
        onArrange={updateArrangement}
        scope={scope}
        view={view}
        onViewChange={setView}
        panelId={PANEL_ID}
      />

      <div id={PANEL_ID} role="tabpanel" aria-labelledby={`segment-${view}`} className="motion-safe:animate-fadeIn mt-10">
        {view === 'by-test' &&
          (reportId ? (
            <ReportDetailView
              // Remounts on a change of report, so nothing of the previous
              // one's state survives under the new one's URL.
              key={reportId}
              data={report}
              filters={filters}
              arrangement={arrangement}
              onClearFilters={clearFilters}
              revealed={revealed}
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
            onSummaryMarkers={onSummaryMarkers}
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
