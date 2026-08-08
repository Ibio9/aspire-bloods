import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { formatDate, type MarkerReviewStatus, type MarkerStatus, type OptimalRangeDTO } from '@aspire-bloods/shared';
import { Breadcrumbs } from '../../components/nav/Breadcrumbs';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { LinkButton } from '../../components/ui/LinkButton';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { RangeBar } from '../../components/ui/RangeBar';
import { TrendChart } from '../../components/ui/TrendChart';
import { Skeleton } from '../../components/ui/Skeleton';
import { CopyButton } from '../../components/ui/CopyButton';
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
  status: MarkerStatus;
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
    status: MarkerStatus;
    optimal?: OptimalRangeDTO | null;
    sourceLabel: string;
    amendedAt?: string | null;
  };
  trend: TrendPoint[];
  outOfRangeNotice: string | null;
  explanation: {
    whatItIs: string;
    highMeans: string | null;
    lowMeans: string | null;
    lifestyleContext: string | null;
    reviewStatus: MarkerReviewStatus;
  };
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
    setFailed(false);
    apiFetch<MarkerDetail>(`/patient/markers/${markerId}`)
      .then(setDetail)
      .catch(() => setFailed(true));
  }, [markerId]);

  // Now that the sidebar search and All markers both deep-link here, a stale
  // bookmark or a marker with no released results is far easier to land on
  // than it was — it used to leave the skeleton up indefinitely.
  if (failed) {
    return (
      <>
        <Breadcrumbs items={[{ label: 'Overview', to: '/overview' }, { label: 'All markers', to: '/markers' }, { label: 'Not available' }]} />
        <TwoTierHeading eyebrow="Marker detail" title="We couldn't open that marker" />
        <Card className="mt-10 max-w-xl">
          <p className="text-sm leading-relaxed text-espresso/90">
            You may not have a released result for this marker yet, or the link may be out of date. Everything you
            have had tested is listed under All markers.
          </p>
          <LinkButton to="/markers" className="mt-6">
            See all markers
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
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-10 w-32" />
          </Card>
          <Card>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-48 w-full" />
          </Card>
        </div>
      </div>
    );
  }

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
            : // Reached from All markers, Trends, the library or the sidebar search — none of which
              // is a report, so the trail goes back to the marker list rather than to a panel.
              [{ label: 'Overview', to: '/overview' }, { label: 'All markers', to: '/markers' }, { label: detail.name }]
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

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <p className="eyebrow mb-5">Latest result</p>
          {/* The value is the loudest thing on the card by a clear step —
              large, tabular, unit smaller beside it. */}
          {/* flex-wrap: a textual result ("Not detected") at display size must
              wrap rather than push the unit and copy button out of the card. */}
          <p className="tabular flex flex-wrap items-baseline gap-2 text-6xl font-semibold leading-none text-espresso">
            {detail.latest.valueText ?? detail.latest.value}
            <span className="text-xl font-normal text-espresso/80">{detail.latest.unit}</span>
            <CopyButton
              value={`${detail.latest.valueText ?? detail.latest.value} ${detail.latest.unit}`}
              label="Copy result value"
              className="ml-1"
            />
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <StatusBadge status={detail.latest.status} />
            {detail.latest.amendedAt && (
              <span className="text-xs text-espresso/80">Amended {formatDate(detail.latest.amendedAt)}</span>
            )}
          </div>
          {/* Two ranges, always labelled by whose they are. The lab's is the
              one the status above was decided by; the optimal band underneath
              is advisory context and says so. Where a marker has no
              established optimal, this second line simply isn't there - no
              empty band, no placeholder. */}
          <p className="tabular mt-2 text-xs text-espresso/80">
            Lab reference range {detail.latest.referenceLow}–{detail.latest.referenceHigh} {detail.latest.unit}
          </p>
          {detail.optimal && (
            <p className="tabular mt-1 text-xs text-espresso/80">
              {optimalRangeLabel(detail.optimal)}
              {optimalStatusLabel(detail.optimal) && (
                <span> · {optimalStatusLabel(detail.optimal)!.toLowerCase()}</span>
              )}
            </p>
          )}
          <p className="mt-1 text-xs text-espresso/80">{detail.latest.sourceLabel}</p>
          {/* A textual result has no position on a numeric scale — the bar
              would be a guess, so it is simply not drawn. */}
          {detail.latest.value !== null && (
            <div className="mt-8">
              <RangeBar
                value={detail.latest.value}
                low={detail.latest.referenceLow}
                high={detail.latest.referenceHigh}
                status={detail.latest.status}
                severityThreshold={detail.latest.severityThreshold}
                optimal={detail.optimal}
              />
            </div>
          )}
        </Card>

        <Card>
          <p className="eyebrow mb-4">Trend over time</p>
          <TrendChart data={detail.trend} crossSourceComparable={detail.crossSourceComparable} optimal={detail.optimal} />
        </Card>
      </div>

      {/* Where a value sits inside the lab range but outside the optimal band,
          say so plainly and once. It is not an out-of-range result and must not
          borrow that treatment - no alert card, no status colour, no advice. */}
      {detail.optimal && detail.optimal.within === false && detail.latest.status === 'IN_RANGE' && (
        <Card className="mt-7 max-w-3xl">
          <p className="text-sm leading-relaxed text-espresso/90">
            This result is in range against the lab's reference range, and outside the optimal range of{' '}
            <span className="tabular">
              {detail.optimal.low != null && detail.optimal.high != null
                ? `${detail.optimal.low}–${detail.optimal.high} ${detail.optimal.unit}`
                : detail.optimal.high != null
                  ? `below ${detail.optimal.high} ${detail.optimal.unit}`
                  : `${detail.optimal.low} ${detail.optimal.unit} or above`}
            </span>
            . The optimal range is published clinical guidance, separate from how this result was classified.
            Source: {detail.optimal.source}
          </p>
        </Card>
      )}

      {detail.outOfRangeNotice && (
        <Card className="mt-7 border-status-significantHigh bg-white">
          <p className="whitespace-pre-line text-sm text-espresso">{detail.outOfRangeNotice}</p>
        </Card>
      )}

      <Card className="mt-7 max-w-3xl" padding="roomy">
        <p className="eyebrow mb-4">What this marker means</p>
        <p className="text-lg leading-relaxed text-espresso">{detail.explanation.whatItIs}</p>
        {detail.explanation.highMeans && (
          <>
            <p className="mt-7 font-medium text-espresso">If it's high</p>
            <p className="mt-1.5 leading-relaxed text-espresso/90">{detail.explanation.highMeans}</p>
          </>
        )}
        {detail.explanation.lowMeans && (
          <>
            <p className="mt-7 font-medium text-espresso">If it's low</p>
            <p className="mt-1.5 leading-relaxed text-espresso/90">{detail.explanation.lowMeans}</p>
          </>
        )}
        {detail.explanation.lifestyleContext && (
          <>
            <p className="mt-7 font-medium text-espresso">Lifestyle context</p>
            <p className="mt-1.5 leading-relaxed text-espresso/90">{detail.explanation.lifestyleContext}</p>
          </>
        )}
      </Card>
    </div>
  );
}
