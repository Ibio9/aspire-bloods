import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { FileDropzone } from '../../components/ui/FileDropzone';
import { DateField } from '../../components/ui/DateField';
import { Tabs } from '../../components/ui/Tabs';
import { apiFetch, ApiError, extractErrorMessage } from '../../lib/api';
import { API_BASE_URL } from '../../lib/apiBase';
import { statusLabel, stageIndex, type ReportStatus } from '../../lib/reportStatus';

interface PatientOption {
  id: string;
  email: string;
  status: string;
  displayName: string;
}

interface PanelOption {
  id: string;
  name: string;
  description?: string | null;
  markers: { marker: { name: string } }[];
}

// A "panel" is a test package — a bundle of markers run on one sample
// (Insight 360, Signature, Advanced GP3...). Nobody outside the lab knows
// that word, so every picker that offers one spells it out: how many
// markers, and a few by name, right under the field the moment one's picked.
function PanelSummary({ panel }: { panel: PanelOption }) {
  const count = panel.markers.length;
  if (count === 0) return null;
  const examples = panel.markers.slice(0, 4).map((pm) => pm.marker.name);
  const more = count - examples.length;
  return (
    <p className="text-xs text-espresso/80">
      {count} marker{count === 1 ? '' : 's'} — {examples.join(', ')}
      {more > 0 ? `, +${more} more` : ''}
    </p>
  );
}

interface SourceOption {
  id: string;
  key: string;
  name: string;
}

interface MarkerOption {
  id: string;
  name: string;
  defaultUnit: string;
}

interface ReportRow {
  id: string;
  status: ReportStatus;
  voidedAt: string | null;
  sampleDate: string;
  panel: { name: string } | null;
  title: string;
  source: { name: string };
  patient: { email: string; patientProfile: { firstName: string; lastName: string } | null };
}

function readCsrfCookie(): string {
  const match = document.cookie.match(/(?:^|; )csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function PdfUploadForm({
  patients,
  panels,
  sources,
  onDone,
}: {
  patients: PatientOption[];
  panels: PanelOption[];
  sources: SourceOption[];
  onDone: () => void;
}) {
  const [patientId, setPatientId] = useState('');
  const [panelId, setPanelId] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [sampleDate, setSampleDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError('Choose a PDF file');
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('patientId', patientId);
      formData.append('panelId', panelId);
      formData.append('sourceId', sourceId);
      formData.append('sampleDate', sampleDate);
      formData.append('file', file);

      const res = await fetch(`${API_BASE_URL}/api/reports`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': readCsrfCookie() },
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new ApiError(extractErrorMessage(body), res.status, body);
      }
      setFile(null);
      setPatientId('');
      setPanelId('');
      setSourceId('');
      setSampleDate('');
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <form onSubmit={handleUpload} className="flex flex-col gap-5" noValidate>
        <Select
          label="Patient"
          name="patientId"
          searchable
          emptyMessage="No patients yet — invite one from the Patients page first."
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
        >
          <option value="">Select a patient…</option>
          {patients.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName} ({p.email})
            </option>
          ))}
        </Select>
        <div className="flex flex-col gap-1.5">
          <Select
            label="Which test package?"
            hint="A panel is a bundle of markers run on one sample — e.g. Insight 360, Signature, Advanced GP3. The report itself tells us what was tested, so this is optional."
            name="panelId"
            emptyMessage="No panels configured — add one under Content & configuration."
            value={panelId}
            onChange={(e) => setPanelId(e.target.value)}
          >
            <option value="">No panel — title from date and marker count</option>
            {panels.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          {panelId && <PanelSummary panel={panels.find((p) => p.id === panelId)!} />}
        </div>
        <Select
          label="Where was this analysed?"
          hint="The lab or process that produced this result."
          name="sourceId"
          emptyMessage="No sources configured — add one under Content & configuration."
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
        >
          <option value="">Select a source…</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <DateField label="Sample date" name="sampleDate" value={sampleDate} onChange={setSampleDate} />
        <FileDropzone label="PDF report" file={file} onChange={setFile} accept="application/pdf" />
        {error && (
          <p role="alert" className="text-sm text-status-significantHigh">
            {error}
          </p>
        )}
        <Button type="submit" loading={submitting} className="self-start">
          {submitting ? 'Uploading…' : 'Upload'}
        </Button>
      </form>
    </Card>
  );
}

interface ManualRow {
  markerId: string;
  value: string;
  unit: string;
  referenceLow: string;
  referenceHigh: string;
}

function emptyRow(): ManualRow {
  return { markerId: '', value: '', unit: '', referenceLow: '', referenceHigh: '' };
}

