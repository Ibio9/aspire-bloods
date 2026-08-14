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
import { downloadFromApi, downloadSignedFile } from '../../lib/download';
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

  /**
   * The GP handover summary is STREAMED, not signed-and-linked.
   *
   * The other two are stored files behind a signed URL; this one is generated
   * per request and never written to disk, for the reason recorded on the route
   * — it is a derived view of a report for a conversation, not a record, and a
   * pile of near-identical one-page extracts in somebody's DSAR export is noise.
   * So it goes through downloadFromApi rather than downloadSignedFile.
   */
  async function downloadHandover(doc: PatientDocument) {
    setDownloading({ reportId: doc.reportId, kind: 'gp-handover-pdf' });
    try {
      await downloadFromApi(
        `/api/patient/reports/${doc.reportId}/gp-handover-pdf`,
        `aspire-gp-summary-${doc.sampleDate}.pdf`,
      );
    } catch {
      show('That download could not be prepared. Please try again.', 'error');
    } finally {
      setDownloading(null);
    }
  }

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
            description="Once a report is released to you, its PDFs appear here: the laboratory’s report, an Aspire summary, and a one-page summary to take to your doctor."
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
                    {/* The count only. "Analysed by Randox Health" was the
                        second half of this line and is gone from every
                        patient-facing surface (Aug 2026). With it removed the
                        middot has nothing to join, so the line is one fact —
                        and it is absent entirely where the heading already
                        carries the count. */}
                    {doc.panelName && (
                      <p className="tabular mt-2 text-xs text-espresso/80">
                        {doc.markerCount} marker{doc.markerCount === 1 ? '' : 's'}
                      </p>
                    )}
                  </div>
                  <Link
                    to={`/reports/${doc.reportId}`}
                    className="rounded-input text-sm font-medium text-bronze-700 underline-offset-4 hover:underline"
                  >
                    View this panel
                  </Link>
                </div>

                {/* ONE OF THESE THREE IS THE ONE (Aug 2026). All three were
                    `secondary` — three identical near-white pills, so the card
                    offered a patient a choice of three files with nothing
                    saying which is theirs. The Aspire summary is the document
                    this page exists for: it is generated from the current
                    released values, it is the one written for them, and it is
                    the only one every report has. It takes the primary fill;
                    the laboratory's own PDF stays secondary because it is the
                    raw article, and the GP handover is quieter still because it
                    is for somebody else entirely. */}
                {/* ── ALL THREE ON ONE LINE, AND THE PARAGRAPH IS GONE
                    (Aug 2026) ────────────────────────────────────────────────
                    The GP handover used to sit below the other two behind its
                    own rule, with four lines of explanation under it — "one
                    page, take it to your GP", which is what the button already
                    says. The rule and the paragraph were both doing the job the
                    LABEL does: "Summary for your doctor (PDF)" is unambiguous
                    about whose document it is and what it is for.

                    ONE ROW, and the hierarchy is carried by the button variants
                    rather than by a divider. The Aspire summary is the document
                    this page exists for and takes the primary fill; the
                    laboratory's own PDF is the raw article; the handover is for
                    somebody else entirely. `flex-wrap` so a phone stacks them
                    rather than clipping the third. */}
                <div className="mt-6 flex flex-wrap gap-3 border-t border-taupe pt-5">
                  <Button
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
                  <Button
                    variant="secondary"
                    loading={downloading?.reportId === doc.reportId && downloading.kind === 'gp-handover-pdf'}
                    onClick={() => void downloadHandover(doc)}
                  >
                    Summary for your doctor (PDF)
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
