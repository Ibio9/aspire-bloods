import { useEffect, useState } from 'react';
import type { ConsentType } from '@aspire-bloods/shared';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { Modal } from '../../components/ui/Modal';
import { CopyButton } from '../../components/ui/CopyButton';
import { ThemeToggle } from '../../components/ui/ThemeToggle';
import { useToast } from '../../components/ui/Toast';
import { apiFetch, ApiError } from '../../lib/api';
import { downloadFromApi } from '../../lib/download';
import { useAuth } from '../../lib/AuthContext';
import { BiologicalSexCard } from './BiologicalSexCard';

interface ConsentStatus {
  type: ConsentType;
  granted: boolean;
  withdrawn: boolean;
  bodyText: string | null;
  grantedAt: string | null;
  withdrawnAt: string | null;
}

const CONSENT_LABEL: Record<ConsentType, string> = {
  DATA_PROCESSING: 'Data processing',
  RESULTS_STORAGE: 'Results storage',
  COMMS_EMAIL: 'Email communications',
  COMMS_SMS: 'SMS communications',
};

export function AccountPage() {
  const { user } = useAuth();
  const { show } = useToast();
  const [consents, setConsents] = useState<ConsentStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [erasureRequested, setErasureRequested] = useState(false);
  const [withdrawing, setWithdrawing] = useState<ConsentType | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState<ConsentType | null>(null);
  const [confirmErasure, setConfirmErasure] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function load() {
    const data = await apiFetch<ConsentStatus[]>('/patient/me/consents');
    setConsents(data);
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleWithdraw(type: ConsentType) {
    setError(null);
    setWithdrawing(type);
    try {
      await apiFetch(`/patient/me/consents/${type}/withdraw`, { method: 'POST' });
      await load();
      setConfirmWithdraw(null);
      show(`${CONSENT_LABEL[type]} consent withdrawn.`, 'success');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
      show('Could not withdraw consent. Please try again.', 'error');
    } finally {
      setWithdrawing(null);
    }
  }

  // A new tab pointed at an authenticated endpoint renders raw JSON when the
  // session has lapsed, under the clinic's own domain — and the toast said
  // "downloading" regardless of whether anything did. Fetched and saved, so a
  // failure is a failure the patient is told about.
  async function handleExport() {
    setExporting(true);
    try {
      await downloadFromApi('/api/patient/me/export', 'aspire-my-data.json');
      show('Your data export is downloading.');
    } catch (e) {
      show(e instanceof ApiError ? e.message : 'Could not prepare your data export. Please try again.', 'error');
    } finally {
      setExporting(false);
    }
  }

  async function handleErasureRequest() {
    setError(null);
    setErasing(true);
    try {
      await apiFetch('/patient/me/erasure-request', { method: 'POST' });
      setErasureRequested(true);
      setConfirmErasure(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
      show('Could not submit the deletion request. Please try again.', 'error');
    } finally {
      setErasing(false);
    }
  }

  return (
    <>
      <TwoTierHeading eyebrow="Aspire Clinic · Patient portal" title="Your account & privacy" />

      {user && (
        <p className="mt-5 flex items-center gap-1 text-sm text-espresso/80">
          Signed in as <span className="font-medium text-espresso">{user.email}</span>
          <CopyButton value={user.email} label="Copy email address" />
        </p>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-status-significantHigh">
          {error}
        </p>
      )}

      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <p className="eyebrow mb-4">Consent</p>
          <div className="flex flex-col gap-4">
            {consents === null && (
              <div aria-busy="true" aria-label="Loading your consent records" className="flex flex-col gap-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            )}
            {consents?.map((c) => (
              <div key={c.type} className="border-b border-taupe pb-4 last:border-b-0 last:pb-0">
                <p className="font-medium text-espresso">{CONSENT_LABEL[c.type]}</p>
                <p className="text-sm text-espresso">
                  {c.withdrawn ? 'Withdrawn' : c.granted ? 'Granted' : 'Not granted'}
                </p>
                {c.granted && !c.withdrawn && (
                  <Button variant="secondary" className="mt-2" onClick={() => setConfirmWithdraw(c.type)}>
                    Withdraw
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <p className="eyebrow mb-3">Appearance</p>
            <p className="text-sm text-espresso">
              Saved on this device, not to your account, so your phone and your computer can differ.
            </p>
            <ThemeToggle className="mt-4" />
          </Card>

          {/* Sits above the data/deletion cards because it's the one thing on
              this page that can be incomplete — and the only one where a gap
              has a clinical consequence rather than an administrative one.
              Renders as a plain "here's what we hold" card once it's set. */}
          <BiologicalSexCard variant="account" />

          <Card>
            <p className="eyebrow mb-3">Your data</p>
            <p className="text-sm text-espresso">
              Download everything we hold about you: your profile, results, consent history and account activity.
            </p>
            <Button variant="secondary" className="mt-4" loading={exporting} onClick={() => void handleExport()}>
              Download my data
            </Button>
          </Card>

          <Card>
            <p className="eyebrow mb-3">Delete my account</p>
            <p className="text-sm text-espresso">
              You can ask us to erase your personal data. Clinical results are retained for the period required by
              law; your personal details are removed from our records.
            </p>
            {erasureRequested ? (
              <p className="mt-4 text-sm text-espresso">
                Your request has been received. Our team will confirm next steps by email.
              </p>
            ) : (
              <Button variant="destructive" className="mt-4" onClick={() => setConfirmErasure(true)}>
                Request account deletion
              </Button>
            )}
          </Card>
        </div>
      </div>

      <Modal
        open={confirmWithdraw !== null}
        onClose={() => setConfirmWithdraw(null)}
        title="Withdraw consent?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmWithdraw(null)} disabled={withdrawing !== null}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={withdrawing !== null}
              onClick={() => confirmWithdraw && handleWithdraw(confirmWithdraw)}
            >
              {withdrawing ? 'Withdrawing…' : 'Withdraw consent'}
            </Button>
          </>
        }
      >
        {confirmWithdraw && (
          <p>
            You're about to withdraw consent for <strong>{CONSENT_LABEL[confirmWithdraw]}</strong>. We may no
            longer be able to provide parts of the portal without it.
          </p>
        )}
      </Modal>

      <Modal
        open={confirmErasure}
        onClose={() => setConfirmErasure(false)}
        title="Request account deletion?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmErasure(false)} disabled={erasing}>
              Cancel
            </Button>
            <Button variant="destructive" loading={erasing} onClick={handleErasureRequest}>
              {erasing ? 'Submitting…' : 'Request deletion'}
            </Button>
          </>
        }
      >
        <p>
          This starts erasing your personal details from our records. Clinical results are retained for the period
          required by law regardless. It can't be undone once our team has actioned it.
        </p>
      </Modal>
    </>
  );
}
