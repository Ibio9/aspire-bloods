import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { formatDate, formatDateTime } from '@aspire-bloods/shared';
import { Breadcrumbs } from '../../components/nav/Breadcrumbs';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from '../../components/ui/Table';
import { ConfirmModal } from '../../components/ui/ConfirmModal';
import { useToast } from '../../components/ui/Toast';
import { apiFetch, ApiError } from '../../lib/api';
import { recordPatientView } from '../../lib/recentPatients';

interface PatientProfileDetail {
  id: string;
  email: string;
  status: 'INVITED' | 'PENDING_VERIFICATION' | 'ACTIVE' | 'DISABLED';
  createdAt: string;
  deactivatedAt: string | null;
  deactivatedByName: string | null;
  deactivationReason: string | null;
  profile: {
    title: string | null;
    firstName: string;
    lastName: string;
    sex: string | null;
    dob: string;
    contactNumber: string;
    // Optional since self-registration — a patient who signed up themselves
    // has never been asked for these.
    address: string | null;
    postcode: string | null;
    gpName: string | null;
    gpAddress: string | null;
    medication: string | null;
    allergies: string | null;
    emergencyContactName: string | null;
    emergencyContactNumber: string | null;
  } | null;
}

interface ConsentRow {
  id: string;
  type: string;
  version: number;
  granted: boolean;
  createdAt: string;
  withdrawnAt: string | null;
}

interface ReportRow {
  id: string;
  status: string;
  sampleDate: string;
  voidedAt: string | null;
  panel: { name: string } | null;
  title: string;
}

interface AuditRow {
  id: string;
  action: string;
  actorName: string | null;
  actorEmail: string | null;
  ipAddress: string | null;
  createdAt: string;
}

type ModalKind = 'resend' | 'reset2fa' | 'deactivate' | 'reactivate' | 'erasure' | null;

