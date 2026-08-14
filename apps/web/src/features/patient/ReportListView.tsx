import { useEffect, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDate, formatReportHeading } from '@aspire-bloods/shared';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { LinkButton } from '../../components/ui/LinkButton';
import { Reveal } from '../../components/motion/Reveal';
import { staggerDelay } from '../../components/motion/stagger';
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
}

/**
 * The primary interaction in the entire product. It is a real navigation, so
 * it's an anchor underneath — that's what gives us middle-click, cmd-click,
 * "open in new tab", a status-bar URL preview, and Enter activation for free.
 * Space is added on top, because a card reads as a button-sized target and
 * users press Space on it; an anchor alone would scroll the page instead.
 */
function ReleasedReportCard({ report }: { report: ReportSummary }) {
  const navigate = useNavigate();
  const to = `/reports/${report.reportId}`;
  // The heading form, not the full composed title: the eyebrow directly above
  // is already the sample date, and formatReportTitle's fallback carries the
  // date too — so a panel-less report read "6 August 2026 / 12 markers · 6
  // August 2026". Self-contained titles are for the PDF and the email.
  const title = formatReportHeading(report.panelName, report.markerCount);

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
      className="block h-full rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze"
    >
      <Card interactive className="h-full">
        <p className="eyebrow mb-2">{formatDate(report.sampleDate)}</p>
        <p className="font-display text-2xl leading-tight text-espresso">{title}</p>
        <p className="mt-6 text-sm text-espresso">
          {report.inRangeCount} in range
          {report.attentionCount
            ? `, ${report.attentionCount} need${report.attentionCount === 1 ? 's' : ''} attention`
            : ''}
        </p>
        {/* No source label. "Analysed by Randox Health" is gone from every
            patient surface (Aug 2026) — and it was also the one thing making
            these cards different heights. */}
      </Card>
    </a>
  );
}

/** Not released yet: says so plainly and looks inert, rather than looking clickable and doing nothing. */
function PendingReportCard({ report }: { report: ReportSummary }) {
  return (
    <Card inert className="h-full">
      <p className="eyebrow mb-2">{formatDate(report.sampleDate)}</p>
      <p className="font-display text-2xl leading-tight text-espresso">
        {formatReportHeading(report.panelName, report.markerCount)}
      </p>
      <p className="mt-6 text-sm text-espresso">
        Your results are with the clinical team and will be available shortly.
      </p>
      {/* Text label, not colour or opacity alone — the state has to survive greyscale. */}
      <p className="mt-4 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-eyebrow text-espresso/80">
        <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 4.5 V8 L10.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        Not yet available
      </p>
    </Card>
  );
}

/**
 * Every report, newest first — the "By test" view of the Results page and
 * the common case it opens on.
 *
 * Most visits are somebody coming back to the panel they were just emailed
 * about, which is why this is the default arrangement rather than the flat list
 * of every marker. Opening one keeps its own URL (/reports/:id), so the links
 * already sent out, bookmarked and printed on a summary still land exactly
 * where they always did.
 */
export function ReportListView() {
  const [reports, setReports] = useState<ReportSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    apiFetch<ReportSummary[]>('/patient/reports')
      .then(setReports)
      .catch(() => setFailed(true));
  }, []);

  if (failed) {
    return (
      <Card className="max-w-xl">
        <p className="font-display text-xl text-espresso">We couldn’t load your results</p>
        <p className="mt-2 text-sm text-espresso/80">
          Please refresh the page. If it keeps happening, get in touch and we’ll sort it out.
        </p>
      </Card>
    );
  }

  if (reports === null) {
    return (
      <div
        className="grid grid-cols-1 items-start gap-7 sm:grid-cols-2 lg:grid-cols-3"
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
    );
  }

  if (reports.length === 0) {
    return (
      <div className="max-w-2xl">
        {/* A brand-new self-registered account is empty by design, and this
            is where that becomes visible. Said warmly and completely:
            nothing is missing, nothing has gone wrong, and the sentence
            names the actual step — the clinic matching a result to you —
            rather than leaving a new patient to wonder whether they did
            the sign-up right. */}
        <EmptyState
          title="Nothing here yet, and that’s exactly right"
          description="Once you’ve had a sample taken, the clinic matches the result to you and a clinician reviews it. Then your first panel appears here."
          action={<LinkButton to="/overview">What happens next</LinkButton>}
        />
      </div>
    );
  }

  /**
   * ── EQUALISED, AND THE REASON THE RAGGED VERSION EXISTED IS GONE (Aug 2026)
   *
   * This carried `items-start` and no `h-full`, deliberately: one report
   * carrying a source label and its neighbours not was setting an unequal
   * height, and stretching drew the difference as an empty strip of card under
   * a count line. That was the right call about the wrong cause — the source
   * label was the difference, and it has been removed from every patient
   * surface (item 16). What is left on these cards is a date, a title and one
   * count line, which is the same shape on every one of them.
   *
   * So the grid stretches again and every card in a row is the same height and
   * the same width. The remaining variation is a two-line title against a
   * one-line title, which is a few pixels rather than a hole.
   */
  return (
    <div className="grid grid-cols-1 gap-7 sm:grid-cols-2 lg:grid-cols-3">
      {reports.map((r, i) => (
        <Reveal key={r.reportId} delay={staggerDelay(i)}>
          {r.patientStatus === 'RELEASED' ? <ReleasedReportCard report={r} /> : <PendingReportCard report={r} />}
        </Reveal>
      ))}
    </div>
  );
}
