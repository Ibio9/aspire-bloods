import { useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Breadcrumbs } from '../../components/nav/Breadcrumbs';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { DateField } from '../../components/ui/DateField';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../../components/ui/Table';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { ReportProgress } from '../../components/ui/ReportProgress';
import { CopyButton } from '../../components/ui/CopyButton';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { Modal } from '../../components/ui/Modal';
import { Tooltip } from '../../components/ui/Tooltip';
import { useToast } from '../../components/ui/Toast';
import { apiFetch, ApiError } from '../../lib/api';
import { downloadSignedFile } from '../../lib/download';
import { useAuth } from '../../lib/AuthContext';
import type { ReportStatus } from '../../lib/reportStatus';
import { formatDate, formatDateTime, formatReportHeading, type MarkerStatus } from '@aspire-bloods/shared';

interface MarkerOption {
  id: string;
  name: string;
  defaultUnit: string;
}

const FLAG_LABEL: Record<string, string> = {
  unknown_marker: "Marker isn’t in the catalogue",
  implausible_unit: 'Unit looks wrong for this marker',
  value_order_of_magnitude: 'Value is far outside the reference range',
  two_pass_disagreement: 'A second AI read disagreed, so check closely',
  non_numeric_result: 'Non-numeric result (e.g. "Not detected")',
  duplicate_printing_disagreement: 'Printed twice with different values, so check closely',
  comparator_result: 'Result is a limit ("< 5.0") rather than a measurement',
  one_sided_reference_range: 'The lab gave only one side of the reference range',
  lab_status_disagreement: "Our derived status disagrees with the lab’s own flag",
};

type ParseAttentionKind = 'unmatched_marker' | 'no_usable_range' | 'lab_status_disagreement' | 'extraction_flag';

interface ParsedRow {
  rawLine: string;
  rawName: string;
  matchedMarkerId: string | null;
  matchedMarkerName: string | null;
  value: number | null;
  resultText: string | null;
  unit: string | null;
  referenceLow: number | null;
  referenceHigh: number | null;
  /** Which of the two sources the range came from — the result itself, or the marker's stored fallback. */
  rangeSource: 'result' | 'marker_fallback' | null;
  /**
   * How well-founded the marker's stored fallback is. Null when the range came
   * off the report itself, which needs no provenance from us — it IS the
   * provenance. See PROVENANCE_LABEL on the server.
   */
  rangeProvenance: RangeProvenance | null;
  rangeProvenanceLabel: string | null;
  rangeProvenanceDetail: string | null;
  /** Why no range could be resolved, when none could. Never a silently blank field. */
  rangeNotice: string | null;
  sampleType: string | null;
  /** Derived server-side from the range above. The admin never types a status. */
  derivedStatus: MarkerStatus | null;
  /** Set when the value has no position on the range (qualitative, or a limit that straddles it). Not a failure. */
  unevaluableReason: string | null;
  labStatusIndicator: string | null;
  labStatusDisagrees: boolean;
  needsReview: boolean;
  reviewReason: string | null;
  sourceText?: string;
  confidence?: number | null;
  flags?: string[];
  attention: { kind: ParseAttentionKind; message: string }[];
}

interface ParseSummary {
  total: number;
  clean: number;
  needingAttention: number;
  unmatched: number;
  unevaluable: number;
  readyToPublish: boolean;
}

interface ParseResponse {
  sampleDate: string;
  panelName: string | null;
  extractionMethod: 'llm' | 'regex';
  fallbackReason: string | null;
  summary: ParseSummary;
  rows: ParsedRow[];
}

/**
 * The catalogue's answer to "what range applies to this patient for this
 * marker". `unavailable` is a real answer, not an error: the server refuses
 * to fall back to a sex-neutral range for a patient whose sex it doesn't
 * hold, because a suggested range that quietly belongs to the wrong cohort
 * is worse than no suggestion at all.
 */
type RangeProvenance = 'RANDOX' | 'PUBLISHED' | 'UNSOURCED';

type ResolvedRangeResponse =
  | {
      status: 'resolved';
      referenceRangeId: string;
      low: number;
      high: number;
      unit: string;
      provenance: RangeProvenance;
      provenanceLabel: string;
      provenanceDetail: string;
      citation: { document: string | null; publisher: string | null; date: string | null; url: string | null } | null;
    }
  | { status: 'unavailable'; reason: string; message: string };

interface ResultEdit {
  id: string;
  previousValue: number;
  previousUnit: string;
  previousStatus: string;
  newValue: number;
  newUnit: string;
  newStatus: string;
  reason: string;
  changedByName: string;
  changedAt: string;
}

