import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { MarkerStatus } from '@aspire-bloods/shared';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Skeleton } from '../../components/ui/Skeleton';
import { apiFetch } from '../../lib/api';

interface MarkerCard {
  markerId: string;
  name: string;
  value: number;
  unit: string;
  referenceLow: number;
  referenceHigh: number;
  status: MarkerStatus;
  gloss: string;
}

interface ReportDetail {
  reportId: string;
  panelName: string;
  sampleDate: string;
  sourceLabel?: string;
  markers: MarkerCard[];
}

export function ReportView() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<ReportDetail | null>(null);

  useEffect(() => {
    if (id) void apiFetch<ReportDetail>(`/patient/reports/${id}`).then(setReport);
  }, [id]);

  async function handleDownload(kind: 'original-pdf-link' | 'summary-pdf-link') {
    if (!id) return;
    const { url } = await apiFetch<{ url: string }>(`/patient/reports/${id}/${kind}`);
    window.open(url, '_blank');
  }

  if (!report) {
    return (
      <main className="min-h-screen px-6 py-16 md:px-16 bg-cream" aria-busy="true" aria-label="Loading report">
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
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-16 md:px-16 bg-cream">
      <TwoTierHeading eyebrow={`Sample date ${report.sampleDate}`} title={report.panelName} />
      {report.sourceLabel && <p className="mt-2 text-sm text-espresso/60">{report.sourceLabel}</p>}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => handleDownload('original-pdf-link')}>
          Download original report (PDF)
        </Button>
        <Button variant="secondary" onClick={() => handleDownload('summary-pdf-link')}>
          Download Aspire summary (PDF)
        </Button>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {report.markers.map((m) => (
          <Link key={m.markerId} to={`/markers/${m.markerId}`} className="motion-safe:animate-riseIn">
            <Card interactive className="h-full">
              <p className="font-medium text-espresso">{m.name}</p>
              <p className="tabular mt-1 text-2xl text-espresso">
                {m.value} <span className="text-sm">{m.unit}</span>
              </p>
              <p className="tabular text-xs text-espresso/70">
                Reference range: {m.referenceLow}–{m.referenceHigh}
              </p>
              <div className="mt-3">
                <StatusBadge status={m.status} />
              </div>
              <p className="mt-3 text-sm text-espresso/90">{m.gloss}</p>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
