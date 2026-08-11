import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { asMarkerStatus, formatDate, type MarkerStatusInput, type OptimalRangeDTO } from '@aspire-bloods/shared';
import { Breadcrumbs } from '../../components/nav/Breadcrumbs';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { LinkButton } from '../../components/ui/LinkButton';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { RangeBar } from '../../components/ui/RangeBar';
import { TrendChart } from '../../components/ui/TrendChart';
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
        <Skeleton className="mt-3 h-12 w-64" />
        {/* Same 40/60 split as the real thing, so nothing jumps sideways
            when the fetch lands. */}
        <div className="mt-12 grid grid-cols-1 gap-7 lg:grid-cols-5">
          <Card className="lg:col-span-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-10 w-32" />
          </Card>
          <Card className="lg:col-span-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-72 w-full" />
          </Card>
        </div>
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
    <div className="motion-safe:animate-riseIn">
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <TwoTierHeading eyebrow="Marker detail" title={detail.name} />
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

      {/* 40/60, not the old even split. The two cards were never equal weight:
          the left one holds a number, a bar and a short history, and the right
          one holds the chart that is the actual reason to be on this page —
          which at half width had a plot area narrower than it was tall. Five
          columns split two and three, because that is the closest simple ratio
          to 40/60. Below lg they stack full width, as before. */}
      <div className="mt-10 grid grid-cols-1 gap-7 lg:grid-cols-5">
        {/* NOT `flex flex-col`, and the previous-results block below carries no
            `mt-auto`. That pair is what opened the dead zone: the history was
            pinned to the floor of a card whose height comes from the chart
            beside it, so a short left card grew a hand's width of nothing
            between the range bar and PREVIOUS RESULTS. The sections now follow
            each other at ordinary section spacing and any slack falls at the
            bottom of the card, where slack reads as nothing at all. */}
        <Card className="lg:col-span-2">
          <p className="eyebrow mb-4">Latest result</p>
          {/* THE ONE EXCEPTION to "every number is mono". This value is the
              emotional anchor of the page and is set in Fraunces at the hero
              optical size, like a headline, with the unit in mono beside it at
              a much smaller size — which is what makes the pair read as a
              measurement rather than as a title with a word after it.
              flex-wrap: a textual result ("Not detected") at display size has
              to wrap rather than push the unit and the copy button out. */}
          <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 font-display opsz-hero text-3xl font-semibold leading-none text-espresso">
            <span className="tabular">{detail.latest.valueText ?? detail.latest.value}</span>
            <span className="numeric text-base font-normal text-espresso/80">{detail.latest.unit}</span>
            <CopyButton
              value={`${detail.latest.valueText ?? detail.latest.value} ${detail.latest.unit}`}
              label="Copy result value"
              className="ml-1"
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
            <p className="mt-2.5 text-xs text-espresso/80">
              Lab reference range{' '}
              <span className="numeric">
                {detail.latest.referenceLow}–{detail.latest.referenceHigh} {detail.latest.unit}
              </span>
            </p>
          )}
          {detail.optimal && (
            <p className="tabular mt-1 text-xs text-espresso/80">
              {optimalRangeLabel(detail.optimal)}
              {optimalStatusLabel(detail.optimal) && (
                <span> · {optimalStatusLabel(detail.optimal)!.toLowerCase()}</span>
              )}
            </p>
          )}
          {/* Empty for anything the clinic analysed itself — see
              lib/sourceLabel.ts. Rendered unguarded, that put an empty
              paragraph and its margin under every in-house result. */}
          {detail.latest.sourceLabel && (
            <p className="mt-1 text-xs text-espresso/80">{detail.latest.sourceLabel}</p>
          )}
          {/* A textual result has no position on a numeric scale, and a result
              with no status was never placed on one — the bar would be a guess
              in both cases, so it is simply not drawn. */}
          {detail.latest.value !== null && latestStatus !== null && (
            <div className="mt-6">
              <RangeBar
                value={detail.latest.value}
                low={detail.latest.referenceLow}
                high={detail.latest.referenceHigh}
                status={latestStatus}
                severityThreshold={detail.latest.severityThreshold}
                optimal={detail.optimal}
              />
            </div>
          )}
          {/* The history, directly beneath the range bar at ordinary section
              spacing. It is the same data the chart on the right plots, read as
              a list rather than as a shape — which is the form somebody wants
              when the question is "what was it last time" rather than "which
              way is it going". */}
          <PreviousResults trend={detail.trend} className="mt-6" />
        </Card>

        <Card className="lg:col-span-3">
          <p className="eyebrow mb-4">Trend over time</p>
          <TrendChart
            data={detail.trend}
            crossSourceComparable={detail.crossSourceComparable}
            optimal={detail.optimal}
            height="tall"
          />
        </Card>
      </div>

      {/* Where a value sits inside the lab range but outside the optimal band,
          say so plainly and once. It is not an out-of-range result and must not
          borrow that treatment - no alert card, no status colour, no advice. */}
      {detail.optimal && detail.optimal.within === false && latestStatus === 'IN_RANGE' && (
        <Card className="mt-8 max-w-3xl">
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
        <Card className="mt-8 max-w-3xl">
          <p className="max-w-measure whitespace-pre-line text-sm leading-relaxed text-espresso">
            {detail.outOfRangeNotice}
          </p>
          <ClinicContactLines className="mt-7" />
        </Card>
      )}

      {detail.explanation && (
        <Card className="mt-8 max-w-3xl" padding="roomy">
          <p className="eyebrow mb-4">What this marker means</p>
          <p className="max-w-measure text-lg leading-relaxed text-espresso">{detail.explanation.whatItIs}</p>
          {detail.explanation.highMeans && (
            <>
              <p className="mt-8 font-medium text-espresso">If it’s high</p>
              <p className="mt-2 max-w-measure text-reading leading-relaxed text-espresso/90">{detail.explanation.highMeans}</p>
            </>
          )}
          {detail.explanation.lowMeans && (
            <>
              <p className="mt-8 font-medium text-espresso">If it’s low</p>
              <p className="mt-2 max-w-measure text-reading leading-relaxed text-espresso/90">{detail.explanation.lowMeans}</p>
            </>
          )}
          {detail.explanation.lifestyleContext && (
            <>
              <p className="mt-8 font-medium text-espresso">Lifestyle context</p>
              <p className="mt-2 max-w-measure text-reading leading-relaxed text-espresso/90">{detail.explanation.lifestyleContext}</p>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