function ManualEntryForm({
  patients,
  panels,
  markers,
  onDone,
}: {
  patients: PatientOption[];
  panels: PanelOption[];
  markers: MarkerOption[];
  onDone: () => void;
}) {
  const [patientId, setPatientId] = useState('');
  const [panelId, setPanelId] = useState('');
  const [sampleDate, setSampleDate] = useState('');
  const [rows, setRows] = useState<ManualRow[]>([emptyRow()]);
  const [implausible, setImplausible] = useState<{ markerName: string; reason: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateRow(i: number, patch: Partial<ManualRow> | ((row: ManualRow) => Partial<ManualRow>)) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...(typeof patch === 'function' ? patch(r) : patch) } : r)));
  }

  function markerUnit(markerId: string): string {
    return markers.find((m) => m.id === markerId)?.defaultUnit ?? '';
  }

  async function submit(confirmed: boolean) {
    setError(null);
    setSubmitting(true);
    try {
      const results = rows
        .filter((r) => r.markerId && r.value)
        .map((r) => ({
          markerId: r.markerId,
          value: Number(r.value),
          unit: r.unit || markerUnit(r.markerId),
          referenceLow: Number(r.referenceLow),
          referenceHigh: Number(r.referenceHigh),
        }));
      const result = await apiFetch<
        | { status: 'confirmation_required'; implausible: { markerName: string; reason: string }[] }
        | { status: 'created'; reportId: string }
      >('/reports/manual-entry', {
        method: 'POST',
        body: JSON.stringify({ patientId, panelId, sampleDate, results, confirmed }),
      });
      if (result.status === 'confirmation_required') {
        setImplausible(result.implausible);
        return;
      }
      setImplausible(null);
      setPatientId('');
      setPanelId('');
      setSampleDate('');
      setRows([emptyRow()]);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="max-w-3xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(false);
        }}
        className="flex flex-col gap-5"
        noValidate
      >
        <p className="text-sm text-espresso/80">
          For Aspire's own in-house testing — enter values directly instead of uploading a PDF. Goes through the
          same verify-and-release process as everything else.
        </p>
        <Select
          label="Patient"
          name="manualPatientId"
          searchable
          emptyMessage="No patients yet — invite one from the Patients page first."
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
        >
          <option value="">Select a patient…</option>
          {patients.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName} ({p.email})
            </option>
          ))}
        </Select>
        <div className="flex flex-col gap-1.5">
          <Select
            label="Which test package?"
            hint="A panel is a bundle of markers run on one sample — e.g. Insight 360, Signature, Advanced GP3. The report itself tells us what was tested, so this is optional."
            name="manualPanelId"
            emptyMessage="No panels configured — add one under Content & configuration."
            value={panelId}
            onChange={(e) => setPanelId(e.target.value)}
          >
            <option value="">No panel — title from date and marker count</option>
            {panels.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          {panelId && <PanelSummary panel={panels.find((p) => p.id === panelId)!} />}
        </div>
        <DateField label="Sample date" name="manualSampleDate" value={sampleDate} onChange={setSampleDate} />

        <div className="flex flex-col gap-3">
          <p className="eyebrow">Results</p>
          {rows.map((row, i) => (
            <div key={i} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div className="sm:col-span-2">
                <Select
                  label={`Marker for row ${i + 1}`}
                  hideLabel
                  searchable
                  emptyMessage="No markers configured yet."
                  name={`marker-${i}`}
                  value={row.markerId}
                  onChange={(e) => {
                    const markerId = e.target.value;
                    updateRow(i, { markerId, unit: markerUnit(markerId) });
                    // Sex/age-specific catalogue range, as a starting point only — always
                    // editable, and only ever fills fields the admin hasn't already typed into.
                    if (markerId && patientId) {
                      void apiFetch<{ low: number; high: number; unit: string } | null>(
                        `/panels/markers/${markerId}/resolved-range?patientId=${patientId}`,
                      ).then((resolved) => {
                        if (!resolved) return;
                        updateRow(i, (current) =>
                          current.referenceLow === '' && current.referenceHigh === ''
                            ? { referenceLow: String(resolved.low), referenceHigh: String(resolved.high), unit: current.unit || resolved.unit }
                            : {},
                        );
                      });
                    }
                  }}
                >
                  <option value="">Select marker…</option>
                  {markers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </div>
              <input
                type="number"
                step="any"
                placeholder="Value"
                aria-label="Value"
                className="input-base tabular py-2"
                value={row.value}
                onChange={(e) => updateRow(i, { value: e.target.value })}
              />
              <input
                placeholder="Unit"
                aria-label="Unit"
                className="input-base py-2"
                value={row.unit}
                onChange={(e) => updateRow(i, { unit: e.target.value })}
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  step="any"
                  placeholder="Low"
                  aria-label="Reference range low"
                  className="input-base tabular py-2"
                  value={row.referenceLow}
                  onChange={(e) => updateRow(i, { referenceLow: e.target.value })}
                />
                <input
                  type="number"
                  step="any"
                  placeholder="High"
                  aria-label="Reference range high"
                  className="input-base tabular py-2"
                  value={row.referenceHigh}
                  onChange={(e) => updateRow(i, { referenceHigh: e.target.value })}
                />
              </div>
            </div>
          ))}
          <Button type="button" variant="ghost" className="self-start" onClick={() => setRows((rs) => [...rs, emptyRow()])}>
            + Add another marker
          </Button>
        </div>

        {implausible && implausible.length > 0 && (
          <Card className="border-status-high bg-white">
            <p className="font-medium text-espresso">These values look unusual — please double-check:</p>
            <ul className="mt-2 list-disc pl-5 text-sm text-espresso">
              {implausible.map((f, i) => (
                <li key={i}>
                  {f.markerName}: {f.reason}
                </li>
              ))}
            </ul>
            <Button type="button" variant="secondary" className="mt-4" onClick={() => void submit(true)} loading={submitting}>
              These are correct, save anyway
            </Button>
          </Card>
        )}

        {error && (
          <p role="alert" className="text-sm text-status-significantHigh">
            {error}
          </p>
        )}
        <Button type="submit" loading={submitting} className="self-start">
          {submitting ? 'Saving…' : 'Save entry'}
        </Button>
      </form>
    </Card>
  );
}

