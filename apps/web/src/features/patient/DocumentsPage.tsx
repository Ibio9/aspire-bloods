import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { apiFetch } from '../../lib/api';
import { API_BASE_URL } from '../../lib/apiBase';
import { formatLongDate, type PatientDocument } from '../../lib/patientPortal';

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
  const [downloading, setDownloading] = useState<Downloading>(null);
  const { show } = useToast();

  useEffect(() => {
    apiFetch<PatientDocument[]>('/patient/documents')
      .then(setDocuments)
      .catch(() => setDocuments([]));
  }, []);

  async function download(reportId: string, kind: 'original-pdf-link' | 'summary-pdf-link') {
    setDownloading({ reportId, kind });
    try {
      const { url } = await apiFetch<{ url: string }>(`/patient/reports/${reportId}/${kind}`);
      window.open(`${API_BASE_URL}${url}`, '_blank');
    } catch {
      show('That download could not be prepared — please try again.', 'error');
    } finally {
      setDownloading(null);
    }
  }

  return (
    <>
      <TwoTierHeading eyebrow="Aspire Clinic — Patient portal" title="Documents" />
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-espresso">
        Every report you can download — the original laboratory PDF and the Aspire summary — in one place.
      </p>

      {documents === null ? (
        <div className="mt-12 flex flex-col gap-5" aria-busy="true" aria-label="Loading your documents">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <Skeleton className="h-5 w-56" />
              <Skeleton className="mt-3 h-4 w-40" />
              <Skeleton className="mt-5 h-11 w-64" />
            </Card>
          ))}
        </div>
      ) : documents.length === 0 ? (
        <div className="mt-12 max-w-2xl">
          <EmptyState
            title="No documents yet"
            description="When a report has been reviewed and released to you, its PDFs appear here — the laboratory's own report, and an Aspire summary written in plain English."
            action={
              <Link
                to="/overview"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-taupe px-5 py-2.5 text-sm font-medium text-espresso transition duration-150 ease-out hover:border-bronze"
              >
                Back to overview
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="mt-12 flex flex-col gap-5">
          {documents.map((doc, i) => (
            <li key={doc.reportId} className="stagger-item motion-safe:animate-riseIn" style={{ animationDelay: `${i * 30}ms` }}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="eyebrow mb-2">{formatLongDate(doc.sampleDate)}</p>
                    <p className="font-display text-2xl leading-tight text-espresso">{doc.panelName}</p>
                    <p className="tabular mt-2 text-xs text-espresso/70">
                      {doc.markerCount} marker{doc.markerCount === 1 ? '' : 's'} · {doc.sourceLabel}
                    </p>
                  </div>
                  <Link
                    to={`/reports/${doc.reportId}`}
                    className="rounded-sm text-sm font-medium text-bronze-700 underline-offset-4 hover:underline"
                  >
                    View this panel
                  </Link>
                </div>

                <div className="mt-6 flex flex-wrap gap-3 border-t border-taupe pt-5">
                  <Button
                    variant="secondary"
                    loading={downloading?.reportId === doc.reportId && downloading.kind === 'summary-pdf-link'}
                    onClick={() => void download(doc.reportId, 'summary-pdf-link')}
                  >
                    Aspire summary (PDF)
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={!doc.hasOriginalPdf}
                    disabledReason="These results were entered by the clinical team rather than arriving as a laboratory PDF, so there's no original document to download."
                    loading={downloading?.reportId === doc.reportId && downloading.kind === 'original-pdf-link'}
                    onClick={() => void download(doc.reportId, 'original-pdf-link')}
                  >
                    Original laboratory report (PDF)
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
