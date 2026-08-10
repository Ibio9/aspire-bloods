import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate, hasResultValue } from '@aspire-bloods/shared';
import type { MarkerStatus } from '@aspire-bloods/shared';
import type { MarkerNavState } from './markerNavState';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { LinkButton } from '../../components/ui/LinkButton';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { Reveal } from '../../components/motion/Reveal';
import { staggerDelay } from '../../components/motion/stagger';
import { useToast } from '../../components/ui/Toast';
import { apiFetch } from '../../lib/api';
import { downloadSignedFile } from '../../lib/download';
import {
  RESULT_GROUPINGS,
  RESULT_SORTS,
  byAttentionThenName,
  byName,
  filterCountLabel,
  groupByHealthArea,
  matchesMarkerQuery,
  matchesStatusFilter,
  statusFilterCounts,
  type ResultGrouping,
  type ResultSort,
  type StatusFilter,
} from '../../lib/markerCopy';
import { BOOKING_ENABLED } from '../../lib/features';
import { ReportBookingLink } from '../booking/ReportBookingLink';
import { AreaGroupHeading, CountsStrip, type SummaryCategory } from './ResultsSummary';
import { MARKER_GRID_CLASS, MarkerResultCard, type MarkerCardResult } from './MarkerResultCard';
import { CompositionSection, GeneticSection, SensitivitySection } from './NonMeasuredSections';
import type { ResultsFilters, ViewReportsCategories } from './resultsView';

interface MarkerCard extends MarkerCardResult {
  /**
   * MEASURED / GENETIC / SENSITIVITY / COMPOSITION. Absent on a payload from
   * before result types existed, which is treated as MEASURED — that is what
   * everything was.
   */
  resultType?: string;
  categoryKeys?: string[];
  aliases?: string[];
  gloss: string;
  amendedAt?: string | null;
}

interface ReportDetail {
  reportId: string;
  panelName: string | null;
  markerCount?: number;
  title: string;
  sampleDate: string;
  sourceLabel?: string;
  /** False for a manually entered report — there is no laboratory PDF behind one. */
  hasOriginalPdf?: boolean;
  originalFilename?: string | null;
  categories?: SummaryCategory[];
  markers: MarkerCard[];
}

/** Absent means MEASURED — see MarkerCard.resultType. */
function resultTypeOf(m: MarkerCard): string {
  return m.resultType ?? 'MEASURED';
}

/**
 * One report, opened — the counts strip and the report's markers as cards.
 *
 * WHAT THIS USED TO BE. The same report shown twice: a block of health-area
 * summary bars, each opening in place to reveal that area's markers, and then
 * the whole marker list again below it, grouped under health-area headings.
 * Two renderings of one grouping, one above the other, with the same cards in
 * both. Opening an area put a copy of markers on screen that were already
 * further down the page.
 *
 * The cards are now the single presentation. Grouping by health area is one
 * control rather than a second block, and the per-area counts the bars carried
 * moved into the headings, where they sit directly above the markers they
 * describe. The counts strip stays: it summarises the whole report in five
 * numbers, which is not something the groups say.
 *
 * Search, the status filter and the health-area filter arrive from the Results
 * page above rather than being three more controls on this screen. Grouping and
 * SORT stay here, because they are properties of this arrangement — and they
 * survive each other: changing one never resets the other, nor the filters.
 */