// Reports still open in the pipeline sort first — closest to release (most
// time-sensitive) first — then released reports trail behind, newest first.
// Mirrors the same "sorted by what's blocking them" ordering as the
// dashboard's awaiting-action queue (lib/reportStatus.ts).
function sortReports(reports: ReportRow[]): ReportRow[] {
  return reports.slice().sort((a, b) => {
    const aOpen = !a.voidedAt && a.status !== 'RELEASED';
    const bOpen = !b.voidedAt && b.status !== 'RELEASED';
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    if (aOpen && bOpen) {
      const stageDiff = stageIndex(b.status) - stageIndex(a.status);
      if (stageDiff !== 0) return stageDiff;
    }
    return b.sampleDate.localeCompare(a.sampleDate);
  });
}

export function AdminReportsPage() {
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [panels, setPanels] = useState<PanelOption[]>([]);
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [markers, setMarkers] = useState<MarkerOption[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get('status');

  async function loadAll() {
    const [p, pan, src, mk, r] = await Promise.all([
      apiFetch<PatientOption[]>('/admin/patients'),
      apiFetch<PanelOption[]>('/panels'),
      apiFetch<SourceOption[]>('/panels/sources'),
      apiFetch<MarkerOption[]>('/panels/markers'),
      apiFetch<ReportRow[]>('/reports'),
    ]);
    setPatients(p);
    setPanels(pan);
    setSources(src);
    setMarkers(mk);
    setReports(r);
  }

  useEffect(() => {
    void loadAll();
  }, []);

  const visibleReports = useMemo(() => {
    const sorted = sortReports(reports);
    return statusFilter ? sorted.filter((r) => r.status === statusFilter) : sorted;
  }, [reports, statusFilter]);

  return (
    <>
      <TwoTierHeading eyebrow="Aspire Clinic — Admin" title="Reports" />

      <div className="mt-8">
        <Tabs
          items={[
            {
              id: 'upload',
              label: 'Upload PDF',
              content: <PdfUploadForm patients={patients} panels={panels} sources={sources} onDone={loadAll} />,
            },
            {
              id: 'manual',
              label: 'Manual entry',
              content: <ManualEntryForm patients={patients} panels={panels} markers={markers} onDone={loadAll} />,
            },
          ]}
        />
      </div>

      <div className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="eyebrow">{statusFilter ? `Reports — ${statusLabel(statusFilter as ReportStatus)}` : 'All reports'}</p>
          {statusFilter && (
            <Button variant="ghost" onClick={() => setSearchParams({})}>
              Clear filter
            </Button>
          )}
        </div>
        <p className="mt-1 mb-4 text-xs text-espresso/60">
          Reports still moving through the pipeline are listed first, closest-to-release first — released reports
          trail behind, most recent first.
        </p>
        <div className="flex flex-col gap-3">
          {visibleReports.map((r, i) => (
            <Link
              key={r.id}
              to={`/admin/reports/${r.id}`}
              className="stagger-item motion-safe:animate-riseIn rounded-card"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <Card interactive className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-espresso">
                    {r.patient.patientProfile
                      ? `${r.patient.patientProfile.firstName} ${r.patient.patientProfile.lastName}`
                      : r.patient.email}{' '}
                    — {r.title}
                  </p>
                  <p className="text-sm text-espresso">
                    Sample date: {r.sampleDate.slice(0, 10)} · {r.source.name}
                  </p>
                </div>
                <span className="eyebrow">{r.voidedAt ? 'Voided' : statusLabel(r.status)}</span>
              </Card>
            </Link>
          ))}
          {visibleReports.length === 0 && <p className="text-espresso">No reports match.</p>}
        </div>
      </div>
    </>
  );
}
