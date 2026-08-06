import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { apiFetch } from '../../lib/api';
import { formatLongDate } from '../../lib/patientPortal';

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
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    apiFetch<ReportSummary[]>('/patient/reports')
      .then(setReports)
      .catch(() => setFailed(true));
  }, []);

  if (failed) {
    return (
      <>
        <TwoTierHeading eyebrow="Aspire Clinic — Patient portal" title="My results" />
        <Card className="mt-8 max-w-xl">
          <p className="font-display text-2xl text-espresso">We couldn't load your results</p>
          <p className="mt-2 text-sm text-espresso/80">
            Please refresh the page. If it keeps happening, get in touch and we'll sort it out.
          </p>
        </Card>
      </>
    );
  }

  return (
    <>
      <TwoTierHeading eyebrow="Aspire Clinic — Patient portal" title="My results" />
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-espresso">
        Each panel you've had, newest first. To look at a single marker across every panel it appeared in, use{' '}
        <Link to="/markers" className="rounded-sm font-medium text-bronze-700 underline-offset-4 hover:underline">
          All markers
        </Link>
        .
      </p>

      {reports === null ? (
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading your results">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-5 w-40" />
              <Skeleton className="mt-4 h-4 w-32" />
            </Card>
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="mt-10 max-w-2xl">
          <EmptyState
            title="No results yet"
            description="You haven't had any tests yet. Once you've had a sample taken and a clinician has reviewed it, your panel will appear here."
            action={
              <Link
                to="/overview"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-taupe px-5 py-2.5 text-sm font-medium text-espresso transition duration-150 ease-out hover:border-bronze"
              >
                What happens next
              </Link>
            }
          />
        </div>
      ) : (
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {reports.map((r, i) =>
            r.patientStatus === 'RELEASED' ? (
              <Link
                key={r.reportId}
                to={`/reports/${r.reportId}`}
                className="stagger-item motion-safe:animate-riseIn rounded-card"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <Card interactive className="h-full">
                  <p className="eyebrow mb-1.5">{formatLongDate(r.sampleDate)}</p>
                  <p className="font-display text-2xl leading-tight text-espresso">{r.panelName}</p>
                  <p className="mt-4 text-sm text-espresso">
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
                <p className="eyebrow mb-1.5">{formatLongDate(r.sampleDate)}</p>
                <p className="font-display text-2xl leading-tight text-espresso">{r.panelName}</p>
                <p className="mt-4 text-sm text-espresso">
                  Your results are with the clinical team and will be available shortly.
                </p>
              </Card>
            ),
          )}
        </div>
      )}
    </>
  );
}
