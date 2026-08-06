import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { MarkerStatus } from '@aspire-bloods/shared';
import { Breadcrumbs } from '../../components/nav/Breadcrumbs';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import type { MarkerNavState } from './markerNavState';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Skeleton } from '../../components/ui/Skeleton';
import { apiFetch } from '../../lib/api';
import { API_BASE_URL } from '../../lib/apiBase';

interface MarkerCard {
  markerId: string;
  name: string;
  value: number;
  unit: string;
  referenceLow: number;
  referenceHigh: number;
  status: MarkerStatus;
  gloss: string;
  amendedAt?: string | null;
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
    window.open(`${API_BASE_URL}${url}`, '_blank');
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

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Overview', to: '/overview' },
          { label: 'My results', to: '/my-results' },
          { label: `${report.panelName}, ${report.sampleDate}` },
        ]}
      />
      <TwoTierHeading eyebrow={`Sample date ${report.sampleDate}`} title={report.panelName} />
      {report.sourceLabel && <p className="mt-2 text-sm text-espresso/80">{report.sourceLabel}</p>}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => handleDownload('original-pdf-link')}>
          Download original report (PDF)
        </Button>
        <Button variant="secondary" onClick={() => handleDownload('summary-pdf-link')}>
          Download Aspire summary (PDF)
        </Button>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {report.markers.map((m, i) => (
          <Link
            key={m.markerId}
            to={`/markers/${m.markerId}`}
            state={{ reportId: report.reportId, panelName: report.panelName, markerIds: report.markers.map((mk) => mk.markerId) } satisfies MarkerNavState}
            className="stagger-item motion-safe:animate-riseIn rounded-card"
            style={{ animationDelay: `${i * 30}ms` }}
          >
            <Card interactive className="flex h-full flex-col">
              <p className="eyebrow">{m.name}</p>
              <p className="tabular mt-3 flex items-baseline gap-1.5 text-3xl font-semibold text-espresso">
                {m.value} <span className="text-sm font-normal text-espresso/70">{m.unit}</span>
              </p>
              <p className="tabular mt-1.5 text-xs text-espresso/60">
                Reference range: {m.referenceLow}–{m.referenceHigh}
              </p>
              <div className="mt-4 flex items-center gap-2">
                <StatusBadge status={m.status} />
                {m.amendedAt && (
                  <span className="text-xs text-espresso/80">Amended {new Date(m.amendedAt).toLocaleDateString('en-GB')}</span>
                )}
              </div>
              <p className="mt-4 text-sm leading-relaxed text-espresso/90">{m.gloss}</p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
