import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  asMarkerStatus,
  formatDate,
  formatReferenceRange,
  type MarkerStatusInput,
  type OptimalRangeDTO,
} from '@aspire-bloods/shared';
import { Breadcrumbs } from '../../components/nav/Breadcrumbs';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { LinkButton } from '../../components/ui/LinkButton';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { RangeBar } from '../../components/ui/RangeBar';
import { TrendChart } from '../../components/ui/LazyCharts';
import { MarkerExplanationBody } from '../../components/patient/MarkerExplanation';
import { PrintHeader } from '../../components/patient/PrintDocument';
import { Skeleton } from '../../components/ui/Skeleton';
import { CopyButton } from '../../components/ui/CopyButton';
import { ClinicContactLines } from '../../components/patient/ClinicContact';
import { PreviousResults } from '../../components/patient/PreviousResults';
import { apiFetch } from '../../lib/api';
import { optimalRangeLabel, optimalStatusLabel } from '../../lib/markerCopy';
import type { MarkerNavState } from './markerNavState';

interface TrendPoint {
  reportId: string;
  sampleDate: string;
  value: number;
  unit: string;
  converted: boolean;
  originalValue: number;
  originalUnit: string;
  status: MarkerStatusInput;
  referenceLow: number;
  referenceHigh: number;
  /** Where significantly-out begins for this marker — the chart's band edges sit here. */
  severityThreshold?: number;
  sourceKey: string;
  sourceLabel: string;
  amendedAt?: string | null;
}

interface MarkerDetail {
  markerId: string;
  name: string;
  unit: string;
  crossSourceComparable: boolean;
  /** Null for the majority of markers - those have no established optimal range and nothing is said about one. */
  optimal: OptimalRangeDTO | null;
  latest: {
    // Null when the latest result is textual — valueText carries it verbatim.
    value: number | null;
    valueText?: string | null;
    unit: string;
    referenceLow: number;
    referenceHigh: number;
    severityThreshold?: number;
    /** Null where this result has no position on its reference range. Never IN_RANGE by default. */
    status: MarkerStatusInput;
    optimal?: OptimalRangeDTO | null;
    sourceLabel: string;
    amendedAt?: string | null;
  };
  trend: TrendPoint[];
  outOfRangeNotice: string | null;
  /**
   * Null only where a marker has no copy written against it at all. There is
   * no placeholder: the card is simply not rendered, in keeping with the rest
   * of the product, and no review status reaches the patient either way.
   */
  explanation: {
    whatItIs: string;
    highMeans: string | null;
    lowMeans: string | null;
    lifestyleContext: string | null;
  } | null;
}