export function ReportDetailView({
  reportId,
  filters,
  onStatusFilter,
  onClearFilters,
  onCategoriesAvailable,
  onStatusCounts,
}: {
  reportId: string;
  filters: ResultsFilters;
  /** The counts strip doubles as a status filter, and writes to the shared one. */
  onStatusFilter: (status: MarkerStatus | 'ALL') => void;
  onClearFilters: () => void;
  onStatusCounts?: (counts: Record<StatusFilter, number>) => void;
} & ViewReportsCategories) {
  const id = reportId;
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const { query, statusFilter, categoryFilter } = filters;
  // Grouping and sort are deliberately component state and nothing more: not
  // the URL, not localStorage, not the server. They change what is displayed
  // and never what is fetched, and they start clean on every visit.
  const [grouping, setGrouping] = useState<ResultGrouping>('NONE');
  const [sort, setSort] = useState<ResultSort>('STATUS');
  const { show } = useToast();

  useEffect(() => {
    if (!id) return;
    // Reset on every id change, and ignore a response that arrives after the
    // id has moved on. Without the reset, navigating from one report to
    // another showed the previous report's markers under the new one's URL
    // until the fetch landed; and `failed` was write-once, so a single bad
    // link left "We couldn't open that panel" pinned over every subsequent
    // report for the rest of the session.
    let current = true;
    setReport(null);
    setFailed(false);
    apiFetch<ReportDetail>(`/patient/reports/${id}`)
      .then((r) => current && setReport(r))
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [id]);

  // Split by result type once. Only MEASURED reaches the grid, the counts strip
  // and the group headings; the other three get their own sections below.
  const byType = useMemo(() => {
    // A marker with no result renders nowhere — never a placeholder, never an
    // empty row. The server no longer sends one; this is the second lock on
    // the same door, because the cost of one slipping through is a patient
    // being told something about a test that was never performed.
    const all = (report?.markers ?? []).filter(hasResultValue);
    return {
      measured: all.filter((m) => resultTypeOf(m) === 'MEASURED'),
      genetic: all.filter((m) => resultTypeOf(m) === 'GENETIC'),
      sensitivity: all.filter((m) => resultTypeOf(m) === 'SENSITIVITY'),
      composition: all.filter((m) => resultTypeOf(m) === 'COMPOSITION'),
    };
  }, [report]);

  // The count beside each status-filter option, in one pass rather than one
  // filter per option per render.
  const statusCounts = useMemo(() => statusFilterCounts(byType.measured), [byType.measured]);

  // One comparator, used flat and inside every group — so grouping changes the
  // arrangement and never the order within it.
  const compare = sort === 'NAME' ? byName<MarkerCard> : byAttentionThenName<MarkerCard>;

  // Filter first, sort second. Nothing here changes what was FETCHED — the
  // report is whatever it is, and a marker the report doesn't contain has no
  // row to hide or show. Filtering can only ever remove cards that exist.
  const visible = useMemo(() => {
    const filtered = byType.measured.filter(
      (m) =>
        matchesStatusFilter(m.status, statusFilter) &&
        matchesMarkerQuery(m, query) &&
        (categoryFilter === 'ALL' || (m.categoryKeys ?? []).includes(categoryFilter)),
    );
    return [...filtered].sort(compare);
  }, [byType.measured, statusFilter, query, categoryFilter, compare]);

  // Only the areas this report actually has markers in — an empty category in
  // the picker is a filter that can only ever produce nothing.
  const filterableCategories = useMemo(() => {
    const present = new Set(byType.measured.flatMap((m) => m.categoryKeys ?? []));
    return (report?.categories ?? []).filter((c) => c.resultType === 'MEASURED' && present.has(c.key));
  }, [report, byType.measured]);

  // Under health-area headings, in the catalogue's own order. A marker in four
  // areas appears under all four — see groupByHealthArea; the count above stays
  // the distinct one, so grouping never inflates it.
  const grouped = useMemo(
    () => (grouping === 'HEALTH_AREA' ? groupByHealthArea(visible, filterableCategories, compare) : []),
    [grouping, visible, filterableCategories, compare],
  );

  // What each area holds BEFORE the filters, so a heading can say "3 of 21
  // markers" rather than claiming the area has three in it. Grouped the same
  // way as the visible set, so the "Other markers" bucket has a total too.
  const areaTotals = useMemo(() => {
    const all = groupByHealthArea(byType.measured, filterableCategories);
    return new Map(all.map((g) => [g.key, g.markers.length]));
  }, [byType.measured, filterableCategories]);

  const areaNotes = useMemo(
    () => new Map((report?.categories ?? []).map((c) => [c.key, c.note])),
    [report],
  );

  // The page's health-area picker offers exactly the areas this report has
  // markers in — an option that can only ever produce nothing is worse than no
  // option — and its status counts come from this report's own markers.
  useEffect(() => {
    onCategoriesAvailable?.(filterableCategories.map((c) => ({ key: c.key, name: c.name })));
  }, [filterableCategories, onCategoriesAvailable]);
  useEffect(() => {
    onStatusCounts?.(statusCounts);
  }, [statusCounts, onStatusCounts]);

  const filtersApplied = query.trim() !== '' || statusFilter !== 'ALL' || categoryFilter !== 'ALL';
  const clearFilters = onClearFilters;

  // Prev/next on the marker detail page walks the list the patient is actually
  // looking at, in the order they are looking at it — so it has to be the
  // filtered, sorted set rather than the report's raw order.
  const navState: MarkerNavState = {
    reportId: report?.reportId ?? '',
    title: report?.title ?? '',
    markerIds: visible.map((m) => m.markerId),
  };

  async function handleDownload(kind: 'original-pdf-link' | 'summary-pdf-link') {
    if (!id || !report) return;
    setDownloading(kind);
    try {
      // Fetched and saved rather than opened in a tab. A window.open issued
      // after an await has left the click's user-gesture window and is blocked
      // outright by iOS Safari and by default in desktop Safari — the button
      // spun, finished, and produced nothing. See lib/download.ts.
      await downloadSignedFile(
        `/patient/reports/${id}/${kind}`,
        kind === 'summary-pdf-link'
          ? `aspire-summary-${report.sampleDate}.pdf`
          : (report.originalFilename ?? `laboratory-report-${report.sampleDate}.pdf`),
      );
    } catch {
      show('That download could not be prepared. Please try again.', 'error');
    } finally {
      setDownloading(null);
    }
  }

  // A report that was voided since the link was sent, or a stale bookmark,
  // used to sit on the loading skeleton for ever.
  if (failed) {
    return (
      <Card className="max-w-xl">
        <p className="font-display text-2xl text-espresso">We couldn't open that panel</p>
        <p className="mt-2 text-sm leading-relaxed text-espresso/90">
          This report may no longer be available, or the link may be out of date.
        </p>
        <LinkButton to="/results" className="mt-6">
          Back to all reports
        </LinkButton>
      </Card>
    );
  }

  if (!report) {
    return (
      <div aria-busy="true" aria-label="Loading report">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-9 w-72" />
        <div className={`mt-10 ${MARKER_GRID_CLASS}`}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Card key={i} padding="tight">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-3 h-8 w-20" />
              <Skeleton className="mt-3 h-3 w-24" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const title = report.title;
  const sampleDate = formatDate(report.sampleDate);

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div>
          <p className="eyebrow mb-2">Sample date {sampleDate}</p>
          <h2 className="font-display text-3xl leading-tight text-espresso sm:text-4xl">{title}</h2>
          {report.sourceLabel && <p className="mt-2 text-sm text-espresso/80">{report.sourceLabel}</p>}
        </div>
        <Link
          to="/results"
          className="rounded-input text-sm font-medium text-bronze-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze"
        >
          All reports
        </Link>
      </div>
      {/* Provenance — the appointment this sample came from, when the booking
          system knows of one. Renders nothing for reports that pre-date it,
          and nothing at all while booking is off: this portal keeps no diary
          to link back to. */}
      {BOOKING_ENABLED && <ReportBookingLink reportId={report.reportId} />}

      <div className="mt-8 flex flex-wrap gap-3">
        <Button
          variant="secondary"
          loading={downloading === 'summary-pdf-link'}
          onClick={() => void handleDownload('summary-pdf-link')}
        >
          Download Aspire summary (PDF)
        </Button>
        {/* Disabled with a reason rather than offered and allowed to 404 —
            a manually entered report has no laboratory PDF behind it, and the
            server now says so on the payload. Matches Documents, which has
            always got this right. */}
        <Button
          variant="secondary"
          disabled={report.hasOriginalPdf === false}
          disabledReason="These results were entered by the clinical team, so there's no original laboratory PDF."
          loading={downloading === 'original-pdf-link'}
          onClick={() => void handleDownload('original-pdf-link')}
        >
          Download original report (PDF)
        </Button>
      </div>

      {/* MEASURED-only, and a summary of the whole report rather than of any
          grouping of it — which is why it survives while the per-area bars did
          not. It doubles as the status filter. */}
      <CountsStrip markers={byType.measured} activeStatus={statusFilter} onSelectStatus={onStatusFilter} />

      <div className="mt-14">
        <p className="eyebrow mb-4">Every marker on this report</p>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-x-6">
          <div className="flex flex-wrap items-center gap-4">
            <p className="text-sm text-espresso/80" role="status">
              {filterCountLabel(visible.length, byType.measured.length)}
            </p>
            {filtersApplied && (
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
          {/* Search, status and health area sit above the view switch; grouping
              and sort are properties of THIS arrangement and stay with it. */}
          <div className="flex flex-col gap-4 sm:flex-row sm:gap-3">
            <Select
              label="Group by"
              name="report-grouping"
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
              name="report-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as ResultSort)}
              className="w-full sm:w-52"
            >
              {RESULT_SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="mt-6 max-w-2xl">
          {/* No "try widening your search" line: the Clear filters button is
              the answer and it is right there. The one case that does need a
              sentence is a report with no blood measurements at all, where the
              reader would otherwise think the page had failed. */}
          <EmptyState
            title={byType.measured.length === 0 ? 'No blood measurements on this report' : 'Nothing matches those filters'}
            description={
              byType.measured.length === 0
                ? 'Everything this report does contain is in the sections below.'
                : undefined
            }
            action={filtersApplied ? <Button onClick={clearFilters}>Clear filters</Button> : undefined}
          />
        </div>
      ) : grouping === 'HEALTH_AREA' ? (
        /* Under headings. Twenty short lists about twenty different things,
           rather than one 150-card wall — and the one arrangement in which a
           full Signature panel is a document somebody reads rather than
           scrolls past. Areas overlap, and each heading's note says so.
           An area the filters have emptied has no heading: groupByHealthArea
           never emits a group with nothing in it. */
        <div className="mt-6 flex flex-col gap-12">
          {grouped.map((g) => (
            <section key={g.key} aria-labelledby={`area-${g.key}`}>
              <AreaGroupHeading
                id={`area-${g.key}`}
                name={g.name}
                note={areaNotes.get(g.key)}
                markers={g.markers}
                total={areaTotals.get(g.key) ?? g.markers.length}
              />
              <div className={MARKER_GRID_CLASS}>
                {g.markers.map((m, i) => (
                  <Reveal key={m.markerId} delay={staggerDelay(i, 30)} className="h-full">
                    <MarkerResultCard
                      marker={m}
                      navState={navState}
                      note={m.gloss}
                      meta={m.amendedAt ? `Amended ${formatDate(m.amendedAt)}` : undefined}
                    />
                  </Reveal>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className={`mt-6 ${MARKER_GRID_CLASS}`}>
          {visible.map((m, i) => (
            <Reveal key={m.markerId} delay={staggerDelay(i, 30)} className="h-full">
              <MarkerResultCard
                marker={m}
                navState={navState}
                note={m.gloss}
                meta={m.amendedAt ? `Amended ${formatDate(m.amendedAt)}` : undefined}
              />
            </Reveal>
          ))}
        </div>
      )}

      {/* Everything that is not a blood measurement, below the results and
          clearly separated from them, each with framing that says what it is
          and is not. Filters above do not touch these — they are answers to a
          different question and hiding them behind a status filter they can
          never satisfy would just make them look broken. */}
      <GeneticSection markers={byType.genetic} categories={report.categories ?? []} />
      <CompositionSection markers={byType.composition} categories={report.categories ?? []} />
      <SensitivitySection markers={byType.sensitivity} />
    </>
  );
}
