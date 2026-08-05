import { useEffect, useState } from 'react';
import type { ConsentType } from '@aspire-bloods/shared';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { Modal } from '../../components/ui/Modal';
import { CopyButton } from '../../components/ui/CopyButton';
import { useToast } from '../../components/ui/Toast';
import { AccountMenu } from '../../components/AccountMenu';
import { apiFetch, ApiError } from '../../lib/api';
import { API_BASE_URL } from '../../lib/apiBase';
import { useAuth } from '../../lib/AuthContext';

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
      show('Could not withdraw consent — please try again.', 'error');
    } finally {
      setWithdrawing(null);
    }
  }

  function handleExport() {
    window.open(`${API_BASE_URL}/api/patient/me/export`, '_blank');
    show('Your data export is downloading.');
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
      show('Could not submit the deletion request — please try again.', 'error');
    } finally {
      setErasing(false);
    }
  }

  return (
    <main className="min-h-screen px-6 py-16 md:px-16 bg-cream">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <TwoTierHeading eyebrow="Aspire Clinic — Patient Portal" title="Your account & privacy" />
        <AccountMenu links={[{ to: '/my-results', label: 'Your results' }]} />
      </div>

      {user && (
        <p className="mt-4 flex items-center gap-1 text-sm text-espresso/80">
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
              <>
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </>
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
            <p className="eyebrow mb-3">Your data</p>
            <p className="text-sm text-espresso">
              Download a full copy of everything we hold about you — your profile, results, consent history, and
              account activity.
            </p>
            <Button variant="secondary" className="mt-4" onClick={handleExport}>
              Download my data
            </Button>
          </Card>

          <Card>
            <p className="eyebrow mb-3">Delete my account</p>
            <p className="text-sm text-espresso">
              You can request that we erase your personal data. Clinical results are retained for the period
              required by law, but your personal details will be removed from our records.
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
            You're about to withdraw consent for <strong>{CONSENT_LABEL[confirmWithdraw]}</strong>. Depending on
            which consent this is, we may no longer be able to provide parts of the portal — you can review the
            detail above before continuing.
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
          This starts the process of erasing your personal details from our records. Clinical results are retained
          for the period required by law regardless of this request. This can't be undone once our team actions it.
        </p>
      </Modal>
    </main>
  );
}
