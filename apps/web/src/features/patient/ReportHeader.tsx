import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate } from '@aspire-bloods/shared';
import type { MarkerStatus } from '@aspire-bloods/shared';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { downloadSignedFile } from '../../lib/download';
import { BOOKING_ENABLED } from '../../lib/features';
import { ReportBookingLink } from '../booking/ReportBookingLink';
import { CountsStrip } from './ResultsSummary';
import type { ReportDetailData } from './useReportDetail';

/**
 * Which report this is, and how it went — the first thing on the page when one
 * is open.
 *
 * It used to sit BETWEEN two control bars: the page's search and filters above
 * it, the report's own grouping and sort below it. So an opened report read as
 * controls, then the report, then more controls, and the answer to "which panel
 * am I looking at" was two thirds of the way down the first screen.
 *
 * Title, provenance, the downloads and the five-number summary now come first
 * and the single control bar follows them, which is the order somebody actually
 * reads in: what this is, how it went, then the tools for going through it.
 *
 * The counts strip doubles as the status filter and writes to the shared one in
 * the bar below — pressing "3 above range" here is the same act as choosing it
 * there, and the two never disagree because there is only one piece of state.
 */
export function ReportHeader({
  reportId,
  data,
  activeStatus,
  onSelectStatus,
}: {
  reportId: string;
  data: ReportDetailData;
  /** The status filter currently applied, so the matching tile reads as selected. */
  activeStatus?: string;
  onSelectStatus: (status: MarkerStatus | 'ALL') => void;
}) {
  const { report, failed, byType } = data;
  const [downloading, setDownloading] = useState<string | null>(null);
  const { show } = useToast();

  async function handleDownload(kind: 'original-pdf-link' | 'summary-pdf-link') {
    if (!report) return;
    setDownloading(kind);
    try {
      // Fetched and saved rather than opened in a tab. A window.open issued
      // after an await has left the click's user-gesture window and is blocked
      // outright by iOS Safari and by default in desktop Safari — the button
      // spun, finished, and produced nothing. See lib/download.ts.
      await downloadSignedFile(
        `/patient/reports/${reportId}/${kind}`,
        kind === 'summary-pdf-link'
          ? `aspire-summary-${report.sampleDate}.pdf`
          : (report.originalFilename ?? `laboratory-report-${report.sampleDate}.pdf`),
      );
    } catch {
      show('That download could not be prepared. Please try again.', 'error');
    } finally {
      setDownloading(null);
    }
  }

  // A report that could not be opened has no title to print and nothing to
  // count. The explanation belongs with the markers that aren't there, which is
  // where the reader is looking — see ReportDetailView.
  if (failed) return null;

  if (!report) {
    return (
      <div className="mt-10" aria-busy="true" aria-label="Loading report">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-9 w-72" />
        <Skeleton className="mt-8 h-11 w-64" />
      </div>
    );
  }

  return (
    <div className="mt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div>
          <p className="eyebrow mb-2">Sample date {formatDate(report.sampleDate)}</p>
          <h2 className="font-display text-3xl leading-tight text-espresso sm:text-4xl">{report.title}</h2>
          {report.sourceLabel && <p className="mt-2 text-sm text-espresso/80">{report.sourceLabel}</p>}
        </div>
        <Link
          to="/results"
          className="rounded-input text-sm font-medium text-bronze-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze"
        >
          All reports
        </Link>
      </div>

      {/* Provenance — the appointment this sample came from, when the booking
          system knows of one. Renders nothing for reports that pre-date it,
          and nothing at all while booking is off: this portal keeps no diary
          to link back to. */}
      {BOOKING_ENABLED && <ReportBookingLink reportId={report.reportId} />}

      <div className="mt-8 flex flex-wrap gap-3">
        <Button
          variant="secondary"
          loading={downloading === 'summary-pdf-link'}
          onClick={() => void handleDownload('summary-pdf-link')}
        >
          Download Aspire summary (PDF)
        </Button>
        {/* Disabled with a reason rather than offered and allowed to 404 —
            a manually entered report has no laboratory PDF behind it, and the
            server now says so on the payload. Matches Documents, which has
            always got this right. */}
        <Button
          variant="secondary"
          disabled={report.hasOriginalPdf === false}
          disabledReason="These results were entered by the clinical team, so there's no original laboratory PDF."
          loading={downloading === 'original-pdf-link'}
          onClick={() => void handleDownload('original-pdf-link')}
        >
          Download original report (PDF)
        </Button>
      </div>

      {/* MEASURED-only, and a summary of the whole report rather than of any
          grouping of it — which is why it survives while the per-area bars did
          not. It doubles as the status filter. */}
      <CountsStrip markers={byType.measured} activeStatus={activeStatus} onSelectStatus={onSelectStatus} />
    </div>
  );
}
