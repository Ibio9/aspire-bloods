import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Breadcrumbs } from '../../components/nav/Breadcrumbs';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { DateField } from '../../components/ui/DateField';
import { Skeleton } from '../../components/ui/Skeleton';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../../components/ui/Table';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { ReportProgress } from '../../components/ui/ReportProgress';
import { CopyButton } from '../../components/ui/CopyButton';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { Tooltip } from '../../components/ui/Tooltip';
import { useToast } from '../../components/ui/Toast';
import { apiFetch, ApiError } from '../../lib/api';
import { API_BASE_URL } from '../../lib/apiBase';
import { useAuth } from '../../lib/AuthContext';
import type { ReportStatus } from '../../lib/reportStatus';
import { formatDate, formatDateTime } from '@aspire-bloods/shared';

interface MarkerOption {
  id: string;
  name: string;
  defaultUnit: string;
}

const FLAG_LABEL: Record<string, string> = {
  unknown_marker: "Marker isn't in the catalogue",
  implausible_unit: 'Unit looks wrong for this marker',
  value_order_of_magnitude: 'Value is far outside the reference range',
  two_pass_disagreement: 'A second AI read disagreed, so check closely',
  non_numeric_result: 'Non-numeric result (e.g. "Not detected")',
  duplicate_printing_disagreement: 'Printed twice with different values, so check closely',
};

interface ParsedRow {
  rawLine: string;
  rawName: string;
  matchedMarkerId: string | null;
  matchedMarkerName: string | null;
  value: number | null;
  unit: string | null;
  referenceLow: number | null;
  referenceHigh: number | null;
  resultText: string | null;
  needsReview: boolean;
  reviewReason: string | null;
  sourceText?: string;
  confidence?: number | null;
  flags?: string[];
}

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
  value: number;
  unit: string;
  status: 'IN_RANGE' | 'HIGH' | 'LOW' | 'SIGNIFICANT_HIGH' | 'SIGNIFICANT_LOW';
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
  /** Null for an ad-hoc report with no catalogue panel behind it. */
  panel: { name: string } | null;
  title: string;
  patient: { id: string; email: string; patientProfile: { firstName: string; lastName: string } | null };
  results: VerifiedResult[];
}

