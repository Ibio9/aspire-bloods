import { useMemo } from 'react';
import { formatDate } from '@aspire-bloods/shared';
import type { MarkerNavState } from './markerNavState';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { LinkButton } from '../../components/ui/LinkButton';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { Reveal } from '../../components/motion/Reveal';
import { staggerDelay } from '../../components/motion/stagger';
import {
  byAttentionThenName,
  byName,
  filterCountLabel,
  groupByHealthArea,
  matchesMarkerQuery,
  matchesStatusFilter,
} from '../../lib/markerCopy';
import { AreaGroupHeading } from './ResultsSummary';
import { MARKER_GRID_CLASS, MarkerResultCard } from './MarkerResultCard';
import { CompositionSection, GeneticSection, SensitivitySection } from './NonMeasuredSections';
import type { ResultsArrangement, ResultsFilters } from './resultsView';
import type { MarkerCard, ReportDetailData } from './useReportDetail';

/**
 * One report's markers, as cards — everything below the control bar.
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
 * describe.
 *
 * EVERY CONTROL IS NOW ELSEWHERE. Search, both filters, grouping and sort all
 * arrive from the one bar above — this screen used to keep grouping and sort of
 * its own, below the report's header, which is what made an open report read as
 * two control bars with a report wedged between them. What is left here is the
 * live count, the way out of a filter that matched nothing, and the markers.
 */
export function ReportDetailView({
  data,
  filters,
  arrangement,
  onClearFilters,
}: {
  data: ReportDetailData;
  filters: ResultsFilters;
  arrangement: ResultsArrangement;
  onClearFilters: () => void;
}) {
  const { report, failed, byType, categories, areaNotes } = data;
  const { query, statusFilter, categoryFilter } = filters;
  const { grouping, reportSort } = arrangement;

  /**
   * The provenance stack under a value: the panel, the sample date, and — only
   * where there is one — the fact that this result was amended.
   *
   * A report has ONE sample date and one panel, so both are the report's
   * rather than the marker's, and repeating them on forty cards is not
   * redundancy: this card is also the thing somebody lands on from a search
   * result, and a value with no date on it is a value nobody can place.
   * One item per line, the date always on its own — see MarkerCardMeta.
   */
  const cardMeta = (m: MarkerCard) => ({
    panelName: report?.panelName ?? null,
    sampleDate: report ? formatDate(report.sampleDate) : '',
    amendedDate: m.amendedAt ? formatDate(m.amendedAt) : null,
  });

  // One comparator, used flat and inside every group — so grouping changes the
  // arrangement and never the order within it.
  const compare = reportSort === 'NAME' ? byName<MarkerCard> : byAttentionThenName<MarkerCard>;

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

  // Under health-area headings, in the catalogue's own order. A marker in four
  // areas appears under all four — see groupByHealthArea; the count above stays
  // the distinct one, so grouping never inflates it.
  const grouped = useMemo(
    () => (grouping === 'HEALTH_AREA' ? groupByHealthArea(visible, categories, compare) : []),
    [grouping, visible, categories, compare],
  );

  // What each area holds BEFORE the filters, so a heading can say "3 of 21
  // markers" rather than claiming the area has three in it. Grouped the same
  // way as the visible set, so the "Other markers" bucket has a total too.
  const areaTotals = useMemo(() => {
    const all = groupByHealthArea(byType.measured, categories);
    return new Map(all.map((g) => [g.key, g.markers.length]));
  }, [byType.measured, categories]);

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

  // A report that was voided since the link was sent, or a stale bookmark,
  // used to sit on the loading skeleton for ever.
  if (failed) {
    return (
      <Card className="max-w-xl">
        <p className="font-display text-xl text-espresso">We couldn’t open that panel</p>
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
        <div className={MARKER_GRID_CLASS}>
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

  return (
    <>
      {/* The live count and the way out of an over-narrow filter, directly
          above the cards they are about — the controls that produced them are
          in the bar overhead. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
        <p className="eyebrow">Every marker on this report</p>
        <div className="flex flex-wrap items-center gap-4">
          <p className="tabular text-sm text-espresso/80" role="status">
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
                    <MarkerResultCard marker={m} navState={navState} note={m.gloss} meta={cardMeta(m)} />
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
              <MarkerResultCard marker={m} navState={navState} note={m.gloss} meta={cardMeta(m)} />
            </Reveal>
          ))}
        </div>
      )}

      {/* Everything that is not a blood measurement, below the results and
          clearly separated from them, each with framing that says what it is
          and is not. Filters above do not touch these — they are answers to a
          different question and hiding them behind a status filter they can
          never satisfy would just make them look broken. */}
      <PersonalMeasurementsSection
        measurements={report.personalMeasurements ?? []}
        note={report.personalMeasurementsNote ?? null}
      />
      <GeneticSection markers={byType.genetic} categories={report.categories ?? []} />
      <CompositionSection markers={byType.composition} categories={report.categories ?? []} />
      <SensitivitySection markers={byType.sensitivity} />
    </>
  );
}

/**
 * Height, weight, the two circumferences, the ratio between them, pulse and
 * both blood pressures — recorded at the clinic visit and returned by the
 * laboratory alongside the analytes.
 *
 * Values and units, and nothing else. No status, no tint, no range bar, no
 * optimal band, because not one of these has a reference range: Randox supply
 * none, and the published thresholds that exist for blood pressure are
 * DIAGNOSTIC thresholds acted on in a consultation with a repeat reading, not
 * a band to print beside a single number. A traffic light here would be this
 * system making a diagnosis, which it does not do.
 *
 * No search or group filter either, unlike the food-sensitivity section: that
 * one has 197 rows and is unusable without one. This has at most eight, and a
 * filter over eight rows is furniture.
 */
function PersonalMeasurementsSection({
  measurements,
  note,
}: {
  measurements: { key: string; name: string; value: number; unit: string }[];
  note: string | null;
}) {
  // Nothing measured, nothing rendered — never an empty section, never a
  // placeholder row. Manual entry and PDF upload carry none of these at all.
  if (measurements.length === 0) return null;

  return (
    <section className="mt-14" aria-labelledby="personal-measurements-heading">
      <h2 id="personal-measurements-heading" className="font-display text-xl text-espresso">
        Personal health measurements
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-espresso/85">
        {note ?? 'Recorded at your clinic visit, not measured from your blood sample.'} They are shown as they were
        taken, without a range — a single reading is not something to read against one.
      </p>
      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {measurements.map((m, i) => (
          <Reveal key={m.key} delay={staggerDelay(i, 24)}>
            <Card className="h-full py-4">
              <dt className="text-sm leading-snug text-espresso/85">{m.name}</dt>
              <dd className="tabular mt-1.5 text-xl font-medium text-espresso">
                {m.value}
                {m.unit && <span className="ml-1 text-base font-normal text-espresso/80">{m.unit}</span>}
              </dd>
            </Card>
          </Reveal>
        ))}
      </dl>
    </section>
  );
}
