import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { formatDate } from '@aspire-bloods/shared';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { ErrorState } from '../../components/ui/ErrorState';
import { FileDropzone } from '../../components/ui/FileDropzone';
import { DateField } from '../../components/ui/DateField';
import { Tabs } from '../../components/ui/Tabs';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { apiFetch, ApiError, extractErrorMessage } from '../../lib/api';
import { API_BASE_URL } from '../../lib/apiBase';
import { statusLabel, stageIndex, type ReportStatus } from '../../lib/reportStatus';
import { staggerDelay } from '../../components/motion/stagger';

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
// (Core, Insight 360, Signature). Nobody outside the lab knows
// that word, so every picker that offers one spells it out: how many
// markers, and a few by name, right under the field the moment one's picked.
function PanelSummary({ panel }: { panel: PanelOption }) {
  const count = panel.markers.length;
  if (count === 0) return null;
  const examples = panel.markers.slice(0, 4).map((pm) => pm.marker.name);
  const more = count - examples.length;
  return (
    <p className="text-xs text-espresso/80">
      {count} marker{count === 1 ? '' : 's'}: {examples.join(', ')}
      {more > 0 ? `, +${more} more` : ''}
    </p>
  );
}

// A blank dropdown looks identical to a bug. Wherever a picker depends on
// data that might not exist yet, it says which data is missing and links
// straight to the page that creates it — a dead end otherwise.
function ConfigureLink({ what }: { what: 'panels' | 'markers' | 'sources' }) {
  // Sources have no screen of their own (they are seeded, and added over the
  // API); panels and markers each land on the page that actually creates them.
  const destination = what === 'panels' ? { to: '/admin/panels', label: 'add one under Panels' } : { to: '/admin/markers', label: 'add one in the Marker library' };
  return (
    <>
      No {what} configured yet.{' '}
      <Link to={destination.to} className="font-medium text-bronze underline underline-offset-2">
        {destination.label}
      </Link>
      .
    </>
  );
}

