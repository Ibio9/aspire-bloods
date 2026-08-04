import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../../components/ui/Table';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { CopyButton } from '../../components/ui/CopyButton';
import { apiFetch, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/AuthContext';

interface MarkerOption {
  id: string;
  name: string;
  defaultUnit: string;
}

interface ParsedRow {
  rawLine: string;
  rawName: string;
  matchedMarkerId: string | null;
  matchedMarkerName: string | null;
  value: number | null;
  unit: string | null;
  referenceLow: number | null;
  referenceHigh: number | null;
}

interface VerifiedResult {
  markerId: string;
  marker: { name: string };
  value: number;
  unit: string;
  status: 'IN_RANGE' | 'HIGH' | 'LOW' | 'SIGNIFICANT_HIGH' | 'SIGNIFICANT_LOW';
  referenceRange: { low: number; high: number };
}

interface ReportDetail {
  id: string;
  status: string;
  sampleDate: string;
  sourceLabel?: string;
  panel: { name: string };
  patient: { email: string; patientProfile: { firstName: string; lastName: string } | null };
  results: VerifiedResult[];
}

export function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [markers, setMarkers] = useState<MarkerOption[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [sampleDate, setSampleDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

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
      const result = await apiFetch<{ sampleDate: string; rows: ParsedRow[] }>(`/reports/${id}/parse`, {
        method: 'POST',
      });
      setRows(result.rows);
      setSampleDate(result.sampleDate);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Parse failed');
    } finally {
      setBusy(false);
    }
  }

  function updateRow(index: number, patch: Partial<ParsedRow>) {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function handleVerify() {
    if (!id) return;
    setError(null);
    setBusy(true);
    try {
      const results = rows
        .filter((r) => r.matchedMarkerId)
        .map((r) => ({
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
    window.open(url, '_blank');
  }

  if (!report) {
    return (
      <main className="min-h-screen px-6 py-16 md:px-16 bg-cream" aria-busy="true" aria-label="Loading report">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="mt-3 h-9 w-72" />
        <Skeleton className="mt-8 h-10 w-64" />
      </main>
    );
  }

  const patientName = report.patient.patientProfile
    ? `${report.patient.patientProfile.firstName} ${report.patient.patientProfile.lastName}`
    : report.patient.email;

  return (
    <main className="min-h-screen px-6 py-16 md:px-16 bg-cream">
      <TwoTierHeading eyebrow={`${report.panel.name} — ${patientName}`} title={report.status.replace(/_/g, ' ')} />
      <p className="mt-2 flex items-center gap-1 text-sm text-espresso/60">
        {report.patient.email}
        <CopyButton value={report.patient.email} label="Copy patient email" />
      </p>
      {report.sourceLabel && <p className="mt-1 text-sm text-espresso/60">{report.sourceLabel}</p>}

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

        {user?.role === 'CLINICIAN' && report.status === 'ADMIN_VERIFIED' && (
          <>
            <Button onClick={() => handleReview(true)} loading={busy}>
              Approve
            </Button>
            <Button variant="secondary" onClick={() => handleReview(false)} disabled={busy}>
              Request changes
            </Button>
          </>
        )}

        {user?.role === 'CLINICIAN' && report.status === 'CLINICIAN_REVIEWED' && (
          <Button onClick={handleRelease} loading={busy}>
            Release to patient
          </Button>
        )}
      </div>

      {user?.role === 'CLINICIAN' && report.status === 'ADMIN_VERIFIED' && (
        <Card className="mt-6 max-w-xl">
          <label htmlFor="review-note" className="text-sm font-medium text-espresso">
            Note <span className="font-normal text-espresso/60">(optional, kept in the audit log)</span>
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
          <p className="eyebrow mb-4">Verify extracted results — correct anything before saving</p>
          <div className="mb-4 max-w-xs">
            <Input label="Sample date" name="sampleDate" type="date" value={sampleDate} onChange={(e) => setSampleDate(e.target.value)} />
          </div>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Raw line</TableHeaderCell>
                <TableHeaderCell>Marker</TableHeaderCell>
                <TableHeaderCell>Value</TableHeaderCell>
                <TableHeaderCell>Unit</TableHeaderCell>
                <TableHeaderCell>Low</TableHeaderCell>
                <TableHeaderCell>High</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i}>
                  <TableCell className="max-w-[240px] truncate" title={row.rawLine}>
                    {row.rawLine}
                  </TableCell>
                  <TableCell>
                    <select
                      className="input-base py-1.5"
                      value={row.matchedMarkerId ?? ''}
                      onChange={(e) => updateRow(i, { matchedMarkerId: e.target.value || null })}
                    >
                      <option value="">— unmatched, skip —</option>
                      {markers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
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
              ))}
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
                <p className="tabular text-sm text-espresso/70">
                  Range: {r.referenceRange.low}–{r.referenceRange.high}
                </p>
                <div className="mt-1">
                  <StatusBadge status={r.status} />
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
