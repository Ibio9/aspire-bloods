import { useEffect, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDate } from '@aspire-bloods/shared';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { apiFetch } from '../../lib/api';

interface ReportSummary {
  reportId: string;
  /** Null when the report isn't from a catalogue panel — the title falls back to markers + date. */
  panelName: string | null;
  /** Composed server-side so portal, PDF and escalation email cannot drift apart. */
  title: string;
  sampleDate: string;
  patientStatus: 'PENDING' | 'RELEASED';
  markerCount?: number;
  inRangeCount?: number;
  attentionCount?: number;
  sourceLabel?: string;
}

/**
 * The primary interaction in the entire product. It is a real navigation, so
 * it's an anchor underneath — that's what gives us middle-click, cmd-click,
 * "open in new tab", a status-bar URL preview, and Enter activation for free.
 * Space is added on top, because a card reads as a button-sized target and
 * users press Space on it; an anchor alone would scroll the page instead.
 */
function ReleasedReportCard({ report, index }: { report: ReportSummary; index: number }) {
  const navigate = useNavigate();
  const to = `/reports/${report.reportId}`;
  const title = report.title;

  function handleKeyDown(e: KeyboardEvent<HTMLAnchorElement>) {
    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      navigate(to);
    }
  }

  return (
    <a
      href={to}
      onClick={(e) => {
        // Let the browser handle modified clicks (new tab/window) natively —
        // only intercept the plain left-click for client-side routing.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
      onKeyDown={handleKeyDown}
      aria-label={`${title}, sample taken ${formatDate(report.sampleDate)}`}
      className="stagger-item block rounded-card motion-safe:animate-riseIn focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <Card interactive className="flex h-full flex-col">
        <p className="eyebrow mb-2">{formatDate(report.sampleDate)}</p>
        <p className="font-display text-3xl leading-tight text-espresso">{title}</p>
        <p className="mt-6 text-sm text-espresso">
          {report.inRangeCount} in range
          {report.attentionCount
            ? `, ${report.attentionCount} need${report.attentionCount === 1 ? 's' : ''} attention`
            : ''}
        </p>
        {report.sourceLabel && <p className="mt-2 text-xs text-espresso/70">{report.sourceLabel}</p>}
      </Card>
    </a>
  );
}

/** Not released yet: says so plainly and looks inert, rather than looking clickable and doing nothing. */
function PendingReportCard({ report, index }: { report: ReportSummary; index: number }) {
  return (
    <Card
      inert
      className="stagger-item flex h-full flex-col motion-safe:animate-riseIn"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <p className="eyebrow mb-2">{formatDate(report.sampleDate)}</p>
      <p className="font-display text-3xl leading-tight text-espresso">
        {report.title}
      </p>
      <p className="mt-6 text-sm text-espresso">
        Your results are with the clinical team and will be available shortly.
      </p>
      {/* Text label, not colour or opacity alone — the state has to survive greyscale. */}
      <p className="mt-4 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-eyebrow text-espresso/70">
        <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 4.5 V8 L10.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        Not yet available
      </p>
    </Card>
  );
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
        <div
          className="mt-14 grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-3"
          aria-busy="true"
          aria-label="Loading your results"
        >
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-6 w-40" />
              <Skeleton className="mt-6 h-4 w-32" />
            </Card>
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="mt-14 max-w-2xl">
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
        <div className="mt-14 grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-3">
          {reports.map((r, i) =>
            r.patientStatus === 'RELEASED' ? (
              <ReleasedReportCard key={r.reportId} report={r} index={i} />
            ) : (
              <PendingReportCard key={r.reportId} report={r} index={i} />
            ),
          )}
        </div>
      )}
    </>
  );
}
