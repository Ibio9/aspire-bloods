import { useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Wordmark } from '../../components/Wordmark';
import { apiFetch } from '../../lib/api';
import { AuthSplitLayout } from './AuthSplitLayout';
import { RegistrationForm } from './RegistrationForm';

const EYEBROW = 'New patient';
const HEADLINE = "Let's get your account set up.";
const SUPPORTING = 'A few details for our records, then set a password to finish setting up your portal account.';

/** Full-bleed dark screen for the token-missing / done states — no form column to split
 * against, so the wordmark and message float centred on the same deep interior treatment. */
function DarkMessageScreen({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-espresso via-espresso to-ink-deep px-6 py-16">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '28px 28px',
        }}
        aria-hidden="true"
      />
      <div className="relative flex w-full max-w-md flex-col items-center gap-8 motion-safe:animate-riseIn">
        <Wordmark variant="dark" size="lg" />
        <Card className="w-full text-center">{children}</Card>
      </div>
    </main>
  );
}

export function ActivatePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const inviteToken = params.get('token') ?? '';
  const [done, setDone] = useState(false);

  if (!inviteToken) {
    return (
      <DarkMessageScreen>
        <p className="text-espresso">This activation link is missing its invite token.</p>
      </DarkMessageScreen>
    );
  }

  if (done) {
    return (
      <DarkMessageScreen>
        <p className="text-espresso">Your account is active. Redirecting you to sign in…</p>
      </DarkMessageScreen>
    );
  }

  return (
    <AuthSplitLayout eyebrow={EYEBROW} headline={HEADLINE} supporting={SUPPORTING} wide>
      <p className="eyebrow mb-2">Account activation</p>
      <h2 className="font-display text-4xl leading-tight text-espresso">Activate your account</h2>
      <p className="mt-3 max-w-prose text-sm text-espresso/80">{SUPPORTING}</p>

      <div className="mt-8">
        <RegistrationForm
          submitLabel="Activate account"
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
    </AuthSplitLayout>
  );
}
