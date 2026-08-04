import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { TwoTierHeading } from '../../components/ui/TwoTierHeading';
import { apiFetch } from '../../lib/api';
import { RegistrationForm } from './RegistrationForm';

export function SignupPage() {
  const navigate = useNavigate();
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 py-16 bg-cream">
        <Card className="max-w-md text-center">
          <p className="text-espresso">Your account is ready. Redirecting you to sign in…</p>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-16 md:px-16 bg-cream">
      <div className="mx-auto max-w-2xl">
        <div className="mb-10">
          <TwoTierHeading eyebrow="Aspire Clinic" title="Create your account" />
          <p className="mt-4 max-w-prose text-espresso">
            A few details for our records, then set a password. You'll verify your email with a one-time code the
            first time you sign in.
          </p>
        </div>

        <RegistrationForm
          showEmailField
          submitLabel="Create account"
          submittingLabel="Creating account…"
          onSubmit={async ({ email, password, profile, consents }) => {
            await apiFetch('/auth/signup', {
              method: 'POST',
              body: JSON.stringify({ email, password, profile, consents }),
            });
            setDone(true);
            setTimeout(() => navigate('/login'), 2500);
          }}
        />
      </div>
    </main>
  );
}
