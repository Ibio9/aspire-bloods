import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { apiFetch } from '../../lib/api';
import { RegistrationForm } from './RegistrationForm';

export function ActivatePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const inviteToken = params.get('token') ?? '';
  const [done, setDone] = useState(false);

  if (!inviteToken) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 py-16 bg-cream">
        <p className="text-espresso">This activation link is missing its invite token.</p>
      </main>
    );
  }

  if (done) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 py-16 bg-cream">
        <Card className="max-w-md text-center">
          <p className="text-espresso">Your account is active. Redirecting you to sign in…</p>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-16 md:px-16 bg-cream">
      <div className="mx-auto max-w-2xl">
        <div className="mb-10">
          <TwoTierHeading eyebrow="Aspire Clinic" title="Activate your account" />
          <p className="mt-4 max-w-prose text-espresso">
            A few details for our records, then set a password to finish setting up your portal account.
          </p>
        </div>

        <RegistrationForm
          submitLabel="Activate account"
          submittingLabel="Activating…"
          onSubmit={async ({ password, profile, consents }) => {
            await apiFetch('/auth/activate', {
              method: 'POST',
              body: JSON.stringify({ inviteToken, password, profile, consents }),
            });
            setDone(true);
            setTimeout(() => navigate('/login'), 2500);
          }}
        />
      </div>
    </main>
  );
}
