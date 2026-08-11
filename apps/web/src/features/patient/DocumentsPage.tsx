import { formatDate, formatReportHeading } from '@aspire-bloods/shared';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { LinkButton } from '../../components/ui/LinkButton';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Reveal } from '../../components/motion/Reveal';
import { staggerDelay } from '../../components/motion/stagger';
import { useToast } from '../../components/ui/Toast';
import { apiFetch } from '../../lib/api';
import { downloadSignedFile } from '../../lib/download';
import { type PatientDocument } from '../../lib/patientPortal';

/**
 * Every downloadable file in one place. Previously the only route to a PDF
 * was through the report it belonged to, which is fine if you know which
 * report that was and useless otherwise — the same problem All markers
 * solves for values.
 *
 * Two files per released report: the laboratory's own PDF (only where the
 * results arrived as one — manual entry has no original) and the Aspire
 * summary, which is generated on request rather than stored, so it always
 * reflects the current released values including any amendment.
 */

type Downloading = { reportId: string; kind: string } | null;

export function DocumentsPage() {
  const [documents, setDocuments] = useState<PatientDocument[] | null>(null);
  // A failed load is not an empty list. Swallowing the error into [] told a
  // patient who has released reports that they have "No documents yet" — an
  // untrue and alarming thing to say to someone paying for the results. The
  // real load failure is surfaced, with a way to retry.
  const [error, setError] = useState<unknown>(null);
  const [downloading, setDownloading] = useState<Downloading>(null);
  const { show } = useToast();

  const load = useCallback(() => {
    setError(null);
    setDocuments(null);
    apiFetch<PatientDocument[]>('/patient/documents')
      .then(setDocuments)
      .catch(setError);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function download(doc: PatientDocument, kind: 'original-pdf-link' | 'summary-pdf-link') {
    setDownloading({ reportId: doc.reportId, kind });
    try {
      // Fetched and saved rather than opened in a tab — a window.open after an
      // await has left the user-gesture window and is blocked outright on iOS
      // Safari, which made this button do nothing at all. See lib/download.ts.
      await downloadSignedFile(
        `/patient/reports/${doc.reportId}/${kind}`,
        kind === 'summary-pdf-link'
          ? `aspire-summary-${doc.sampleDate}.pdf`
          : (doc.originalFilename ?? `laboratory-report-${doc.sampleDate}.pdf`),
      );
    } catch {
      show('That download could not be prepared. Please try again.', 'error');
    } finally {
      setDownloading(null);
    }
  }

  return (
    <>
      <TwoTierHeading eyebrow="Aspire Clinic · Patient portal" title="Documents" />

      {error ? (
        <div className="mt-10">
          <ErrorState
            error={error}
            subject="your documents"
            onRetry={load}
            backTo={{ to: '/overview', label: 'Back to overview' }}
          />
        </div>
      ) : documents === null ? (
        <div className="mt-10 flex flex-col gap-5" aria-busy="true" aria-label="Loading your documents">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <Skeleton className="h-5 w-56" />
              <Skeleton className="mt-3 h-4 w-40" />
              <Skeleton className="mt-5 h-11 w-64" />
            </Card>
          ))}
        </div>
      ) : documents.length === 0 ? (
        <div className="mt-10 max-w-2xl">
          <EmptyState
            title="No documents yet"
            description="Once a report is released to you, its PDFs appear here: the laboratory’s report and an Aspire summary."
            action={<LinkButton to="/overview">Back to overview</LinkButton>}
          />
        </div>
      ) : (
        <ul className="mt-10 flex flex-col gap-5">
          {documents.map((doc, i) => (
            <li key={doc.reportId}>
              <Reveal delay={staggerDelay(i)}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="eyebrow mb-2">{formatDate(doc.sampleDate)}</p>
                    {/* Never blank: a manual-entry or ad-hoc report has no
                        panel, and the raw name rendered this heading empty.
                        The heading form rather than the full title, because
                        the eyebrow above already carries the date. */}
                    <p className="font-display text-xl leading-tight text-espresso">
                      {formatReportHeading(doc.panelName, doc.markerCount)}
                    </p>
                    <p className="tabular mt-2 text-xs text-espresso/80">
                      {/* The count is already in the heading when there is no
                          panel to name — don't say it twice.
                          The source label is empty for anything the clinic
                          analysed itself (see lib/sourceLabel.ts), so the
                          separator has to be conditional on it too or the line
                          ends on a dangling middot. */}
                      {[
                        doc.panelName ? `${doc.markerCount} marker${doc.markerCount === 1 ? '' : 's'}` : null,
                        doc.sourceLabel || null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <Link
                    to={`/reports/${doc.reportId}`}
                    className="rounded-input text-sm font-medium text-bronze-700 underline-offset-4 hover:underline"
                  >
                    View this panel
                  </Link>
                </div>

                <div className="mt-6 flex flex-wrap gap-3 border-t border-taupe pt-5">
                  <Button
                    variant="secondary"
                    loading={downloading?.reportId === doc.reportId && downloading.kind === 'summary-pdf-link'}
                    onClick={() => void download(doc, 'summary-pdf-link')}
                  >
                    Aspire summary (PDF)
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!doc.hasOriginalPdf}
                    disabledReason="These results were entered by the clinical team, so there’s no original laboratory PDF."
                    loading={downloading?.reportId === doc.reportId && downloading.kind === 'original-pdf-link'}
                    onClick={() => void download(doc, 'original-pdf-link')}
                  >
                    Original laboratory report (PDF)
                  </Button>
                </div>
              </Card>
              </Reveal>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
