import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import { authErrorMessage } from '../../lib/authErrors';
import { AuthSplitLayout } from './AuthSplitLayout';
import { EmailCodeStep } from './EmailCodeStep';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { validateEmail } from '../../lib/validateEmail';

const EYEBROW = 'Aspire Clinic';
const HEADLINE = 'Confirm your email.';
const SUPPORTING =
  'A six-digit code to confirm this is your address, then a one-time code to set up two-factor sign-in.';

interface ResendResponse {
  sentTo?: string;
  expiresInMinutes?: number;
  cooldownSeconds?: number;
}

/**
 * The way back into an unfinished registration.
 *
 * Registration hands straight over to the code screen, so most people never
 * come here. This exists for the person who closed the tab, or whose code
 * expired while they were looking for it — without it, an account stuck in
 * PENDING_VERIFICATION would have no route out at all, since login() refuses
 * that state by design.
 *
 * There is no ?token= path any more. Verification is a code now, and leaving
 * a link route standing alongside it would mean two live ways to confirm the
 * same thing, only one of which anyone is being sent.
 */
export function VerifyEmailPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<ResendResponse | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      // Answers identically for an unknown address, an already-confirmed one,
      // and one genuinely waiting — so the copy on the next screen has to be
      // honest about that rather than claiming an email definitely went out.
      const result = await apiFetch<ResendResponse>('/auth/verify-email/resend', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSent(result);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <AuthSplitLayout eyebrow={EYEBROW} headline={HEADLINE} supporting={SUPPORTING}>
        <EmailCodeStep
          email={email}
          sentTo={sent.sentTo}
          expiresInMinutes={sent.expiresInMinutes}
          cooldownSeconds={sent.cooldownSeconds}
          footer={
            <p className="mt-[calc(var(--auth-step)*1.4)] text-sm text-espresso/80">
              Already confirmed?{' '}
              <Link to="/login" className="rounded-sm font-medium text-bronze underline underline-offset-2">
                Sign in
              </Link>
              .
            </p>
          }
        />
      </AuthSplitLayout>
    );
  }

  return (
    <AuthSplitLayout eyebrow={EYEBROW} headline={HEADLINE} supporting={SUPPORTING}>
      <p className="eyebrow mb-[calc(var(--auth-step)*0.6)]">Confirmation</p>
      <h2 className="auth-heading">Get a confirmation code</h2>
      <p className="mt-[var(--auth-step)] text-sm leading-relaxed text-espresso/80">
        Tell us the address you registered with and we'll send a fresh 6-digit code to it.
      </p>

      <form onSubmit={handleSubmit} className="mt-[calc(var(--auth-step)*1.6)] flex flex-col gap-[calc(var(--auth-step)*1.2)]" noValidate>
        <Input
          label="Email address"
          name="verifyEmail"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          validate={validateEmail}
        />
        {error && (
          <p role="alert" className="text-sm text-status-significantHigh">
            {error}
          </p>
        )}
        <Button type="submit" loading={sending} className="w-full">
          Send me a code
        </Button>
      </form>

      <p className="mt-[calc(var(--auth-step)*1.4)] text-sm text-espresso/80">
        Haven't registered yet?{' '}
        <Link to="/signup" className="rounded-sm font-medium text-bronze underline underline-offset-2">
          Create an account
        </Link>
        .
      </p>
    </AuthSplitLayout>
  );
}