export function MarkerDetailPage() {
  const { markerId } = useParams<{ markerId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<MarkerDetail | null>(null);
  const [failed, setFailed] = useState(false);

  const navState = location.state as MarkerNavState | null;

  useEffect(() => {
    if (!markerId) return;
    // The prev/next arrows page through a report without unmounting this
    // component, so without clearing `detail` the previous marker's name,
    // value, range and chart stayed on screen under the next marker's URL
    // until the fetch landed — a value shown against the wrong marker, which
    // is the one thing a results page must never do, even for 200ms.
    // `current` guards the case where two clicks land out of order.
    let current = true;
    setDetail(null);
    setFailed(false);
    apiFetch<MarkerDetail>(`/patient/markers/${markerId}`)
      .then((d) => current && setDetail(d))
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [markerId]);

  // Now that the sidebar search and All markers both deep-link here, a stale
  // bookmark or a marker with no released results is far easier to land on
  // than it was — it used to leave the skeleton up indefinitely.
  if (failed) {
    return (
      <>
        <Breadcrumbs items={[{ label: 'Overview', to: '/overview' }, { label: 'Results', to: '/results?view=by-marker' }, { label: 'Not available' }]} />
        <TwoTierHeading eyebrow="Marker detail" title="We couldn’t open that marker" />
        <Card className="mt-10 max-w-xl">
          <p className="max-w-measure text-sm leading-relaxed text-espresso/90">
            You may not have a released result for this marker yet, or the link may be out of date.
          </p>
          <LinkButton to="/results?view=by-marker" className="mt-6">
            See every marker
          </LinkButton>
        </Card>
      </>
    );
  }

  if (!detail) {
    return (
      <div aria-busy="true" aria-label="Loading marker detail">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-3 h-9 w-64" />
        {/* The same shape as the real thing — a hero value, then a full-width
            plot — so nothing jumps when the fetch lands. */}
        <Skeleton className="mt-9 h-16 w-48" />
        <Skeleton className="mt-5 h-5 w-64" />
        <Skeleton className="mt-8 h-9 w-full max-w-xl" />
        <Skeleton className="mt-14 h-4 w-28" />
        <Skeleton className="mt-4 h-80 w-full" />
      </div>
    );
  }

  // Narrowed once. Everything below that asks "was this result placed against
  // its range" asks this, rather than comparing the raw field against null.
  const latestStatus = asMarkerStatus(detail.latest.status);

  // Only present when arriving from a report's marker grid (see ReportView) — a direct/deep
  // link has no report context to page through, so the arrows simply don't render.
  const siblingIndex = navState?.markerIds.indexOf(markerId ?? '') ?? -1;
  const prevMarkerId = navState && siblingIndex > 0 ? navState.markerIds[siblingIndex - 1] : null;
  const nextMarkerId = navState && siblingIndex >= 0 && siblingIndex < navState.markerIds.length - 1 ? navState.markerIds[siblingIndex + 1] : null;

  function goToSibling(id: string) {
    navigate(`/markers/${id}`, { state: navState });
  }

  return (
    // The page arrives in sequence rather than all at once — breadcrumbs,
    // heading, the value, the trend, then everything quieter — which is the
    // reading order the layout is built on, said once in motion. Pure CSS, so
    // it plays on mount and never again: paging to the next marker with the
    // prev/next arrows remounts this and replays it, which is correct, and a
    // re-render does not. See `.stagger-in`.
    <div className="stagger-in">
      {/* The most recent draw this marker has a result from — the trend is
          sorted oldest first, so the sample date is the last row's. */}
      <PrintHeader sampleDate={detail.trend[detail.trend.length - 1]?.sampleDate ?? null} />
      <Breadcrumbs
        items={
          navState
            ? [
                { label: 'Overview', to: '/overview' },
                { label: navState.title, to: `/reports/${navState.reportId}` },
                { label: detail.name },
              ]
            : // Reached from the marker list, a comparison, the library or the sidebar search — none
              // of which is a report, so the trail goes back to the marker list rather than to a panel.
              [
                { label: 'Overview', to: '/overview' },
                { label: 'Results', to: '/results?view=by-marker' },
                { label: detail.name },
              ]
        }
      />

      {/* ── THE HEADER IS A LABEL, NOT THE HEADLINE (Aug 2026) ──────────────
          The marker's NAME used to be `.display-heading`, which is
          clamp(38px…72px) and therefore 72px at 1440 — while the value beneath
          it was 52px. So the biggest thing on a page about somebody's result
          was the word "Ferritin", and the number they came for was two thirds
          its size, sitting inside one of four cards of roughly equal weight.

          The name is a `.section-heading` now (38px, Fraunces medium). It is
          still the h1 and still the first thing read; it has simply stopped
          competing with its own answer. See `.hero-value` for the other half. */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <p className="eyebrow mb-3">Marker detail</p>
          <h1 className="section-heading break-words">{detail.name}</h1>
        </div>
        {navState && (siblingIndex >= 0) && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!prevMarkerId}
              onClick={() => prevMarkerId && goToSibling(prevMarkerId)}
              className="rounded-full border border-taupe p-2 text-espresso transition duration-150 ease-out hover:border-bronze/60 hover:text-bronze disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Previous marker in this report"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M9 2 4 7l5 5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <span className="text-xs text-espresso/80">
              {siblingIndex + 1} of {navState.markerIds.length}
            </span>
            <button
              type="button"
              disabled={!nextMarkerId}
              onClick={() => nextMarkerId && goToSibling(nextMarkerId)}
              className="rounded-full border border-taupe p-2 text-espresso transition duration-150 ease-out hover:border-bronze/60 hover:text-bronze disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Next marker in this report"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M5 2l5 5-5 5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* ═══ 1. THE VALUE. Biggest thing on the page, by a clear margin. ═════
          NO CARD AROUND IT, and that is the point rather than a saving of a
          border. The page used to be four blocks of roughly equal weight —
          latest result, chart, explanation, previous results — each in its own
          box, so nothing said what to read first and the number competed with
          three neighbours drawn exactly like it. A card is a way of saying
          "this is one of several things"; the value is not one of several
          things. It sits directly on the page, and the hierarchy is carried by
          size, weight and space, which is what those are for.

          THE ONE EXCEPTION to "every number is mono": Fraunces at the hero
          optical size, like a headline, with the unit in mono beside it at a
          much smaller size — which is what makes the pair read as a measurement
          rather than as a title with a word after it. flex-wrap, because a
          textual result ("Not detected") at display size has to wrap rather
          than push the unit and the copy button out. */}
      <div className="mt-9">
        <p
          className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 ${
            detail.latest.valueText ? 'hero-value-text' : 'hero-value'
          }`}
        >
          <span className="tabular">{detail.latest.valueText ?? detail.latest.value}</span>
          <span className="numeric text-lg font-normal text-espresso/80">{detail.latest.unit}</span>
          <CopyButton
            value={`${detail.latest.valueText ?? detail.latest.value} ${detail.latest.unit}`}
            label="Copy result value"
            className="ml-1 self-center"
          />
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <StatusBadge status={latestStatus} />
          {detail.latest.amendedAt && (
            <span className="text-xs text-espresso/80">
              Amended <span className="numeric">{formatDate(detail.latest.amendedAt)}</span>
            </span>
          )}
        </div>
        {/* Two ranges, always labelled by whose they are. The lab's is the
            one the status above was decided by; the optimal band underneath
            is advisory context and says so. Where a marker has no
            established optimal, this second line simply isn't there - no
            empty band, no placeholder. */}
        {/* A qualitative result ("Not detected") has no numeric range behind
            it, and this line rendered "Lab reference range 0-0 " for one —
            a half-populated row stating something false. The report card and
            the All-markers row already guarded this; the marker's own page,
            which is where someone goes to read the range properly, did not. */}
        {latestStatus !== null && detail.latest.referenceHigh > detail.latest.referenceLow && (
          <p className="mt-3 text-sm text-espresso/80">
            Lab reference range{' '}
            {/* Formatted rather than interpolated: a range that arrived through
                a unit conversion has no rounding of its own, and printed raw it
                read "3.884960761896305–5.494444506110488 mmol/L". Same
                formatter the trend chart's tooltip, sentence and axis labels
                use, so one range reads the same everywhere on the page. */}
            <span className="numeric">
              {formatReferenceRange(detail.latest.referenceLow, detail.latest.referenceHigh, detail.latest.unit)}
            </span>
          </p>
        )}
        {detail.optimal && (
          <p className="tabular mt-1 text-sm text-espresso/80">
            {optimalRangeLabel(detail.optimal)}
            {optimalStatusLabel(detail.optimal) && (
              <span> · {optimalStatusLabel(detail.optimal)!.toLowerCase()}</span>
            )}
          </p>
        )}
        {/* Empty for anything the clinic analysed itself — see
            lib/sourceLabel.ts. Rendered unguarded, that put an empty
            paragraph and its margin under every in-house result. */}
        {detail.latest.sourceLabel && <p className="mt-1 text-sm text-espresso/80">{detail.latest.sourceLabel}</p>}
        {/* A textual result has no position on a numeric scale, and a result
            with no status was never placed on one — the bar would be a guess
            in both cases, so it is simply not drawn.

            Capped rather than full-bleed: a range bar stretched across 1440px
            of page turns a scale into a horizon, and the mark's position stops
            being readable against the two printed ends. */}
        {detail.latest.value !== null && latestStatus !== null && (
          <div className="mt-8 max-w-2xl">
            <RangeBar
              value={detail.latest.value}
              low={detail.latest.referenceLow}
              high={detail.latest.referenceHigh}
              status={latestStatus}
              severityThreshold={detail.latest.severityThreshold}
              optimal={detail.optimal}
              unit={detail.latest.unit}
            />
          </div>
        )}
      </div>

      {/* ═══ 2. THE TREND. Second, and the full width of the page. ═══════════
          Also uncarded. The plot is already an inset panel with its own
          hairline frame (see chart.plotSurface), so a card around it was a box
          drawn immediately outside a box — and at 60% of a five-column grid the
          plot was narrower than it was tall, which is the shape that
          exaggerates every movement in a series. */}
      <section className="mt-14">
        <p className="eyebrow mb-4">Trend over time</p>
        <TrendChart
          data={detail.trend}
          crossSourceComparable={detail.crossSourceComparable}
          optimal={detail.optimal}
          height="tall"
        />
      </section>

      {/* ═══ 3. EVERYTHING ELSE, VISIBLY QUIETER. ════════════════════════════
          A wide margin above this, so the drop in weight is announced by space
          before anything is read. The reading order inside it is fixed and was
          the wrong way round: the EXPLANATION comes before the out-of-range
          card. Somebody who has just been told their result is outside the
          usual range wants to know what the marker is before they are told who
          to ring about it — the definition is context for the prompt, not a
          footnote to it. */}
      <div className="mt-16 max-w-3xl">
        {detail.explanation && (
          // THE SECOND SURFACE REGISTER — see `.card-vellum` in globals.css.
          // The one class of content in the product that is prose rather than
          // data, on the one surface that is not the ordinary card.
          <Card className="card-vellum" padding="roomy">
            {/* Heading, then the definition as the loudest thing in the card,
                then quiet label-and-answer pairs. Four levels, one component,
                shared with the library — see MarkerExplanation.tsx. */}
            <p className="card-eyebrow mb-8">What this marker means</p>
            <MarkerExplanationBody explanation={detail.explanation} />
          </Card>
        )}

        {/* Where a value sits inside the lab range but outside the optimal band,
            say so plainly and once. It is not an out-of-range result and must not
            borrow that treatment - no alert card, no status colour, no advice. */}
        {detail.optimal && detail.optimal.within === false && latestStatus === 'IN_RANGE' && (
          <Card className="mt-8">
            <p className="max-w-measure text-sm leading-relaxed text-espresso/90">
              This result is in range against the lab’s reference range and outside the optimal range of{' '}
              <span className="numeric">
                {detail.optimal.low != null && detail.optimal.high != null
                  ? `${detail.optimal.low}–${detail.optimal.high} ${detail.optimal.unit}`
                  : detail.optimal.high != null
                    ? `below ${detail.optimal.high} ${detail.optimal.unit}`
                    : `${detail.optimal.low} ${detail.optimal.unit} or above`}
              </span>
              . The optimal range is published guidance, separate from how the result was classified. Source:{' '}
              {detail.optimal.source}
            </p>
          </Card>
        )}

        {/* NO COLOURED OUTLINE. This card used to carry a red border, on the
            reasoning that an out-of-range result should be marked as such — but
            the result itself is already tinted and chevroned and worded three
            times over by the time anybody reaches this, and a red box drawn
            around the clinic's phone number reads as an emergency rather than as
            a way to ask a question. Hairline taupe, like every other card.

            The contact details come from the shared component rather than from
            the tail of the copy block, which is where they used to live as one
            comma-joined line. */}
        {detail.outOfRangeNotice && (
          <Card className="mt-8">
            <p className="max-w-measure whitespace-pre-line text-sm leading-relaxed text-espresso">
              {detail.outOfRangeNotice}
            </p>
            <ClinicContactLines className="mt-7" />
          </Card>
        )}

        {/* The history, last and uncarded: the same data the chart plots, read
            as a list rather than as a shape — which is the form somebody wants
            when the question is "what was it last time" rather than "which way
            is it going". It answered that question from inside the hero card
            before, where it was the fourth thing in the loudest block. */}
        <PreviousResults trend={detail.trend} className="mt-12" />
      </div>
    </div>
  );
}
