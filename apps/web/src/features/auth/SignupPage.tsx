import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import { authErrorMessage } from '../../lib/authErrors';
import { RegistrationForm } from './RegistrationForm';
import { AuthSplitLayout } from './AuthSplitLayout';
import { Button } from '../../components/ui/Button';

const EYEBROW = 'Aspire Clinic';
const HEADLINE = 'Create your account.';
const SUPPORTING =
  'Set up your portal in a minute. Your results appear here once the clinic has matched them to you. Nothing is published until a clinician has reviewed it.';

interface SignupResponse {
  status: string;
  sentTo?: string;
  expiresInHours?: number;
}

/**
 * Open registration. Invitation-only was the wrong shape for this practice,
 * so anyone can create an account here — and it deliberately does not feel
 * guarded, because there is nothing to guard: a new account is an empty
 * account, holding no clinical data at all until the clinic links results to
 * it. No approval, no queue, no "we'll be in touch".
 *
 * Invites still work in parallel for patients the practice adds directly —
 * those land on /activate with the fuller registration form.
 *
 * The flow is registration → confirm your email → 2FA → signed in, and this
 * page owns only the first two screens. Verification is what moves the
 * account out of PENDING_VERIFICATION, and the emailed link is what starts
 * 2FA enrolment (see VerifyEmailPage) — so there is no way to end up with a
 * working account that skipped either step.
 */
export function SignupPage() {
  const [sent, setSent] = useState<SignupResponse | null>(null);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [resendError, setResendError] = useState<string | null>(null);
  const [email, setEmail] = useState('');

  async function handleResend() {
    setResendState('sending');
    setResendError(null);
    try {
      await apiFetch('/auth/verify-email/resend', { method: 'POST', body: JSON.stringify({ email }) });
      setResendState('sent');
    } catch (e) {
      setResendError(authErrorMessage(e));
      setResendState('failed');
    }
  }

  if (sent) {
    return (
      <AuthSplitLayout eyebrow={EYEBROW} headline={HEADLINE} supporting={SUPPORTING}>
        <p className="eyebrow mb-[calc(var(--auth-step)*0.6)]">Almost there</p>
        <h2 className="auth-heading">Confirm your email</h2>
        <p className="mt-[var(--auth-step)] text-sm leading-relaxed text-espresso/80">
          We've sent a link to <span className="font-medium text-espresso">{sent.sentTo ?? 'your email address'}</span>.
          Open it to activate your account. We'll then send a one-time code to finish setting up two-factor
          sign-in.
        </p>
        {sent.expiresInHours && (
          <p className="mt-[calc(var(--auth-step)*0.75)] text-sm text-espresso/70">
            The link is good for {sent.expiresInHours} hours.
          </p>
        )}

        <div className="mt-[calc(var(--auth-step)*1.6)] border-t border-taupe pt-[calc(var(--auth-step)*1.2)]">
          <p className="text-sm text-espresso/80">Didn't get it? Check your junk folder first, then:</p>
          <div className="mt-[calc(var(--auth-step)*0.75)] flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button variant="secondary" onClick={handleResend} loading={resendState === 'sending'}>
              Send the link again
            </Button>
            {resendState === 'sent' && (
              <span role="status" className="text-sm text-espresso/70">
                Sent. It can take a minute to arrive.
              </span>
            )}
          </div>
          {resendError && (
            <p role="alert" className="mt-3 text-sm text-status-significantHigh">
              {resendError}
            </p>
          )}
        </div>

        <p className="mt-[calc(var(--auth-step)*1.4)] text-sm text-espresso/80">
          Already confirmed?{' '}
          <Link to="/login" className="rounded-sm font-medium text-bronze underline underline-offset-2 hover:text-bronze-700">
            Sign in
          </Link>
        </p>
      </AuthSplitLayout>
    );
  }

  return (
    <AuthSplitLayout eyebrow={EYEBROW} headline={HEADLINE} supporting={SUPPORTING} wide>
      <p className="eyebrow mb-[calc(var(--auth-step)*0.6)]">Patient portal</p>
      <h2 className="auth-heading">Create an account</h2>
      <p className="mt-[var(--auth-step)] max-w-prose text-sm leading-relaxed text-espresso/80">
        Anyone can register. You don't need an invitation. We'll confirm your email address, then set up
        two-factor sign-in. Your date of birth and contact number are how the clinic makes sure a result is
        yours before it's added to your account.
      </p>

      <div className="mt-[calc(var(--auth-step)*1.6)]">
        <RegistrationForm
          showEmailField
          variant="signup"
          submitLabel="Create account"
          onSubmit={async ({ email: submittedEmail, password, profile, consents }) => {
            const result = await apiFetch<SignupResponse>('/auth/signup', {
              method: 'POST',
              body: JSON.stringify({ email: submittedEmail, password, profile, consents }),
            });
            setEmail(submittedEmail ?? '');
            setSent(result);
          }}
        />
      </div>

      <p className="mt-[calc(var(--auth-step)*1.4)] text-sm text-espresso/80">
        Already have an account?{' '}
        <Link to="/login" className="rounded-sm font-medium text-bronze underline underline-offset-2 hover:text-bronze-700">
          Sign in
        </Link>
      </p>
    </AuthSplitLayout>
  );
}