interface VerifiedResult {
  id: string;
  markerId: string;
  marker: { name: string };
  // Null when the stored result is textual — valueText carries it verbatim.
  value: number | null;
  valueText?: string | null;
  unit: string;
  status: MarkerStatus;
  referenceRange: { low: number; high: number };
  amendedAt: string | null;
  edits: ResultEdit[];
}

interface ReportDetail {
  id: string;
  status: string;
  sampleDate: string;
  sourceLabel?: string;
  voidedAt: string | null;
  voidReason: string | null;
  voidedBy: { email: string; staffProfile: { firstName: string; lastName: string } | null } | null;
  /** Null for a manually-entered report — there is no source document to download or re-parse. */
  originalPdfFileId: string | null;
  /** Null for an ad-hoc report with no catalogue panel behind it. */
  panel: { name: string } | null;
  title: string;
  patient: { id: string; email: string; patientProfile: { firstName: string; lastName: string } | null };
  results: VerifiedResult[];
}

/** Statuses a parse can still be worked on from. Outside these the verify table has nothing to do. */
const PARSEABLE = ['UPLOADED', 'PARSED', 'CHANGES_REQUESTED'];

const RANGE_SOURCE_LABEL: Record<'result' | 'marker_fallback', string> = {
  result: 'from the report',
  marker_fallback: "marker’s stored range",
};

