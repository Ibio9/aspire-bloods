import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import { AuthSplitLayout } from './AuthSplitLayout';
import { RegistrationForm } from './RegistrationForm';

const ACTIVATE_EYEBROW = 'Aspire Clinic';
const ACTIVATE_HEADLINE = 'Activate your account.';
const ACTIVATE_SUPPORTING =
  'You were invited by the clinic. Set up your details once and your results are waiting the moment they land.';

/**
 * Activation is an auth screen like the other three, so it uses the same
 * split shell rather than its own centred-page layout — same left panel,
 * same viewport-fit behaviour, same card.
 */
export function ActivatePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const inviteToken = params.get('token') ?? '';
  const [done, setDone] = useState(false);

  if (!inviteToken) {
    return (
      <AuthSplitLayout eyebrow={ACTIVATE_EYEBROW} headline={ACTIVATE_HEADLINE} supporting={ACTIVATE_SUPPORTING}>
        <p className="eyebrow mb-[calc(var(--auth-step)*0.6)]">Activation</p>
        <h2 className="auth-heading">This link is incomplete</h2>
        <p className="mt-[var(--auth-step)] text-sm leading-relaxed text-espresso/80">
          The activation link is missing its invite token. Open the link in your invitation email again, or ask
          the clinic to resend it.
        </p>
      </AuthSplitLayout>
    );
  }

  if (done) {
    return (
      <AuthSplitLayout eyebrow={ACTIVATE_EYEBROW} headline={ACTIVATE_HEADLINE} supporting={ACTIVATE_SUPPORTING}>
        <p className="eyebrow mb-[calc(var(--auth-step)*0.6)]">All set</p>
        <h2 className="auth-heading">Your account is active</h2>
        <p className="mt-[var(--auth-step)] text-sm leading-relaxed text-espresso/80" role="status">
          Taking you to sign in…
        </p>
      </AuthSplitLayout>
    );
  }

  return (
    <AuthSplitLayout eyebrow={ACTIVATE_EYEBROW} headline={ACTIVATE_HEADLINE} supporting={ACTIVATE_SUPPORTING} wide>
      <p className="eyebrow mb-[calc(var(--auth-step)*0.6)]">Aspire Clinic</p>
      <h2 className="auth-heading">Activate your account</h2>
      <p className="mt-[var(--auth-step)] max-w-prose text-sm leading-relaxed text-espresso/80">
        A few details for our records, then set a password to finish setting up your portal account.
      </p>

      <div className="mt-[calc(var(--auth-step)*1.6)]">
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
