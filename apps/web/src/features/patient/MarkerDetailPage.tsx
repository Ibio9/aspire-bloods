import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { MarkerReviewStatus, MarkerStatus } from '@aspire-bloods/shared';
import { Breadcrumbs } from '../../components/nav/Breadcrumbs';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { RangeBar } from '../../components/ui/RangeBar';
import { TrendChart } from '../../components/ui/TrendChart';
import { Skeleton } from '../../components/ui/Skeleton';
import { CopyButton } from '../../components/ui/CopyButton';
import { apiFetch } from '../../lib/api';
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
  sourceKey: string;
  sourceLabel: string;
  amendedAt?: string | null;
}

interface MarkerDetail {
  markerId: string;
  name: string;
  unit: string;
  crossSourceComparable: boolean;
  latest: {
    value: number;
    unit: string;
    referenceLow: number;
    referenceHigh: number;
    status: MarkerStatus;
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

  const navState = location.state as MarkerNavState | null;

  useEffect(() => {
    if (markerId) void apiFetch<MarkerDetail>(`/patient/markers/${markerId}`).then(setDetail);
  }, [markerId]);

  if (!detail) {
    return (
      <div aria-busy="true" aria-label="Loading marker detail">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-3 h-9 w-64" />
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
                { label: 'Your results', to: '/my-results' },
                {
                  label: navState.panelName ?? `${navState.markerIds.length} marker${navState.markerIds.length === 1 ? '' : 's'}`,
                  to: `/reports/${navState.reportId}`,
                },
                { label: detail.name },
              ]
            : [{ label: 'Your results', to: '/my-results' }, { label: detail.name }]
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
            <span className="text-xs text-espresso/60">
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
          <p className="eyebrow mb-4">Latest result</p>
          <p className="flex items-baseline gap-1 tabular text-4xl text-espresso">
            {detail.latest.value} <span className="text-lg">{detail.latest.unit}</span>
            <CopyButton value={`${detail.latest.value} ${detail.latest.unit}`} label="Copy result value" className="ml-1" />
          </p>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge status={detail.latest.status} />
            {detail.latest.amendedAt && (
              <span className="text-xs text-espresso/80">
                Amended {new Date(detail.latest.amendedAt).toLocaleDateString('en-GB')}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-espresso/80">{detail.latest.sourceLabel}</p>
          <div className="mt-6">
            <RangeBar
              value={detail.latest.value}
              low={detail.latest.referenceLow}
              high={detail.latest.referenceHigh}
              status={detail.latest.status}
            />
          </div>
        </Card>

        <Card>
          <p className="eyebrow mb-4">Trend over time</p>
          <TrendChart data={detail.trend} crossSourceComparable={detail.crossSourceComparable} />
        </Card>
      </div>

      {detail.outOfRangeNotice && (
        <Card className="mt-6 border-status-significantHigh bg-white">
          <p className="whitespace-pre-line text-sm text-espresso">{detail.outOfRangeNotice}</p>
        </Card>
      )}

      <Card className="mt-6 max-w-3xl">
        <p className="eyebrow mb-3">What this marker means</p>
        <p className="text-espresso">{detail.explanation.whatItIs}</p>
        {detail.explanation.highMeans && (
          <>
            <p className="mt-4 font-medium text-espresso">If it's high</p>
            <p className="text-espresso">{detail.explanation.highMeans}</p>
          </>
        )}
        {detail.explanation.lowMeans && (
          <>
            <p className="mt-4 font-medium text-espresso">If it's low</p>
            <p className="text-espresso">{detail.explanation.lowMeans}</p>
          </>
        )}
        {detail.explanation.lifestyleContext && (
          <>
            <p className="mt-4 font-medium text-espresso">Lifestyle context</p>
            <p className="text-espresso">{detail.explanation.lifestyleContext}</p>
          </>
        )}
      </Card>
    </div>
  );
}
