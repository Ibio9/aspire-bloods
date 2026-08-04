import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { apiFetch } from '../../lib/api';

interface ReportSummary {
  reportId: string;
  panelName: string;
  sampleDate: string;
  patientStatus: 'PENDING' | 'RELEASED';
  markerCount?: number;
  inRangeCount?: number;
  attentionCount?: number;
  sourceLabel?: string;
}

export function PatientHome() {
  const [reports, setReports] = useState<ReportSummary[] | null>(null);

  useEffect(() => {
    void apiFetch<ReportSummary[]>('/patient/reports').then(setReports);
  }, []);

  return (
    <main className="min-h-screen px-6 py-16 md:px-16 bg-cream">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <TwoTierHeading eyebrow="Aspire Clinic — Patient Portal" title="Your results" />
        <Link
          to="/account"
          className="text-sm font-medium text-bronze-600 underline underline-offset-2 transition duration-150 ease-out hover:text-bronze-700"
        >
          Account &amp; privacy
        </Link>
      </div>

      {reports === null ? (
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading your results">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-5 w-40" />
              <Skeleton className="mt-4 h-4 w-32" />
            </Card>
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="mt-10 max-w-xl">
          <EmptyState
            title="No results yet"
            description="You haven't had any tests yet. Once you've had a sample taken, your results will appear here as soon as they're ready."
          />
        </div>
      ) : (
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reports.map((r, i) =>
            r.patientStatus === 'RELEASED' ? (
              <Link
                key={r.reportId}
                to={`/reports/${r.reportId}`}
                className="stagger-item motion-safe:animate-riseIn rounded-card"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <Card interactive className="h-full">
                  <p className="eyebrow mb-1">{r.sampleDate}</p>
                  <p className="text-lg font-medium text-espresso">{r.panelName}</p>
                  <p className="mt-3 text-sm text-espresso">
                    {r.inRangeCount} in range
                    {r.attentionCount ? `, ${r.attentionCount} need${r.attentionCount === 1 ? 's' : ''} attention` : ''}
                  </p>
                  {r.sourceLabel && <p className="mt-2 text-xs text-espresso/60">{r.sourceLabel}</p>}
                </Card>
              </Link>
            ) : (
              <Card
                key={r.reportId}
                className="stagger-item h-full motion-safe:animate-riseIn opacity-75"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <p className="eyebrow mb-1">{r.sampleDate}</p>
                <p className="text-lg font-medium text-espresso">{r.panelName}</p>
                <p className="mt-3 text-sm text-espresso">Results pending — we'll let you know when they're ready.</p>
              </Card>
            ),
          )}
        </div>
      )}
    </main>
  );
}