export function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { show } = useToast();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [markers, setMarkers] = useState<MarkerOption[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [extractionMethod, setExtractionMethod] = useState<'llm' | 'regex' | null>(null);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [parsedPanelName, setParsedPanelName] = useState<string | null>(null);
  const [sampleDate, setSampleDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [voidOpen, setVoidOpen] = useState(false);
  const [editingResult, setEditingResult] = useState<VerifiedResult | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editUnit, setEditUnit] = useState('');

  const canActAsClinician = user?.role === 'ADMIN' || user?.role === 'CLINICIAN';

  async function load() {
    if (!id) return;
    const [r, m] = await Promise.all([
      apiFetch<ReportDetail>(`/reports/${id}`),
      apiFetch<MarkerOption[]>('/panels/markers'),
    ]);
    setReport(r);
    setMarkers(m);
    setSampleDate(r.sampleDate.slice(0, 10));
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleParse() {
    if (!id) return;
    setError(null);
    setBusy(true);
    try {
      const result = await apiFetch<{
        sampleDate: string;
        panelName: string | null;
        extractionMethod: 'llm' | 'regex';
        fallbackReason: string | null;
        rows: ParsedRow[];
      }>(`/reports/${id}/parse`, { method: 'POST' });
      setRows(result.rows);
      setSampleDate(result.sampleDate);
      setExtractionMethod(result.extractionMethod);
      setFallbackReason(result.fallbackReason);
      setParsedPanelName(result.panelName);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Parse failed');
    } finally {
      setBusy(false);
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
    void apiFetch<{ low: number; high: number; unit: string } | null>(
      `/panels/markers/${markerId}/resolved-range?patientId=${report.patient.id}`,
    ).then((resolved) => {
      if (!resolved) return;
      updateRow(index, (row) =>
        row.referenceLow == null && row.referenceHigh == null
          ? { referenceLow: resolved.low, referenceHigh: resolved.high, unit: row.unit ?? resolved.unit }
          : {},
      );
    });
  }

  async function handleVerify() {
    if (!id) return;
    setError(null);

    const included = rows.filter((r) => r.matchedMarkerId);
    const incomplete = included.filter(
      (r) => r.value == null || !r.unit || r.referenceLow == null || r.referenceHigh == null,
    );
    if (incomplete.length > 0) {
      setError(
        `${incomplete.length} matched row${incomplete.length === 1 ? '' : 's'} ${incomplete.length === 1 ? 'is' : 'are'} missing a value, unit, or reference range. The parser flagged ${incomplete.length === 1 ? 'it' : 'them'} for manual entry (see "Needs review" below). Fill every field in before saving, or unmatch the row to skip it.`,
      );
      return;
    }

    setBusy(true);
    try {
      const results = included.map((r) => ({
        markerId: r.matchedMarkerId!,
        value: Number(r.value),
        unit: r.unit ?? '',
        referenceLow: Number(r.referenceLow),
        referenceHigh: Number(r.referenceHigh),
      }));
      await apiFetch(`/reports/${id}/verify`, {
        method: 'POST',
        body: JSON.stringify({ sampleDate: new Date(sampleDate).toISOString(), results }),
      });
      setRows([]);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Verify failed');
    } finally {
      setBusy(false);
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
    const { url } = await apiFetch<{ url: string }>(`/reports/${id}/download-link`);
    window.open(`${API_BASE_URL}${url}`, '_blank');
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

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Patients', to: '/admin/patients' },
          { label: patientName, to: `/admin/patients/${report.patient.id}` },
          { label: `${report.title}, ${sampleDateLabel}` },
        ]}
      />

      {/* Sticky once the page heading scrolls past it — losing track of whose results are on
          screen partway down a long verify table is a real clinical risk, not just a UX nicety. */}
      {/* Negative margin has to track the shell's own padding scale (px-5 / sm:px-8 /
          md:px-14), or the bar hangs past the viewport edge — it was -mx-6 against
          20px of mobile padding, which scrolled the page 4px sideways. */}
      <div className="sticky top-[61px] z-20 -mx-5 mb-4 border-b border-taupe bg-cream/95 px-5 py-2.5 backdrop-blur sm:-mx-8 sm:px-8 md:-mx-10 md:px-10">
        <p className="truncate text-sm font-medium text-espresso">
          {patientName} <span className="text-espresso/50">·</span> {report.title}{' '}
          <span className="text-espresso/50">·</span> <span className="tabular">{sampleDateLabel}</span>
        </p>
      </div>

      <TwoTierHeading eyebrow={`${patientName} · ${sampleDateLabel}`} title={report.title} />
      <p className="mt-2 flex items-center gap-1 text-sm text-espresso/80">
        {report.patient.email}
        <CopyButton value={report.patient.email} label="Copy patient email" />
      </p>
      {report.sourceLabel && <p className="mt-1 text-sm text-espresso/80">{report.sourceLabel}</p>}

      <div className="mt-6 max-w-xl">
        <ReportProgress status={report.status as ReportStatus} voided={!!report.voidedAt} />
      </div>

      {report.voidedAt && (
        <Card className="mt-4 max-w-xl border-status-significantHigh bg-white">
          <p className="font-medium text-status-significantHigh">Voided</p>
          <p className="mt-1 text-sm text-espresso">
            {formatDateTime(report.voidedAt)} by {voidedByName}
            {report.voidReason ? `: “${report.voidReason}”` : ''}
          </p>
          <p className="mt-1 text-sm text-espresso/80">
            This report no longer appears in the patient's own view. It remains here, and in the audit log, for
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
        <Button variant="secondary" onClick={handleDownload}>
          Download original PDF
        </Button>

        {user?.role === 'ADMIN' && ['UPLOADED', 'CHANGES_REQUESTED'].includes(report.status) && (
          <Button onClick={handleParse} loading={busy}>
            Parse PDF
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

      {rows.length > 0 && (
        <div className="mt-8">
          <p className="eyebrow mb-1">Verify extracted results: correct anything before saving</p>
          {parsedPanelName && <p className="mb-3 text-sm text-espresso/80">Panel printed on the report: {parsedPanelName}</p>}
          {extractionMethod === 'regex' && (
            <Card className="mb-4 max-w-2xl border-status-high bg-white">
              <p className="text-sm font-medium text-espresso">Pattern-based extraction (AI extraction unavailable)</p>
              <p className="mt-1 text-sm text-espresso/80">{fallbackReason}</p>
            </Card>
          )}
          {extractionMethod === 'llm' && (
            <p className="mb-4 text-xs text-espresso/60">
              Extracted with AI assistance. Every row still needs your confirmation. Rows flagged below had a low-confidence
              read or failed a sanity check; check them against the source text before saving.
            </p>
          )}
          <div className="mb-4 max-w-xs">
            <DateField label="Sample date" name="sampleDate" value={sampleDate} onChange={setSampleDate} />
          </div>
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
              {rows.map((row, i) => {
                // Two independent reasons a row deserves a second look, and an
                // admin needs both: the parser itself was unsure (needsReview —
                // no range found, qualitative result, row split across a page),
                // or a sanity check on the extracted values failed (flags —
                // unknown marker, implausible unit, two-pass disagreement).
                // Neither subsumes the other, so neither replaces the other.
                const flags = row.flags ?? [];
                const flagged = flags.length > 0;
                return (
                <TableRow key={i} className={row.needsReview || flagged ? 'bg-status-high/5' : undefined}>
                  <TableCell>
                    {row.needsReview ? (
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-status-high"
                        title={row.reviewReason ?? 'Needs review'}
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
                          <path
                            d="M8 1.5 L15 14 H1 Z M8 6.5 V9.5 M8 11.5 h.01"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        Needs review
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-status-inRange">
                        <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
                          <path d="M2 8.5 L6 12.5 L14 3.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Extracted
                      </span>
                    )}
                    {flagged && (
                      <Tooltip label={flags.map((f) => FLAG_LABEL[f] ?? f).join(' · ')}>
                        <span className="mt-1 inline-flex items-center gap-1 text-status-high" tabIndex={0}>
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                            <path
                              d="M7 1 13 12H1L7 1Z"
                              stroke="currentColor"
                              strokeWidth="1.3"
                              strokeLinejoin="round"
                              fill="none"
                            />
                            <path d="M7 5.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                            <circle cx="7" cy="10.3" r="0.7" fill="currentColor" />
                          </svg>
                          <span className="text-xs font-medium">Check</span>
                        </span>
                      </Tooltip>
                    )}
                    {row.resultText && (
                      <p className="mt-1 text-xs text-espresso/80">Reported as: “{row.resultText}”</p>
                    )}
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
                    <input
                      type="number"
                      step="any"
                      className="input-base tabular w-24 py-1.5"
                      value={row.value ?? ''}
                      onChange={(e) => updateRow(i, { value: Number(e.target.value) })}
                    />
                  </TableCell>
                  <TableCell>
                    <input
                      className="input-base w-20 py-1.5"
                      value={row.unit ?? ''}
                      onChange={(e) => updateRow(i, { unit: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <input
                      type="number"
                      step="any"
                      className="input-base tabular w-20 py-1.5"
                      value={row.referenceLow ?? ''}
                      onChange={(e) => updateRow(i, { referenceLow: Number(e.target.value) })}
                    />
                  </TableCell>
                  <TableCell>
                    <input
                      type="number"
                      step="any"
                      className="input-base tabular w-20 py-1.5"
                      value={row.referenceHigh ?? ''}
                      onChange={(e) => updateRow(i, { referenceHigh: Number(e.target.value) })}
                    />
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Button onClick={handleVerify} loading={busy} className="mt-6">
            Save &amp; mark as verified
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
                  {r.value} {r.unit}
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
                      setEditValue(String(r.value));
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
          database and the audit log, and remains visible here, marked voided. This is a state change, not a
          deletion. The record is never destroyed.
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
              overwritten. The previous value, who changed it, when, and the reason are all kept and shown to
              admins. The patient sees the new value with an "amended" note and date.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="edit-value" className="text-sm font-medium text-espresso">
                  New value (currently {editingResult.value} {editingResult.unit})
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
