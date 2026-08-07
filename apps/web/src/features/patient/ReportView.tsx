import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatDate, type MarkerStatus, type OptimalRangeDTO } from '@aspire-bloods/shared';
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
import {
  STATUS_FILTERS,
  filterCountLabel,
  matchesMarkerQuery,
  matchesStatusFilter,
  optimalRangeLabel,
  optimalStatusLabel,
  type StatusFilter,
} from '../../lib/markerCopy';
import { API_BASE_URL } from '../../lib/apiBase';
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
  status: MarkerStatus;
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
  categories?: SummaryCategory[];
  markers: MarkerCard[];
}

/** Absent means MEASURED — see MarkerCard.resultType. */
function resultTypeOf(m: MarkerCard): string {
  return m.resultType ?? 'MEASURED';
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
  const { show } = useToast();

  useEffect(() => {
    if (!id) return;
    apiFetch<ReportDetail>(`/patient/reports/${id}`)
      .then(setReport)
      .catch(() => setFailed(true));
  }, [id]);

  // Split by result type once. Only MEASURED reaches the grid, the counts strip
  // and the category bars; the other three get their own sections below.
  const byType = useMemo(() => {
    const all = report?.markers ?? [];
    return {
      measured: all.filter((m) => resultTypeOf(m) === 'MEASURED'),
      genetic: all.filter((m) => resultTypeOf(m) === 'GENETIC'),
      sensitivity: all.filter((m) => resultTypeOf(m) === 'SENSITIVITY'),
      composition: all.filter((m) => resultTypeOf(m) === 'COMPOSITION'),
    };
  }, [report]);

  const visible = useMemo(
    () =>
      byType.measured.filter(
        (m) =>
          matchesStatusFilter(m.status, statusFilter) &&
          matchesMarkerQuery(m, query) &&
          (categoryFilter === 'ALL' || (m.categoryKeys ?? []).includes(categoryFilter)),
      ),
    [byType.measured, statusFilter, query, categoryFilter],
  );

  // Only the areas this report actually has markers in — an empty category in
  // the picker is a filter that can only ever produce nothing.
  const filterableCategories = useMemo(() => {
    const present = new Set(byType.measured.flatMap((m) => m.categoryKeys ?? []));
    return (report?.categories ?? []).filter((c) => c.resultType === 'MEASURED' && present.has(c.key));
  }, [report, byType.measured]);

  const filtersApplied = query.trim() !== '' || statusFilter !== 'ALL' || categoryFilter !== 'ALL';

  function clearFilters() {
    setQuery('');
    setStatusFilter('ALL');
    setCategoryFilter('ALL');
  }

  async function handleDownload(kind: 'original-pdf-link' | 'summary-pdf-link') {
    if (!id) return;
    setDownloading(kind);
    try {
      const { url } = await apiFetch<{ url: string }>(`/patient/reports/${id}/${kind}`);
      window.open(`${API_BASE_URL}${url}`, '_blank');
    } catch {
      // Manual-entry reports have no original lab PDF, so this button can
      // legitimately fail — silently doing nothing looked like a broken page.
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
        <Button
          variant="secondary"
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
      <CategorySummaryBars
        markers={byType.measured}
        categories={report.categories ?? []}
        activeCategory={categoryFilter}
        onSelectCategory={setCategoryFilter}
      />

      <div className="mt-14">
        <p className="eyebrow mb-4">Results</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input
            label="Find a marker"
            name="report-marker-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
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
            {STATUS_FILTERS.map((f) => {
              const n = byType.measured.filter((m) => matchesStatusFilter(m.status, f.value)).length;
              return (
                <option key={f.value} value={f.value}>
                  {f.value === 'ALL' ? f.label : `${f.label} (${n})`}
                </option>
              );
            })}
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
                : 'Try clearing the search box, or widening the state and health area you have chosen. Markers that were not part of this panel are never listed here, so a narrower filter cannot reveal them.'
            }
            action={filtersApplied ? <Button onClick={clearFilters}>Clear filters</Button> : undefined}
          />
        </div>
      ) : (
      /* Hierarchy, loudest first: the value, then the range, then the status,
         then the gloss. Clear steps between each level rather than a bordered
         table row where everything competes at the same weight. */
      <div className="mt-6 grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((m, i) => (
          <Reveal key={m.markerId} delay={staggerDelay(i, 30)} className="h-full">
          <Link
            to={`/markers/${m.markerId}`}
            state={{ reportId: report.reportId, title: report.title, markerIds: visible.map((mk) => mk.markerId) } satisfies MarkerNavState}
            className="block h-full rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze"
          >
            {/* The tint is a surface wash and nothing else: the border, the
                type and the shadow are the ordinary card's. The chevron shape
                and the word in StatusBadge below still carry the status on
                their own, in greyscale and to a colourblind reader. */}
            <Card interactive tint={m.status} className="flex h-full flex-col">
              <p className="eyebrow">{m.name}</p>
              {/* flex-wrap: a textual result ("Not detected") at display size
                  must wrap under itself, not push the unit out of the card. */}
              <p className="tabular mt-4 flex flex-wrap items-baseline gap-2 text-stat font-semibold leading-none text-espresso">
                {m.valueText ?? m.value}
                <span className="text-base font-normal text-espresso/80">{m.unit}</span>
              </p>
              {/* The lab's range and the optimal band are two different
                  things and are labelled as two different things. Only the
                  first decides the status badge below. */}
              <p className="tabular mt-3 text-xs text-espresso/80">
                Lab reference range {m.referenceLow}–{m.referenceHigh} {m.unit}
              </p>
              {m.optimal && (
                <p className="tabular mt-1 text-xs text-espresso/80">
                  {optimalRangeLabel(m.optimal)}
                  {optimalStatusLabel(m.optimal) && (
                    <span> · {optimalStatusLabel(m.optimal)!.toLowerCase()}</span>
                  )}
                </p>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <StatusBadge status={m.status} />
                {m.amendedAt && <span className="text-xs text-espresso/80">Amended {formatDate(m.amendedAt)}</span>}
              </div>
              {m.gloss && <p className="mt-5 text-sm leading-relaxed text-espresso/90">{m.gloss}</p>}
            </Card>
          </Link>
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
