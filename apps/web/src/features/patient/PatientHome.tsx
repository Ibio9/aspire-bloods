import { useEffect, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDate, formatReportTitle } from '@aspire-bloods/shared';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { apiFetch } from '../../lib/api';

interface ReportSummary {
  reportId: string;
  /** Null when the report isn't from a catalogue panel — the title falls back to markers + date. */
  panelName: string | null;
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
  const title = formatReportTitle(report.panelName, report.markerCount, report.sampleDate);

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
        {formatReportTitle(report.panelName, report.markerCount, report.sampleDate)}
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

  useEffect(() => {
    void apiFetch<ReportSummary[]>('/patient/reports').then(setReports);
  }, []);

  return (
    <>
      <TwoTierHeading eyebrow="Aspire Clinic — Patient Portal" title="Your results" />

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
        <div className="mt-14 max-w-xl">
          <EmptyState
            title="No results yet"
            description="You haven't had any tests yet. Once you've had a sample taken, your results will appear here as soon as they're ready."
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
