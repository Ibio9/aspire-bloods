import { useEffect, useState } from 'react';
import type { ConsentType } from '@aspire-bloods/shared';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { apiFetch, ApiError } from '../../lib/api';

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
  const [consents, setConsents] = useState<ConsentStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [erasureRequested, setErasureRequested] = useState(false);

  async function load() {
    const data = await apiFetch<ConsentStatus[]>('/patient/me/consents');
    setConsents(data);
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleWithdraw(type: ConsentType) {
    setError(null);
    try {
      await apiFetch(`/patient/me/consents/${type}/withdraw`, { method: 'POST' });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    }
  }

  function handleExport() {
    window.open('/api/patient/me/export', '_blank');
  }

  async function handleErasureRequest() {
    setError(null);
    try {
      await apiFetch('/patient/me/erasure-request', { method: 'POST' });
      setErasureRequested(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    }
  }

  return (
    <main className="min-h-screen px-6 py-16 md:px-16 bg-cream">
      <TwoTierHeading eyebrow="Aspire Clinic — Patient Portal" title="Your account & privacy" />

      {error && <p className="mt-4 text-sm text-status-significantHigh">{error}</p>}

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
                  <Button variant="secondary" className="mt-2" onClick={() => handleWithdraw(c.type)}>
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
              <Button variant="destructive" className="mt-4" onClick={handleErasureRequest}>
                Request account deletion
              </Button>
            )}
          </Card>
        </div>
      </div>
    </main>
  );
}