function InvitePatientLink() {
  return (
    <>
      No patients yet.{' '}
      <Link to="/admin/patients" className="font-medium text-bronze underline underline-offset-2">
        invite one from the Patients page
      </Link>{' '}
      first.
    </>
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
  /** Composed server-side — carries the marker-count fallback the list payload can't derive. */
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
  // 'none' rather than '' — the Select component treats a "" option as a
  // non-real placeholder and disables the field when nothing else is
  // configured, but "no panel" must stay a genuine, always-pickable choice.
  const [panelId, setPanelId] = useState('none');
  const [sourceId, setSourceId] = useState('');
  const [sampleDate, setSampleDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

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
      if (panelId !== 'none') formData.append('panelId', panelId);
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
      const created = (await res.json()) as { id: string; parse?: unknown };
      setFile(null);
      setPatientId('');
      setPanelId('none');
      setSourceId('');
      setSampleDate('');
      onDone();
      // The server already parsed this on upload. Going straight to the
      // report with that parse in hand is what collapses "upload, come back,
      // find it in the list, open it, press parse" into one step — and it
      // carries the extraction across so the same PDF isn't read twice.
      navigate(`/admin/reports/${created.id}`, { state: { parse: created.parse ?? undefined } });
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
          emptyMessage={<InvitePatientLink />}
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
            hint="A bundle of markers run on one sample — Core, Insight 360 or Signature. Leave it on individual markers for a one-off test."
            name="panelId"
            emptyMessage={<ConfigureLink what="panels" />}
            value={panelId}
            onChange={(e) => setPanelId(e.target.value)}
          >
            <option value="none">No panel, individual markers</option>
            {panels.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          {/* 'none' is a real selection, not an empty one — guard on the sentinel
              rather than truthiness, and on the lookup, so an ad-hoc report never
              tries to summarise a panel that isn't there. */}
          {panelId !== 'none' && panels.some((p) => p.id === panelId) && (
            <PanelSummary panel={panels.find((p) => p.id === panelId)!} />
          )}
        </div>
        <Select
          label="Where was this analysed?"
          name="sourceId"
          emptyMessage={<ConfigureLink what="sources" />}
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
        <DateField label="Sample date" name="sampleDate" preset="recent-past" value={sampleDate} onChange={setSampleDate} />
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
  const [panelId, setPanelId] = useState('none');
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
        body: JSON.stringify({
          patientId,
          panelId: panelId === 'none' ? null : panelId,
          sampleDate,
          results,
          confirmed,
        }),
      });
      if (result.status === 'confirmation_required') {
        setImplausible(result.implausible);
        return;
      }
      setImplausible(null);
      setPatientId('');
      setPanelId('none');
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
          For Aspire's own in-house testing. It goes through the same verify-and-release process as everything else.
        </p>
        <Select
          label="Patient"
          name="manualPatientId"
          searchable
          emptyMessage={<InvitePatientLink />}
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
            hint="A bundle of markers run on one sample — Core, Insight 360 or Signature. Leave it on individual markers for a one-off test."
            name="manualPanelId"
            emptyMessage={<ConfigureLink what="panels" />}
            value={panelId}
            onChange={(e) => setPanelId(e.target.value)}
          >
            <option value="none">No panel, individual markers</option>
            {panels.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          {panelId !== 'none' && panels.some((p) => p.id === panelId) && (
            <PanelSummary panel={panels.find((p) => p.id === panelId)!} />
          )}
        </div>
        <DateField label="Sample date" name="manualSampleDate" preset="recent-past" value={sampleDate} onChange={setSampleDate} />
        {markers.length === 0 && (
          <p className="text-sm text-espresso/80">
            No markers configured yet.{' '}
            <Link to="/admin/markers" className="underline underline-offset-2">add one</Link> in the Marker library before entering results.
          </p>
        )}

        <div className="flex flex-col gap-3">
          <p className="eyebrow">Results</p>
          {rows.map((row, i) => (
            <div key={i} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div className="sm:col-span-2">
                <Select
                  label={`Marker for row ${i + 1}`}
                  hideLabel
                  searchable
                  emptyMessage={<ConfigureLink what="markers" />}
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
            <p className="font-medium text-espresso">These values look unusual. Please double-check:</p>
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
  // Null until the first load resolves. Starting at [] made the very first
  // paint render the "No reports yet" empty state (and every Select's
  // "no patients yet" hint) for as long as the fetch took — a confidently
  // wrong screen that then flipped to the real one.
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  // Five requests behind one Promise.all: any one of them rejecting used to
  // leave the skeleton up for ever and throw unhandled. This is the screen the
  // clinic's staff spend their morning on.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get('status');
  const [query, setQuery] = useState('');

  const loadAll = useCallback(async () => {
    setLoadError(null);
    try {
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
    } catch (e) {
      setLoadError(e);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  /**
   * The stages this practice's reports are actually in, with counts, ordered
   * along the pipeline. Derived rather than listed, so the picker can never
   * offer a filter that returns nothing — and so CHANGES_REQUESTED appears
   * when it applies without being a sixth stage in PIPELINE_STAGES, which it
   * is deliberately not.
   */
  const stageOptions = useMemo(() => {
    const counts = new Map<ReportStatus, number>();
    for (const r of reports ?? []) {
      if (r.voidedAt) continue;
      counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => stageIndex(a.status) - stageIndex(b.status));
  }, [reports]);

  const visibleReports = useMemo(() => {
    const sorted = sortReports(reports ?? []);
    const byStatus = statusFilter ? sorted.filter((r) => r.status === statusFilter) : sorted;
    // Name, email and the report's own title. The admin looking for "the one I
    // uploaded for Mrs Okafor this morning" was previously scrolling a flat
    // list of every report the practice has ever produced to find it.
    const q = query.trim().toLowerCase();
    if (!q) return byStatus;
    return byStatus.filter((r) => {
      const name = r.patient.patientProfile
        ? `${r.patient.patientProfile.firstName} ${r.patient.patientProfile.lastName}`
        : '';
      return (
        name.toLowerCase().includes(q) ||
        r.patient.email.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q)
      );
    });
  }, [reports, statusFilter, query]);

  function setStatusFilter(next: string) {
    setSearchParams(next ? { status: next } : {}, { replace: true });
  }

  return (
    <>
      <TwoTierHeading eyebrow="Aspire Clinic · Admin console" title="Reports" />

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
          <p className="eyebrow">{statusFilter ? `Reports · ${statusLabel(statusFilter as ReportStatus)}` : 'All reports'}</p>
          {(statusFilter || query) && (
            <Button
              variant="ghost"
              onClick={() => {
                setStatusFilter('');
                setQuery('');
              }}
            >
              Clear filter
            </Button>
          )}
        </div>
        <p className="mt-1 text-xs text-espresso/80">
          Still in the pipeline first, closest to release; released reports follow, most recent first.
        </p>

        {/* The status filter existed but had no control: it could only be set
            by following a link from the dashboard, and only cleared here. On a
            Monday morning the question is "what needs verifying", and the
            answer was several screens of scrolling past everything already
            released. Counts on the options, so a filter that would return
            nothing is visibly one that would return nothing. */}
        <div className="mb-4 mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:max-w-3xl">
          <Input
            label="Find a report"
            name="report-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Patient name, email or panel…"
            required={false}
          />
          <Select label="Stage" name="report-status" value={statusFilter ?? ''} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All stages ({(reports ?? []).length})</option>
            {stageOptions.map(({ status, count }) => (
              <option key={status} value={status}>
                {statusLabel(status)} ({count})
              </option>
            ))}
          </Select>
        </div>
        {reports !== null && (
          <p className="mb-4 text-sm text-espresso/80" role="status">
            {visibleReports.length === (reports ?? []).length
              ? `${visibleReports.length} report${visibleReports.length === 1 ? '' : 's'}`
              : `${visibleReports.length} of ${reports.length} reports`}
          </p>
        )}

        {loadError != null && (
          <ErrorState error={loadError} subject="the report queue" onRetry={() => void loadAll()} />
        )}
        {reports === null && !loadError && (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading reports">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} padding="tight">
                <Skeleton className="h-5 w-72" />
                <Skeleton className="mt-2 h-4 w-56" />
              </Card>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-3">
          {visibleReports.map((r, i) => (
            <Link
              key={r.id}
              to={`/admin/reports/${r.id}`}
              className="stagger-item motion-safe:animate-riseIn rounded-card"
              // Capped. Uncapped at 30ms a step, the 66th report on this
              // practice's list appeared two seconds late and a list of a few
              // hundred — which this becomes — would have left its tail blank
              // for a minute. staggerDelay is the shared cap the patient-side
              // lists already use.
              style={{ animationDelay: `${staggerDelay(i, 30)}ms` }}
            >
              <Card interactive className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-espresso">
                    {r.patient.patientProfile
                      ? `${r.patient.patientProfile.firstName} ${r.patient.patientProfile.lastName}`
                      : r.patient.email}{' '}
                    · {r.title}
                  </p>
                  <p className="text-sm text-espresso">
                    Sample date: {formatDate(r.sampleDate)} · {r.source.name}
                  </p>
                </div>
                <span className="eyebrow">{r.voidedAt ? 'Voided' : statusLabel(r.status)}</span>
              </Card>
            </Link>
          ))}
          {/* Two different nothings: no reports exist at all, versus reports
              exist but none survive the current filter. They need different
              wording — telling someone to upload their first report when they
              have forty and a filter applied is just wrong. */}
          {reports !== null &&
            (reports.length === 0 ? (
              <EmptyState
                title="No reports yet"
                description="Upload a PDF or enter results manually above once a patient exists."
              />
            ) : (
              visibleReports.length === 0 && <p className="text-sm text-espresso/80">No reports match.</p>
            ))}
        </div>
      </div>
    </>
  );
}