export function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { show } = useToast();
  const [profile, setProfile] = useState<PatientProfileDetail | null>(null);
  const [consents, setConsents] = useState<ConsentRow[] | null>(null);
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [auditTrail, setAuditTrail] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** A failed load, as opposed to `error`, which is an action that failed. */
  const [loadError, setLoadError] = useState<unknown>(null);
  const [modal, setModal] = useState<ModalKind>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoadError(null);
    try {
      const [p, c, r, a] = await Promise.all([
        apiFetch<PatientProfileDetail>(`/admin/patients/${id}`),
        apiFetch<ConsentRow[]>(`/admin/patients/${id}/consents`),
        apiFetch<ReportRow[]>(`/admin/patients/${id}/reports`),
        apiFetch<{ total: number; entries: AuditRow[] }>(`/admin/patients/${id}/audit-trail?limit=25`),
      ]);
      setProfile(p);
      setConsents(c);
      setReports(r);
      setAuditTrail(a.entries);
      recordPatientView(id, p.profile ? `${p.profile.firstName} ${p.profile.lastName}` : p.email);
    } catch (e) {
      setLoadError(e);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadError != null) {
    return (
      <>
        <Breadcrumbs items={[{ label: 'Patients', to: '/admin/patients' }, { label: 'Not available' }]} />
        <div className="mt-8">
          <ErrorState
            error={loadError}
            subject="this patient"
            onRetry={() => void load()}
            backTo={{ to: '/admin/patients', label: 'Back to patients' }}
          />
        </div>
      </>
    );
  }

  if (!profile) {
    return (
      <div aria-busy="true" aria-label="Loading patient">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-3 h-9 w-64" />
        <Skeleton className="mt-8 h-64 w-full" />
      </div>
    );
  }

  const p = profile.profile;
  const name = p ? `${p.firstName} ${p.lastName}` : profile.email;

  async function runAction(fn: () => Promise<void>, successMessage: string) {
    setError(null);
    try {
      await fn();
      show(successMessage, 'success');
      setModal(null);
      await load();
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Something went wrong';
      setError(message);
      throw e;
    }
  }

  return (
    <>
      <Breadcrumbs items={[{ label: 'Patients', to: '/admin/patients' }, { label: name }]} />
      <TwoTierHeading eyebrow="Aspire Clinic · Clinician console" title={name} />

      {error && (
        <p role="alert" className="mt-4 text-sm text-status-significantHigh">
          {error}
        </p>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <p className="eyebrow mb-4">Profile</p>
          <p className="text-sm text-espresso">{profile.email}</p>
          <p className="mt-1 text-sm text-espresso/80">
            Status:{' '}
            {profile.deactivatedAt
              ? 'Deactivated'
              : profile.status === 'INVITED'
                ? 'Invited (not yet activated)'
                : // Self-registered and hasn't entered their confirmation code.
                  // Nothing for the practice to chase — the account simply
                  // can't sign in until they do.
                  profile.status === 'PENDING_VERIFICATION'
                  ? 'Registered (email not yet confirmed)'
                  : profile.status === 'DISABLED'
                    ? 'Erased'
                    : 'Active'}
          </p>
          {profile.deactivatedAt && (
            <p className="mt-1 text-sm text-espresso/80">
              Deactivated {formatDate(profile.deactivatedAt)} by {profile.deactivatedByName}
              {profile.deactivationReason ? `: “${profile.deactivationReason}”` : ''}
            </p>
          )}
          {p && (
            <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-espresso/80">Date of birth</dt>
                <dd className="text-espresso">{p.dob}</dd>
              </div>
              <div>
                <dt className="text-espresso/80">Sex</dt>
                <dd className="text-espresso">{p.sex ?? 'Not recorded'}</dd>
              </div>
              <div>
                <dt className="text-espresso/80">Contact number</dt>
                <dd className="text-espresso">{p.contactNumber}</dd>
              </div>
              <div>
                <dt className="text-espresso/80">Postcode</dt>
                <dd className="text-espresso">{p.postcode ?? 'Not given'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-espresso/80">Address</dt>
                <dd className="text-espresso">{p.address ?? 'Not given'}</dd>
              </div>
              <div>
                <dt className="text-espresso/80">GP</dt>
                <dd className="text-espresso">{p.gpName ?? 'Not recorded'}</dd>
              </div>
              <div>
                <dt className="text-espresso/80">GP address</dt>
                <dd className="text-espresso">{p.gpAddress ?? 'Not recorded'}</dd>
              </div>
              <div>
                <dt className="text-espresso/80">Medication</dt>
                <dd className="text-espresso">{p.medication ?? 'Not recorded'}</dd>
              </div>
              <div>
                <dt className="text-espresso/80">Allergies</dt>
                <dd className="text-espresso">{p.allergies ?? 'Not recorded'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-espresso/80">Emergency contact</dt>
                <dd className="text-espresso">
                  {p.emergencyContactName ?? 'Not recorded'} {p.emergencyContactNumber ? `(${p.emergencyContactNumber})` : ''}
                </dd>
              </div>
            </dl>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <p className="eyebrow mb-4">Actions</p>
            <div className="flex flex-wrap gap-3">
              {profile.status === 'INVITED' && (
                <Button variant="secondary" onClick={() => setModal('resend')}>
                  Resend invite
                </Button>
              )}
              {profile.status === 'ACTIVE' && !profile.deactivatedAt && (
                <>
                  <Button variant="secondary" onClick={() => setModal('reset2fa')}>
                    Reset two-factor authentication
                  </Button>
                  <Button variant="destructive" onClick={() => setModal('deactivate')}>
                    Deactivate account
                  </Button>
                </>
              )}
              {profile.deactivatedAt && (
                <Button variant="secondary" onClick={() => setModal('reactivate')}>
                  Reactivate account
                </Button>
              )}
              {profile.status !== 'DISABLED' && (
                <Button variant="destructive" onClick={() => setModal('erasure')}>
                  Initiate GDPR erasure
                </Button>
              )}
            </div>
          </Card>

          <Card>
            <p className="eyebrow mb-4">Consent</p>
            {consents === null ? (
              <Skeleton className="h-16 w-full" />
            ) : consents.length === 0 ? (
              <p className="text-sm text-espresso/80">No consent records yet.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {consents.map((c) => (
                  <li key={c.id} className="flex items-center justify-between border-b border-taupe pb-2 last:border-b-0">
                    <span className="text-espresso">{c.type.replace(/_/g, ' ')}</span>
                    <span className="text-espresso/80">
                      {c.withdrawnAt ? `Withdrawn ${formatDate(c.withdrawnAt)}` : c.granted ? 'Granted' : 'Not granted'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <p className="eyebrow mb-4">Result history</p>
        {reports === null ? (
          <Skeleton className="h-24 w-full" />
        ) : reports.length === 0 ? (
          <p className="text-sm text-espresso/80">No reports for this patient yet.</p>
        ) : (
          <div>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Sample date</TableHeaderCell>
                  <TableHeaderCell>Panel</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reports.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular">{formatDate(r.sampleDate)}</TableCell>
                    <TableCell>
                      <Link to={`/admin/reports/${r.id}`} className="font-medium text-bronze-600 underline underline-offset-2">
                        {r.title}
                      </Link>
                    </TableCell>
                    <TableCell>{r.voidedAt ? 'Voided' : r.status.replace(/_/g, ' ')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <p className="eyebrow mb-4">Audit trail</p>
        {auditTrail === null ? (
          <Skeleton className="h-24 w-full" />
        ) : auditTrail.length === 0 ? (
          <p className="text-sm text-espresso/80">No activity recorded yet.</p>
        ) : (
          <div>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>When</TableHeaderCell>
                  <TableHeaderCell>Action</TableHeaderCell>
                  <TableHeaderCell>By</TableHeaderCell>
                  <TableHeaderCell>IP</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {auditTrail.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="tabular">{formatDateTime(a.createdAt)}</TableCell>
                    <TableCell>{a.action.replace(/_/g, ' ')}</TableCell>
                    <TableCell>{a.actorName ?? 'System'}</TableCell>
                    <TableCell className="tabular">{a.ipAddress ?? 'Not recorded'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <ConfirmModal
        open={modal === 'resend'}
        onClose={() => setModal(null)}
        title="Resend invite?"
        variant="primary"
        confirmLabel="Resend invite"
        onConfirm={() =>
          runAction(async () => {
            await apiFetch(`/admin/patients/${id}/resend-invite`, { method: 'POST' });
          }, 'Invite resent.')
        }
      >
        <p>
          Sends a fresh activation link to <strong>{profile.email}</strong>. The previous link (if any) still works
          until it expires.
        </p>
      </ConfirmModal>

      <ConfirmModal
        open={modal === 'reset2fa'}
        onClose={() => setModal(null)}
        title="Reset two-factor authentication?"
        variant="primary"
        confirmLabel="Reset two-factor authentication"
        onConfirm={() =>
          runAction(async () => {
            await apiFetch(`/admin/patients/${id}/reset-2fa`, { method: 'POST' });
          }, '2FA reset. Trusted devices revoked.')
        }
      >
        <p>
          Revokes every device this account has trusted to skip 2FA. {name} will need to verify a fresh code by
          email the next time they sign in. Use this if they’ve lost a trusted device or think one may be
          compromised.
        </p>
      </ConfirmModal>

      <ConfirmModal
        open={modal === 'deactivate'}
        onClose={() => setModal(null)}
        title="Deactivate this account?"
        requireReason
        reasonLabel="Reason (kept in the audit log)"
        confirmLabel="Deactivate"
        confirmingLabel="Deactivating…"
        onConfirm={(reason) =>
          runAction(async () => {
            await apiFetch(`/admin/patients/${id}/deactivate`, { method: 'POST', body: JSON.stringify({ reason }) });
          }, 'Account deactivated.')
        }
      >
        <p>
          <strong>{name}</strong> will no longer be able to sign in, and any session in progress ends immediately.
          All their data is retained untouched, and you can reactivate the account at any time.
        </p>
      </ConfirmModal>

      <ConfirmModal
        open={modal === 'reactivate'}
        onClose={() => setModal(null)}
        title="Reactivate this account?"
        variant="primary"
        confirmLabel="Reactivate"
        onConfirm={() =>
          runAction(async () => {
            await apiFetch(`/admin/patients/${id}/reactivate`, { method: 'POST' });
          }, 'Account reactivated.')
        }
      >
        <p>
          <strong>{name}</strong> will be able to sign in again immediately.
        </p>
      </ConfirmModal>

      <ConfirmModal
        open={modal === 'erasure'}
        onClose={() => setModal(null)}
        title="Initiate GDPR erasure?"
        confirmLabel="Initiate erasure"
        confirmingLabel="Submitting…"
        onConfirm={() =>
          runAction(async () => {
            await apiFetch(`/admin/patients/${id}/erasure`, { method: 'POST' });
          }, 'Erasure request created. Schedule it from the erasure requests queue when ready.')
        }
      >
        <p>
          Starts erasing <strong>{name}</strong>'s personal details from our records. This creates a request that
          still needs scheduling before anything is purged.
        </p>
        <p className="mt-3">
          <strong>Clinical results are never deleted by this.</strong> They’re retained for the period required by
          law. Only the patient’s personal and contact details are de-identified once the purge runs.
        </p>
      </ConfirmModal>
    </>
  );
}
