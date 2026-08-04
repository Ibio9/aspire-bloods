import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { apiFetch, ApiError } from '../../lib/api';

interface PatientOption {
  id: string;
  email: string;
  status: string;
  displayName: string;
}

interface PanelOption {
  id: string;
  name: string;
}

interface ReportRow {
  id: string;
  status: string;
  sampleDate: string;
  panel: { name: string };
  patient: { email: string; patientProfile: { firstName: string; lastName: string } | null };
}

function readCsrfCookie(): string {
  const match = document.cookie.match(/(?:^|; )csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export function AdminReportsPage() {
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [panels, setPanels] = useState<PanelOption[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [patientId, setPatientId] = useState('');
  const [panelId, setPanelId] = useState('');
  const [sampleDate, setSampleDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadAll() {
    const [p, pan, r] = await Promise.all([
      apiFetch<PatientOption[]>('/admin/patients'),
      apiFetch<PanelOption[]>('/panels'),
      apiFetch<ReportRow[]>('/reports'),
    ]);
    setPatients(p);
    setPanels(pan);
    setReports(r);
  }

  useEffect(() => {
    void loadAll();
  }, []);

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
      formData.append('sampleDate', sampleDate);
      formData.append('file', file);

      const res = await fetch('/api/reports', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': readCsrfCookie() },
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ApiError(body.error ?? 'Upload failed', res.status);
      }
      setFile(null);
      setPatientId('');
      setPanelId('');
      setSampleDate('');
      await loadAll();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen px-6 py-16 md:px-16 bg-cream">
      <TwoTierHeading eyebrow="Aspire Clinic — Admin" title="Reports" />

      <Card className="mt-8 max-w-2xl">
        <p className="eyebrow mb-4">Upload a new report</p>
        <form onSubmit={handleUpload} className="flex flex-col gap-5">
          <Select label="Patient" name="patientId" value={patientId} onChange={(e) => setPatientId(e.target.value)}>
            <option value="">Select a patient…</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName} ({p.email})
              </option>
            ))}
          </Select>
          <Select label="Panel" name="panelId" value={panelId} onChange={(e) => setPanelId(e.target.value)}>
            <option value="">Select a panel…</option>
            {panels.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Input
            label="Sample date"
            name="sampleDate"
            type="date"
            value={sampleDate}
            onChange={(e) => setSampleDate(e.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-espresso">Randox PDF report</label>
            <input
              type="file"
              accept="application/pdf"
              required
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm text-espresso file:mr-3 file:rounded-full file:border-0 file:bg-bronze file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-bronze-600"
            />
          </div>
          {error && <p className="text-sm text-status-significantHigh">{error}</p>}
          <Button type="submit" loading={submitting} className="self-start">
            Upload
          </Button>
        </form>
      </Card>

      <div className="mt-10">
        <p className="eyebrow mb-4">All reports</p>
        <div className="flex flex-col gap-3">
          {reports.map((r, i) => (
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
                    — {r.panel.name}
                  </p>
                  <p className="text-sm text-espresso">Sample date: {r.sampleDate.slice(0, 10)}</p>
                </div>
                <span className="eyebrow">{r.status.replace(/_/g, ' ')}</span>
              </Card>
            </Link>
          ))}
          {reports.length === 0 && <p className="text-espresso">No reports yet.</p>}
        </div>
      </div>
    </main>
  );
}
