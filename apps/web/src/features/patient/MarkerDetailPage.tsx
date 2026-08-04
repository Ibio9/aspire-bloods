import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { MarkerReviewStatus, MarkerStatus } from '@aspire-bloods/shared';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { RangeBar } from '../../components/ui/RangeBar';
import { TrendChart } from '../../components/ui/TrendChart';
import { Skeleton } from '../../components/ui/Skeleton';
import { CopyButton } from '../../components/ui/CopyButton';
import { apiFetch } from '../../lib/api';

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
  const [detail, setDetail] = useState<MarkerDetail | null>(null);

  useEffect(() => {
    if (markerId) void apiFetch<MarkerDetail>(`/patient/markers/${markerId}`).then(setDetail);
  }, [markerId]);

  if (!detail) {
    return (
      <main className="min-h-screen px-6 py-16 md:px-16 bg-cream" aria-busy="true" aria-label="Loading marker detail">
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
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-16 md:px-16 bg-cream motion-safe:animate-riseIn">
      <TwoTierHeading eyebrow="Marker detail" title={detail.name} />

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <p className="eyebrow mb-4">Latest result</p>
          <p className="flex items-baseline gap-1 tabular text-4xl text-espresso">
            {detail.latest.value} <span className="text-lg">{detail.latest.unit}</span>
            <CopyButton value={`${detail.latest.value} ${detail.latest.unit}`} label="Copy result value" className="ml-1" />
          </p>
          <div className="mt-2">
            <StatusBadge status={detail.latest.status} />
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
    </main>
  );
}
