import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatDate, hasResultValue, NO_STATUS_LABEL, type MarkerStatus, type OptimalRangeDTO } from '@aspire-bloods/shared';
import { Breadcrumbs } from '../../components/nav/Breadcrumbs';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import type { MarkerNavState } from './markerNavState';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { LinkButton } from '../../components/ui/LinkButton';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { Reveal } from '../../components/motion/Reveal';
import { staggerDelay } from '../../components/motion/stagger';
import { useToast } from '../../components/ui/Toast';
import { apiFetch } from '../../lib/api';
import { downloadSignedFile } from '../../lib/download';
import {
  RESULT_SORTS,
  STATUS_FILTERS,
  byAttentionThenName,
  filterCountLabel,
  groupByHealthArea,
  matchesMarkerQuery,
  matchesStatusFilter,
  optimalRangeLabel,
  optimalStatusLabel,
  statusFilterCounts,
  type ResultSort,
  type StatusFilter,
} from '../../lib/markerCopy';
import { ReportBookingLink } from '../booking/ReportBookingLink';
import { CategorySummaryBars, CountsStrip, type SummaryCategory } from './ResultsSummary';
import { CompositionSection, GeneticSection, SensitivitySection } from './NonMeasuredSections';

interface MarkerCard {
  markerId: string;
  name: string;
  // Exactly one of value/valueText is set — valueText carries a textual lab
  // result ("< 0.6", "Not detected") verbatim.
  value: number | null;
  valueText?: string | null;
  unit: string;
  referenceLow: number;
  referenceHigh: number;
  /**
   * Null when this result has no position on its reference range. The card
   * then shows the value and says so in words, with no tint, no shape mark and
   * no place in any count. It is never rendered as "In range".
   */
  status: MarkerStatus | null;
  /**
   * MEASURED / GENETIC / SENSITIVITY / COMPOSITION. Absent on a payload from
   * before result types existed, which is treated as MEASURED — that is what
   * everything was.
   */
  resultType?: string;
  categoryKeys?: string[];
  aliases?: string[];
  /** Null for the majority of markers; nothing about optimal is shown for those. */
  optimal?: OptimalRangeDTO | null;
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
 * One measured result.
 *
 * Hierarchy, loudest first: the value, then the range, then the status, then
 * the gloss. Clear steps between each level rather than a bordered table row
 * where everything competes at the same weight.
 *
 * Extracted so the flat grid and the grouped-by-health-area view render the
 * identical card — the sort changes the arrangement and nothing else.
 */
function ResultCard({ marker: m, navState }: { marker: MarkerCard; navState: MarkerNavState }) {
  return (
    <Link
      to={`/markers/${m.markerId}`}
      state={navState}
      className="block h-full rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze"
    >
      {/* The tint is a surface wash and nothing else: the border, the type and
          the shadow are the ordinary card's. The chevron shape and the word in
          StatusBadge below still carry the status on their own, in greyscale
          and to a colourblind reader. */}
      <Card interactive tint={m.status} className="flex h-full flex-col">
        <p className="eyebrow">{m.name}</p>
        {/* flex-wrap: a textual result ("Not detected") at display size must
            wrap under itself, not push the unit out of the card. */}
        <p className="tabular mt-4 flex flex-wrap items-baseline gap-2 text-stat font-semibold leading-none text-espresso">
          {m.valueText ?? m.value}
          <span className="text-base font-normal text-espresso/80">{m.unit}</span>
        </p>
        {/* The lab's range and the optimal band are two different things and
            are labelled as two different things. Only the first decides the
            status badge below.
            A qualitative result ("Not detected") has no numeric range behind
            it, and the row for one used to read "Lab reference range 0–0" —
            which is a half-populated row saying something false. Where there
            is no range, the line is simply absent. */}
        {/* The range is only shown where it was actually applied. A result
            with no status was not compared against it, so printing the range
            beside the value would invite the reader to do the comparison
            themselves — which is the thing nobody could do. */}
        {m.status !== null && m.referenceHigh > m.referenceLow && (
          <p className="tabular mt-3 text-xs text-espresso/80">
            Lab reference range {m.referenceLow}–{m.referenceHigh} {m.unit}
          </p>
        )}
        {m.status === null && (
          <p className="mt-3 text-xs text-espresso/80">{NO_STATUS_LABEL}</p>
        )}
        {m.optimal && (
          <p className="tabular mt-1 text-xs text-espresso/80">
            {optimalRangeLabel(m.optimal)}
            {optimalStatusLabel(m.optimal) && <span> · {optimalStatusLabel(m.optimal)!.toLowerCase()}</span>}
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {/* Absent, not blank, where there is no status: StatusBadge renders
              the words with no mark and no colour, and the tint above is not
              applied at all. */}
          {m.status !== null && <StatusBadge status={m.status} />}
          {m.amendedAt && <span className="text-xs text-espresso/80">Amended {formatDate(m.amendedAt)}</span>}
        </div>
        {m.gloss && <p className="mt-5 text-sm leading-relaxed text-espresso/90">{m.gloss}</p>}
      </Card>
    </Link>
  );
}

export function ReportView() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  // Filter state is deliberately component state and nothing more: not the
  // URL, not localStorage, not the server. It changes what is displayed and
  // never what is fetched, and it starts clean on every visit — a report you
  // opened last month should not still be hiding two thirds of itself because
  // of something you clicked then.
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [sort, setSort] = useState<ResultSort>('HEALTH_AREA');
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
  // and the category bars; the other three get their own sections below.
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
    if (sort === 'NAME') return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'STATUS') return [...filtered].sort(byAttentionThenName);
    // HEALTH_AREA keeps the report's own order here; the grouping below is what
    // gives that sort its shape, and re-sorting flat would fight it.
    return filtered;
  }, [byType.measured, statusFilter, query, categoryFilter, sort]);

  // Only the areas this report actually has markers in — an empty category in
  // the picker is a filter that can only ever produce nothing.
  const filterableCategories = useMemo(() => {
    const present = new Set(byType.measured.flatMap((m) => m.categoryKeys ?? []));
    return (report?.categories ?? []).filter((c) => c.resultType === 'MEASURED' && present.has(c.key));
  }, [report, byType.measured]);

  // Under health-area headings, in the catalogue's own order. A marker in four
  // areas appears under all four — see groupByHealthArea; the count below
  // stays the distinct one, so grouping never inflates it.
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
      <>
        <Breadcrumbs items={[{ label: 'Overview', to: '/overview' }, { label: 'My results', to: '/my-results' }, { label: 'Not available' }]} />
        <TwoTierHeading eyebrow="Aspire Clinic · Patient portal" title="We couldn't open that panel" />
        <Card className="mt-10 max-w-xl">
          <p className="text-sm leading-relaxed text-espresso/90">
            This report may no longer be available, or the link may be out of date. Everything currently released to
            you is listed under My results.
          </p>
          <LinkButton to="/my-results" className="mt-6">
            Back to my results
          </LinkButton>
        </Card>
      </>
    );
  }

  if (!report) {
    return (
      <div aria-busy="true" aria-label="Loading report">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-9 w-72" />
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Card key={i}>
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-2 h-7 w-20" />
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
      {/* Three levels now the portal has an Overview above the report list —
          the trail has to show the whole way back, not just one step. */}
      <Breadcrumbs
        items={[
          { label: 'Overview', to: '/overview' },
          { label: 'My results', to: '/my-results' },
          { label: `${title}, ${sampleDate}` },
        ]}
      />
      <TwoTierHeading eyebrow={`Sample date ${sampleDate}`} title={title} />
      {report.sourceLabel && <p className="mt-3 text-sm text-espresso/80">{report.sourceLabel}</p>}
      {/* Provenance — the appointment this sample came from, when the booking
          system knows of one. Renders nothing for reports that pre-date it. */}
      <ReportBookingLink reportId={report.reportId} />

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

      {/* Two summaries, both MEASURED-only: how many markers landed in each
          state, then how that breaks down by health area. Both double as
          filters for the grid below. */}
      <CountsStrip
        markers={byType.measured}
        activeStatus={statusFilter}
        onSelectStatus={(s) => setStatusFilter(s as StatusFilter)}
      />
      {/* Each area opens where it is, showing its own markers underneath its
          own bar, rather than rewriting the grid several screens below and
          leaving the reader where they clicked. */}
      <CategorySummaryBars
        markers={byType.measured}
        categories={report.categories ?? []}
        visibleMarkers={visible}
        renderMarker={(m) => <ResultCard key={m.markerId} marker={m} navState={navState} />}
      />

      <div className="mt-14">
        <p className="eyebrow mb-4">Results</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label="Find a marker"
            name="report-marker-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            // The abbreviation is the only name most people know, and search
            // matches aliases as well as the printed name — so "ALT" finds
            // Alanine Aminotransferase and "TSH" finds Thyroid Stimulating
            // Hormone. The placeholder says so by example.
            placeholder="Ferritin, ALT, TSH…"
            // A filter, not a form field — Input marks required by default, which
            // would be wrong on something you can legitimately leave blank.
            required={false}
          />
          <Select
            label="Show"
            name="report-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.value === 'ALL' ? f.label : `${f.label} (${statusCounts[f.value]})`}
              </option>
            ))}
          </Select>
          <Select
            label="Health area"
            name="report-category-filter"
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
          <Select
            label="Sort by"
            name="report-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as ResultSort)}
          >
            {RESULT_SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          <p className="text-sm text-espresso/80" role="status">
            {filterCountLabel(visible.length, byType.measured.length)}
          </p>
          {filtersApplied && (
            <Button variant="secondary" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="mt-6 max-w-2xl">
          <EmptyState
            title="Nothing matches those filters"
            description={
              byType.measured.length === 0
                ? 'This report has no standard blood measurements. Anything it does contain is shown in the sections below.'
                : 'Try clearing the search box, or widening the state and health area you have chosen.'
            }
            action={filtersApplied ? <Button onClick={clearFilters}>Clear filters</Button> : undefined}
          />
        </div>
      ) : sort === 'HEALTH_AREA' ? (
        /* Under headings. Twenty short lists about twenty different things,
           rather than one 150-card wall — and the one arrangement in which a
           full Signature panel is a document somebody reads rather than
           scrolls past. Areas overlap, and the note above the bars says so. */
        <div className="mt-6 flex flex-col gap-12">
          {grouped.map((g) => (
            <section key={g.key} aria-labelledby={`area-${g.key}`}>
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-taupe pb-2">
                <h2 id={`area-${g.key}`} className="font-display text-2xl leading-tight text-espresso">
                  {g.name}
                </h2>
                <p className="tabular text-xs text-espresso/80">
                  {g.markers.length} marker{g.markers.length === 1 ? '' : 's'}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-3">
                {g.markers.map((m, i) => (
                  <Reveal key={m.markerId} delay={staggerDelay(i, 30)} className="h-full">
                    <ResultCard marker={m} navState={navState} />
                  </Reveal>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
      <div className="mt-6 grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((m, i) => (
          <Reveal key={m.markerId} delay={staggerDelay(i, 30)} className="h-full">
            <ResultCard marker={m} navState={navState} />
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