export function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { user } = useAuth();
  const { show } = useToast();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [markers, setMarkers] = useState<MarkerOption[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [summary, setSummary] = useState<ParseSummary | null>(null);
  const [extractionMethod, setExtractionMethod] = useState<'llm' | 'regex' | null>(null);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [parsedPanelName, setParsedPanelName] = useState<string | null>(null);
  const [sampleDate, setSampleDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** A failure of the initial load, as opposed to `error`, which is an action that failed. */
  const [loadError, setLoadError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [note, setNote] = useState('');
  const [voidOpen, setVoidOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  /** Clean rows stay collapsed until asked for. "Review first" is what opens them. */
  const [showAllRows, setShowAllRows] = useState(false);
  const [editingResult, setEditingResult] = useState<VerifiedResult | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editUnit, setEditUnit] = useState('');

  // Auto-parse fires at most once per mount. Without this, a parse that
  // legitimately returns zero rows would retrigger on every render.
  const autoParsed = useRef(false);
  const canActAsClinician = user?.role === 'ADMIN' || user?.role === 'CLINICIAN';

  function applyParse(result: ParseResponse) {
    setRows(result.rows);
    setSummary(result.summary);
    setSampleDate(result.sampleDate);
    setExtractionMethod(result.extractionMethod);
    setFallbackReason(result.fallbackReason);
    setParsedPanelName(result.panelName);
    // Always collapsed on arrival. Rows needing input are never inside this
    // collapse — they render above it — so there is nothing to open for.
    setShowAllRows(false);
  }

  async function load(): Promise<ReportDetail | null> {
    if (!id) return null;
    const [r, m] = await Promise.all([
      apiFetch<ReportDetail>(`/reports/${id}`),
      apiFetch<MarkerOption[]>('/panels/markers'),
    ]);
    setReport(r);
    setMarkers(m);
    setSampleDate((prev) => prev || r.sampleDate.slice(0, 10));
    return r;
  }

  useEffect(() => {
    void (async () => {
      let loaded: ReportDetail | null;
      try {
        loaded = await load();
      } catch (e) {
        // A voided report, an id typed wrong, a patient this clinician can't
        // see: all of these used to reject unhandled and leave the loading
        // skeleton up indefinitely on the screen an admin spends most of
        // their day in.
        setLoadError(e);
        return;
      }
      if (!loaded || autoParsed.current) return;
      autoParsed.current = true;

      // The upload already parsed this report server-side and handed the
      // result over in navigation state — using it saves a second extraction
      // of a document that hasn't changed.
      const handedOver = (location.state as { parse?: ParseResponse } | null)?.parse;
      if (handedOver?.rows) {
        applyParse(handedOver);
        return;
      }
      // Reached directly (a link, a bookmark, a refresh): parse on arrival
      // rather than making the admin ask for the extraction that is the only
      // reason to be on this page.
      if (user?.role === 'ADMIN' && !loaded.voidedAt && PARSEABLE.includes(loaded.status)) {
        await handleParse();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleParse() {
    if (!id) return;
    setError(null);
    setParsing(true);
    try {
      const result = await apiFetch<ParseResponse>(`/reports/${id}/parse`, { method: 'POST' });
      applyParse(result);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Parse failed');
    } finally {
      setParsing(false);
    }
  }

  function updateRow(index: number, patch: Partial<ParsedRow> | ((row: ParsedRow) => Partial<ParsedRow>)) {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...(typeof patch === 'function' ? patch(r) : patch) } : r)));
  }

  // The PDF's own printed range always wins (that's what "reference ranges
  // read from the result, not the marker" means) — this only fills in a
  // sex/age-resolved suggestion from the marker catalogue when the parse
  // came back with no range at all for that row, e.g. an OCR miss.
  function fillMissingRange(index: number, markerId: string) {
    if (!markerId || !report) return;
    void apiFetch<ResolvedRangeResponse>(
      `/panels/markers/${markerId}/resolved-range?patientId=${report.patient.id}`,
    ).then((resolved) => {
      if (resolved.status !== 'resolved') {
        // Say why nothing was filled in rather than leaving the field
        // silently blank. SEX_NOT_RECORDED especially: the server refuses to
        // fall back to the "any" range for a patient whose sex we don't hold,
        // and the admin needs to know that's what happened — the alternative
        // is a range that looks resolved and belongs to the wrong person.
        updateRow(index, { rangeNotice: resolved.message });
        return;
      }
      updateRow(index, (row) =>
        row.referenceLow == null && row.referenceHigh == null
          ? {
              referenceLow: resolved.low,
              referenceHigh: resolved.high,
              unit: row.unit ?? resolved.unit,
              rangeSource: 'marker_fallback',
              // The tier comes with the number. Filling a field silently is
              // how a suggestion stops being read as a suggestion.
              rangeProvenance: resolved.provenance,
              rangeProvenanceLabel: resolved.provenanceLabel,
              rangeProvenanceDetail: resolved.provenanceDetail,
              rangeNotice: null,
            }
          : {},
      );
    });
  }

  /**
   * The rows that will actually be written, in the shape the API takes.
   *
   * A non-numeric result travels as its verbatim text ("< 5.0", "Not
   * detected") — the request schema accepts a string for exactly this, and
   * coercing it to a number here is the one thing that must never happen.
   */
  function buildResults() {
    return rows
      .filter((r) => r.matchedMarkerId && r.referenceLow != null && r.referenceHigh != null)
      .filter((r) => r.value != null || r.resultText)
      .map((r) => ({
        markerId: r.matchedMarkerId!,
        value: r.value != null ? Number(r.value) : r.resultText!,
        unit: r.unit ?? '',
        referenceLow: Number(r.referenceLow),
        referenceHigh: Number(r.referenceHigh),
      }));
  }

  function incompleteMatchedRows() {
    return rows.filter(
      (r) => r.matchedMarkerId && ((r.value == null && !r.resultText) || !r.unit || r.referenceLow == null || r.referenceHigh == null),
    );
  }

  async function handleVerify() {
    if (!id) return;
    setError(null);

    const incomplete = incompleteMatchedRows();
    if (incomplete.length > 0) {
      setError(
        `${incomplete.length} matched row${incomplete.length === 1 ? '' : 's'} ${incomplete.length === 1 ? 'is' : 'are'} missing a value, unit, or reference range. Fill every field in before saving, or unmatch the row to skip it.`,
      );
      return;
    }

    setBusy(true);
    try {
      await apiFetch(`/reports/${id}/verify`, {
        method: 'POST',
        body: JSON.stringify({ sampleDate: new Date(sampleDate).toISOString(), results: buildResults() }),
      });
      setRows([]);
      setSummary(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Verify failed');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Publish — verify, review and release, in one request.
   *
   * The server still walks each transition through its own guard; this just
   * stops the admin making three round trips to say one thing.
   */
  async function handlePublish() {
    if (!id) return;
    setError(null);
    setPublishing(true);
    try {
      await apiFetch(`/reports/${id}/publish`, {
        method: 'POST',
        body: JSON.stringify({
          sampleDate: new Date(sampleDate).toISOString(),
          results: buildResults(),
          note: note || undefined,
          confirm: true,
        }),
      });
      setPublishOpen(false);
      setRows([]);
      setSummary(null);
      show('Report published and released to the patient.', 'success');
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Publish failed');
      setPublishOpen(false);
    } finally {
      setPublishing(false);
    }
  }

  async function handleReview(approve: boolean) {
    if (!id) return;
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/reports/${id}/review`, { method: 'POST', body: JSON.stringify({ approve, note }) });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Review failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleRelease() {
    if (!id) return;
    setError(null);
    setBusy(true);
    try {
      await apiFetch(`/reports/${id}/release`, { method: 'POST' });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Release failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload() {
    if (!id) return;
    try {
      // Fetched and saved rather than window.open'd: a popup opened after an
      // await is no longer user-initiated and is silently blocked by default
      // in Safari. See lib/download.ts.
      await downloadSignedFile(`/reports/${id}/download-link`, 'original-report.pdf');
    } catch (e) {
      // A file that has aged out of storage, or a signing failure. Either way
      // this used to reject into nothing at all.
      show(e instanceof ApiError ? e.message : 'Could not open the original PDF.', 'error');
    }
  }

  if (loadError != null) {
    return (
      <>
        <Breadcrumbs items={[{ label: 'Reports', to: '/admin' }, { label: 'Not available' }]} />
        <div className="mt-8">
          <ErrorState error={loadError} subject="this report" backTo={{ to: '/admin', label: 'Back to reports' }} />
        </div>
      </>
    );
  }

  if (!report) {
    return (
      <div aria-busy="true" aria-label="Loading report">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="mt-3 h-9 w-72" />
        <Skeleton className="mt-8 h-10 w-64" />
      </div>
    );
  }

  const patientName = report.patient.patientProfile
    ? `${report.patient.patientProfile.firstName} ${report.patient.patientProfile.lastName}`
    : report.patient.email;
  const voidedByName = report.voidedBy
    ? report.voidedBy.staffProfile
      ? `${report.voidedBy.staffProfile.firstName} ${report.voidedBy.staffProfile.lastName}`
      : report.voidedBy.email
    : null;

  const sampleDateLabel = formatDate(report.sampleDate);
  // The heading form, not the server's self-contained title. Every place this
  // is printed already has the sample date immediately beside it, and
  // formatReportTitle's no-panel fallback carries the date too — so a
  // panel-less report identified itself as "Results · 1 March 2026, 1 March
  // 2026" in the breadcrumb, again in the sticky bar, again in the eyebrow and
  // again in the H1: the same date five times on one screen.
  const reportHeading = formatReportHeading(report.panel?.name, report.results.length);
  const attentionRows = rows.map((r, i) => ({ row: r, i })).filter(({ row }) => row.attention.length > 0);
  const cleanRows = rows.map((r, i) => ({ row: r, i })).filter(({ row }) => row.attention.length === 0);
  const publishable = rows.length > 0 && buildResults().length > 0 && attentionRows.length === 0 && incompleteMatchedRows().length === 0;

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Patients', to: '/admin/patients' },
          { label: patientName, to: `/admin/patients/${report.patient.id}` },
          { label: `${reportHeading}, ${sampleDateLabel}` },
        ]}
      />

      {/* Sticky once the page heading scrolls past it — losing track of whose results are on
          screen partway down a long verify table is a real clinical risk, not just a UX nicety. */}
      {/* Negative margin has to track the shell's own padding scale (px-5 / sm:px-8 /
          md:px-14), or the bar hangs past the viewport edge — it was -mx-6 against
          20px of mobile padding, which scrolled the page 4px sideways. */}
      <div className="sticky top-topbar z-20 -mx-5 mb-4 border-b border-taupe bg-cream/95 px-5 py-2.5 backdrop-blur sm:-mx-8 sm:px-8 md:-mx-14 md:px-14">
        <p className="truncate text-sm font-medium text-espresso">
          {patientName} <span className="text-espresso/50">·</span> {reportHeading}{' '}
          <span className="text-espresso/50">·</span> <span className="tabular">{sampleDateLabel}</span>
        </p>
      </div>

      <TwoTierHeading eyebrow={`${patientName} · ${sampleDateLabel}`} title={reportHeading} />
      <p className="mt-2 flex items-center gap-1 text-sm text-espresso/80">
        {report.patient.email}
        <CopyButton value={report.patient.email} label="Copy patient email" />
      </p>
      {report.sourceLabel && <p className="mt-1 text-sm text-espresso/80">{report.sourceLabel}</p>}

      <div className="mt-6 max-w-xl">
        <ReportProgress status={report.status as ReportStatus} voided={!!report.voidedAt} />
      </div>

      {report.voidedAt && (
        <Card className="mt-4 max-w-xl bg-tint-significantHigh">
          <p className="font-medium text-status-significantHigh">Voided</p>
          <p className="mt-1 text-sm text-espresso">
            {formatDateTime(report.voidedAt)} by {voidedByName}
            {report.voidReason ? `: “${report.voidReason}”` : ''}
          </p>
          <p className="mt-1 text-sm text-espresso/80">
            This report no longer appears in the patient’s own view. It remains here, and in the audit log, for
            admin reference.
          </p>
        </Card>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-status-significantHigh">
          {error}
        </p>
      )}

      <div className="mt-8 flex flex-wrap gap-3">
        {/* Publish leads. It is the action on a routine report, and putting it
            behind the parse table was most of why publishing took so long. */}
        {user?.role === 'ADMIN' && rows.length > 0 && !report.voidedAt && (
          <Button onClick={() => setPublishOpen(true)} disabled={parsing || busy}>
            Publish
          </Button>
        )}

        {/* Only where there is a document. A manually-entered report has no
            source PDF, and both of these used to be offered on one anyway:
            Download threw an unhandled 404 with nothing shown to the user, and
            Parse offered to re-read a file that does not exist. */}
        {report.originalPdfFileId && (
          <Button variant="secondary" onClick={handleDownload}>
            Download original PDF
          </Button>
        )}

        {user?.role === 'ADMIN' && report.originalPdfFileId && !report.voidedAt && PARSEABLE.includes(report.status) && (
          <Button variant="secondary" onClick={handleParse} loading={parsing}>
            {rows.length > 0 ? 'Parse again' : 'Parse PDF'}
          </Button>
        )}

        {canActAsClinician && report.status === 'ADMIN_VERIFIED' && (
          <>
            <Button onClick={() => handleReview(true)} loading={busy}>
              Approve
            </Button>
            <Button variant="secondary" onClick={() => handleReview(false)} disabled={busy}>
              Request changes
            </Button>
          </>
        )}

        {canActAsClinician && report.status === 'CLINICIAN_REVIEWED' && (
          <Button onClick={handleRelease} loading={busy}>
            Release to patient
          </Button>
        )}

        {user?.role === 'ADMIN' && !report.voidedAt && (
          <Button variant="destructive" onClick={() => setVoidOpen(true)}>
            Void report
          </Button>
        )}
      </div>

      {canActAsClinician && report.status === 'ADMIN_VERIFIED' && (
        <Card className="mt-6 max-w-xl">
          <label htmlFor="review-note" className="text-sm font-medium text-espresso">
            Note <span className="font-normal text-espresso/80">(optional, kept in the audit log)</span>
          </label>
          <textarea
            id="review-note"
            className="input-base mt-2"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Card>
      )}

      {parsing && rows.length === 0 && (
        <Card className="mt-8 max-w-2xl" aria-busy="true">
          <p className="text-sm font-medium text-espresso">Reading the report…</p>
          <p className="mt-1 text-sm text-espresso/80">
            Extracting every marker, its value, units and printed reference range, then deriving each status.
          </p>
          <Skeleton className="mt-4 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-3/4" />
        </Card>
      )}

      {summary && rows.length > 0 && (
        <div className="mt-8">
          <ParseSummaryCard
            summary={summary}
            extractionMethod={extractionMethod}
            fallbackReason={fallbackReason}
            panelName={parsedPanelName}
          />

          <div className="mt-5 max-w-xs">
            <DateField label="Sample date" name="sampleDate" preset="recent-past" value={sampleDate} onChange={setSampleDate} />
          </div>

          {attentionRows.length > 0 && (
            <div className="mt-7">
              <p className="eyebrow mb-1">
                Needs your input · {attentionRows.length} of {rows.length}
              </p>
              {/* The collapse below already says how many parsed cleanly. */}
              <p className="mb-3 max-w-2xl text-sm text-espresso/80">
                Nothing could settle these automatically: an unrecognised marker, a result with no usable range, or
                a status that disagrees with the lab’s own flag.
              </p>
              <RowTable
                entries={attentionRows}
                markers={markers}
                updateRow={updateRow}
                fillMissingRange={fillMissingRange}
              />
            </div>
          )}

          {cleanRows.length > 0 && (
            <div className="mt-7">
              <button
                type="button"
                onClick={() => setShowAllRows((v) => !v)}
                aria-expanded={showAllRows}
                className="flex min-h-tap items-center gap-2 text-sm font-medium text-bronze underline underline-offset-4"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  aria-hidden="true"
                  className={`transition-transform duration-150 ${showAllRows ? 'rotate-90' : ''}`}
                >
                  <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {showAllRows ? 'Hide' : 'Review'} the {cleanRows.length} row{cleanRows.length === 1 ? '' : 's'} that
                parsed cleanly
              </button>
              {showAllRows && (
                <div className="mt-4">
                  <RowTable
                    entries={cleanRows}
                    markers={markers}
                    updateRow={updateRow}
                    fillMissingRange={fillMissingRange}
                  />
                </div>
              )}
            </div>
          )}

          {/* Still available, still not mandatory: an admin who wants the
              report verified now and reviewed by someone else later takes
              this route instead of Publish. */}
          <Button variant="secondary" onClick={handleVerify} loading={busy} className="mt-7">
            Save &amp; mark as verified, review later
          </Button>
        </div>
      )}

      {report.results.length > 0 && (
        <div className="mt-10">
          <p className="eyebrow mb-4">Results on record</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {report.results.map((r) => (
              <Card key={r.markerId}>
                <p className="font-medium text-espresso">{r.marker.name}</p>
                <p className="tabular text-lg text-espresso">
                  {r.valueText ?? r.value} {r.unit}
                </p>
                <p className="tabular text-sm text-espresso/80">
                  Range: {r.referenceRange.low}–{r.referenceRange.high}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <StatusBadge status={r.status} />
                  {r.amendedAt && (
                    <span className="text-xs text-espresso/80">Amended {formatDate(r.amendedAt)}</span>
                  )}
                </div>
                {user?.role === 'ADMIN' && report.status === 'RELEASED' && !report.voidedAt && (
                  <Button
                    variant="ghost"
                    className="mt-2"
                    onClick={() => {
                      setEditingResult(r);
                      setEditValue(r.value === null ? '' : String(r.value));
                      setEditUnit(r.unit);
                    }}
                  >
                    Edit value
                  </Button>
                )}
                {r.edits.length > 0 && (
                  <div className="mt-3 border-t border-taupe pt-2">
                    <p className="text-xs font-medium text-espresso/80">Amendment history</p>
                    <ul className="mt-1 flex flex-col gap-1">
                      {r.edits.map((e) => (
                        <li key={e.id} className="text-xs text-espresso/80">
                          {formatDate(e.changedAt)}: {e.previousValue} {e.previousUnit} →{' '}
                          {e.newValue} {e.newUnit} by {e.changedByName}: “{e.reason}”
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* One confirmation, two ways out. Not a wizard: there is no second
          screen behind either button. */}
      <Modal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title="Publish this report?"
        footer={
          <>
            <Button
              variant="secondary"
              disabled={publishing}
              onClick={() => {
                setPublishOpen(false);
                setShowAllRows(true);
              }}
            >
              Review first
            </Button>
            <Button variant="primary" loading={publishing} disabled={!publishable} onClick={handlePublish}>
              {publishing ? 'Publishing…' : 'Publish now'}
            </Button>
          </>
        }
      >
        <p>
          <strong>{patientName}</strong> will be able to see {buildResults().length} result
          {buildResults().length === 1 ? '' : 's'} from {sampleDateLabel} immediately, and will be notified. The
          report is verified, reviewed and released in one step; each stage is still recorded separately in the audit
          log.
        </p>
        {summary && (
          <ul className="mt-3 flex flex-col gap-1 text-sm text-espresso/80">
            <li className="tabular">{summary.total} markers read from the PDF</li>
            {summary.unmatched > 0 && <li className="tabular">{summary.unmatched} not matched to a marker, and will be skipped</li>}
            {summary.unevaluable > 0 && (
              <li className="tabular">{summary.unevaluable} recorded as reported, with no position on a numeric range</li>
            )}
          </ul>
        )}
        {!publishable && (
          <p className="mt-3 text-sm text-status-significantHigh">
            {attentionRows.length > 0
              ? `${attentionRows.length} row${attentionRows.length === 1 ? '' : 's'} still need${attentionRows.length === 1 ? 's' : ''} your input, so this can’t go out as parsed. Choose “Review first”.`
              : 'There is nothing complete enough to publish yet. Choose “Review first”.'}
          </p>
        )}
      </Modal>

      <ConfirmModal
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
        title="Void this report?"
        requireReason
        reasonLabel="Reason (kept in the audit log)"
        confirmLabel="Void report"
        confirmingLabel="Voiding…"
        onConfirm={async (reason) => {
          await apiFetch(`/reports/${id}/void`, { method: 'POST', body: JSON.stringify({ reason }) });
          show('Report voided.', 'success');
          setVoidOpen(false);
          await load();
        }}
      >
        <p>
          <strong>{patientName}</strong> will no longer see this report anywhere in their portal. It stays in the
          database and the audit log, and remains visible here marked voided. This is a state change, never a
          deletion.
        </p>
      </ConfirmModal>

      <ConfirmModal
        open={!!editingResult}
        onClose={() => setEditingResult(null)}
        title="Amend this result?"
        requireReason
        reasonLabel="Reason for the change (kept in the audit log)"
        confirmLabel="Save amendment"
        confirmingLabel="Saving…"
        onConfirm={async (reason) => {
          if (!editingResult) return;
          await apiFetch(`/reports/${id}/results/${editingResult.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ value: Number(editValue), unit: editUnit, reason }),
          });
          show('Result amended.', 'success');
          setEditingResult(null);
          await load();
        }}
      >
        {editingResult && (
          <>
            <p>
              This report has already been released to <strong>{patientName}</strong>. The change is versioned, not
              overwritten: the previous value, who changed it, when and why are all kept and shown to admins. The
              patient sees the new value with an "amended" note and date.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="edit-value" className="text-sm font-medium text-espresso">
                  New value (currently {editingResult.valueText ?? editingResult.value} {editingResult.unit})
                </label>
                <input
                  id="edit-value"
                  type="number"
                  step="any"
                  className="input-base tabular"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="edit-unit" className="text-sm font-medium text-espresso">
                  Unit
                </label>
                <input id="edit-unit" className="input-base" value={editUnit} onChange={(e) => setEditUnit(e.target.value)} />
              </div>
            </div>
          </>
        )}
      </ConfirmModal>
    </>
  );
}

/**
 * The whole report at a glance, so the decision to publish is made from a
 * summary rather than from scrolling forty rows. Three numbers, because three
 * numbers is what the decision actually turns on.
 */
function ParseSummaryCard({
  summary,
  extractionMethod,
  fallbackReason,
  panelName,
}: {
  summary: ParseSummary;
  extractionMethod: 'llm' | 'regex' | null;
  fallbackReason: string | null;
  panelName: string | null;
}) {
  return (
    <Card className="max-w-2xl">
      <p className="eyebrow">Parse summary</p>
      <div className="mt-4 grid grid-cols-3 gap-4">
        <div>
          <p className="tabular font-display text-2xl leading-none text-espresso">{summary.clean}</p>
          <p className="mt-1 text-xs text-espresso/80">parsed cleanly</p>
        </div>
        <div>
          <p className="tabular font-display text-2xl leading-none text-espresso">{summary.needingAttention}</p>
          <p className="mt-1 text-xs text-espresso/80">need attention</p>
        </div>
        <div>
          <p className="tabular font-display text-2xl leading-none text-espresso">{summary.unmatched}</p>
          <p className="mt-1 text-xs text-espresso/80">unmatched markers</p>
        </div>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-espresso/85">
        {summary.readyToPublish
          ? `All ${summary.total} markers were matched, given a reference range, and had their status derived from it. Nothing needs correcting.`
          : `${summary.total} markers read. ${summary.needingAttention} could not be settled automatically and ${summary.needingAttention === 1 ? 'is' : 'are'} listed below.`}
      </p>
      {summary.unevaluable > 0 && (
        <p className="mt-2 text-sm leading-relaxed text-espresso/80">
          {summary.unevaluable} result{summary.unevaluable === 1 ? ' has' : 's have'} no position on a numeric range
          (a qualitative result, or a limit that straddles the range). {summary.unevaluable === 1 ? 'It is' : 'They are'}{' '}
          recorded exactly as reported rather than being assigned a status.
        </p>
      )}
      {panelName && <p className="mt-3 text-xs text-espresso/80">Panel printed on the report: {panelName}</p>}
      {extractionMethod === 'regex' && (
        <div className="mt-4 rounded-input border border-taupe bg-tint-high p-3">
          <p className="text-sm font-medium text-espresso">Pattern-based extraction (AI extraction unavailable)</p>
          <p className="mt-1 text-sm text-espresso/80">{fallbackReason}</p>
        </div>
      )}
      {extractionMethod === 'llm' && (
        <p className="mt-3 text-xs text-espresso/80">
          Extracted with AI assistance. Statuses are derived from the reference range on each result, falling back to
          the marker’s stored range only where the report printed none.
        </p>
      )}
    </Card>
  );
}

function RowTable({
  entries,
  markers,
  updateRow,
  fillMissingRange,
}: {
  entries: { row: ParsedRow; i: number }[];
  markers: MarkerOption[];
  updateRow: (index: number, patch: Partial<ParsedRow> | ((row: ParsedRow) => Partial<ParsedRow>)) => void;
  fillMissingRange: (index: number, markerId: string) => void;
}) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeaderCell>Status</TableHeaderCell>
          <TableHeaderCell>Source text</TableHeaderCell>
          <TableHeaderCell>Marker</TableHeaderCell>
          <TableHeaderCell>Value</TableHeaderCell>
          <TableHeaderCell>Unit</TableHeaderCell>
          <TableHeaderCell>Low</TableHeaderCell>
          <TableHeaderCell>High</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {entries.map(({ row, i }) => {
          const flags = row.flags ?? [];
          const needsInput = row.attention.length > 0;
          return (
            <TableRow key={i} className={needsInput ? 'bg-status-high/5' : undefined}>
              <TableCell>
                {/* The derived status, not a badge the admin has to set. Where
                    it could not be derived, that is stated in words rather
                    than left as an empty cell. */}
                {row.derivedStatus ? (
                  <StatusBadge status={row.derivedStatus} />
                ) : row.unevaluableReason ? (
                  <span className="text-xs font-medium text-espresso/80">Recorded as reported</span>
                ) : (
                  <span className="text-xs font-medium text-status-high">No status yet</span>
                )}
                {row.rangeSource && (
                  <p className="mt-1 text-xs text-espresso/80">Range {RANGE_SOURCE_LABEL[row.rangeSource]}</p>
                )}
                {/* WHERE THE SUGGESTION CAME FROM, on the row that carries it.
                    Only on a marker fallback: a range printed on the report
                    needs no provenance from us, it IS the provenance.

                    A suggestion that is usually correct is one people stop
                    checking, and until now an unverified standard adult band
                    and a range transcribed from the Randox report looked
                    exactly the same in this cell. The detail sentence says
                    what to do about it rather than only naming a tier.

                    No colour. A tier is not a status, and the traffic light in
                    this table means something specific about the RESULT. */}
                {row.rangeProvenanceLabel && (
                  <p
                    className="mt-1 max-w-[220px] text-xs leading-relaxed text-espresso/80"
                    title={row.rangeProvenanceDetail ?? undefined}
                  >
                    <span className="font-medium">{row.rangeProvenanceLabel}</span>
                    {row.rangeProvenance !== 'RANDOX' && row.rangeProvenanceDetail ? ` — ${row.rangeProvenanceDetail}` : ''}
                  </p>
                )}
                {row.sampleType && <p className="mt-0.5 text-xs text-espresso/80">{row.sampleType}</p>}
                {row.unevaluableReason && (
                  <p className="mt-1 max-w-[220px] text-xs leading-relaxed text-espresso/80">{row.unevaluableReason}</p>
                )}
                {row.attention.map((a, k) => (
                  <p key={k} className="mt-1 flex max-w-[220px] items-start gap-1 text-xs leading-relaxed text-status-high">
                    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" className="mt-0.5 shrink-0">
                      <path
                        d="M8 1.5 L15 14 H1 Z M8 6.5 V9.5 M8 11.5 h.01"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {a.message}
                  </p>
                ))}
                {flags.length > 0 && !needsInput && (
                  <Tooltip label={flags.map((f) => FLAG_LABEL[f] ?? f).join(' · ')}>
                    <span className="mt-1 inline-flex items-center gap-1 text-espresso/80" tabIndex={0}>
                      <span className="text-xs">Extraction notes</span>
                    </span>
                  </Tooltip>
                )}
                {row.resultText && <p className="mt-1 text-xs text-espresso/80">Reported as: “{row.resultText}”</p>}
              </TableCell>
              <TableCell className="max-w-[240px] truncate" title={row.sourceText ?? row.rawLine}>
                {row.sourceText ?? row.rawLine}
                {row.confidence != null && (
                  <span className="ml-1.5 text-xs text-espresso/50">({Math.round(row.confidence * 100)}%)</span>
                )}
              </TableCell>
              <TableCell>
                <Select
                  label={`Matched marker for "${row.rawName}"`}
                  hideLabel
                  searchable
                  emptyMessage={<>No markers configured yet. Add one under the Panels &amp; markers tab.</>}
                  name={`matched-marker-${i}`}
                  value={row.matchedMarkerId ?? ''}
                  onChange={(e) => {
                    const markerId = e.target.value || null;
                    updateRow(i, { matchedMarkerId: markerId });
                    if (markerId) fillMissingRange(i, markerId);
                  }}
                >
                  <option value="">Unmatched, skip this row</option>
                  {markers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </TableCell>
              <TableCell>
                {/* A non-numeric result stays text. Typing it into a number
                    field would silently coerce "< 5.0" to 5, which is the one
                    transformation that must never happen to a lab value. */}
                {row.value == null && row.resultText ? (
                  <input
                    className="input-base w-24 py-1.5"
                    aria-label={`Result for ${row.rawName}`}
                    value={row.resultText}
                    onChange={(e) => updateRow(i, { resultText: e.target.value })}
                  />
                ) : (
                  <input
                    type="number"
                    step="any"
                    aria-label={`Value for ${row.rawName}`}
                    className="input-base tabular w-24 py-1.5"
                    value={row.value ?? ''}
                    onChange={(e) => updateRow(i, { value: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                )}
              </TableCell>
              <TableCell>
                <input
                  className="input-base w-20 py-1.5"
                  aria-label={`Unit for ${row.rawName}`}
                  value={row.unit ?? ''}
                  onChange={(e) => updateRow(i, { unit: e.target.value })}
                />
              </TableCell>
              <TableCell>
                <input
                  type="number"
                  step="any"
                  aria-label={`Reference low for ${row.rawName}`}
                  className="input-base tabular w-20 py-1.5"
                  value={row.referenceLow ?? ''}
                  onChange={(e) => updateRow(i, { referenceLow: e.target.value === '' ? null : Number(e.target.value) })}
                />
              </TableCell>
              <TableCell>
                <input
                  type="number"
                  step="any"
                  aria-label={`Reference high for ${row.rawName}`}
                  className="input-base tabular w-20 py-1.5"
                  value={row.referenceHigh ?? ''}
                  onChange={(e) => updateRow(i, { referenceHigh: e.target.value === '' ? null : Number(e.target.value) })}
                />
                {/* The catalogue declined to suggest a range and said
                    why. Blank fields with no explanation read as a
                    lookup that didn't run; this says it ran and
                    deliberately refused to guess. */}
                {row.rangeNotice && (
                  <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-espresso/80">{row.rangeNotice}</p>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
